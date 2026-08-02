import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFParse } from 'pdf-parse';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Helper to load .env.local file if present
function loadEnvLocal() {
  const envPath = path.join(projectRoot, '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          const val = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
          if (!process.env[key.trim()]) {
            process.env[key.trim()] = val;
          }
        }
      }
    });
  }
}

loadEnvLocal();

// Parse Command Line Arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    file: '',
    apiKey: process.env.OPENROUTER_API_KEY || '',
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    skipAiClean: false,
    concurrency: 5,
  };

  args.forEach((arg) => {
    if (arg.startsWith('--file=')) options.file = arg.split('=')[1];
    if (arg.startsWith('--key=')) options.apiKey = arg.split('=')[1];
    if (arg.startsWith('--skip-ai')) options.skipAiClean = true;
    if (arg.startsWith('--concurrency=')) {
      const val = arg.split('=')[1];
      options.concurrency = val === 'all' ? 119 : parseInt(val, 10);
    }
  });

  return options;
}

// Cost-conscious models for large chapter cleanup
const AI_MODELS_TIERS = [
  { name: 'GPT-4o Mini (Fast & Accurate)', slug: 'openai/gpt-4o-mini' },
  { name: 'Gemini 2.5 Flash (Long Context)', slug: 'google/gemini-2.5-flash' },
  { name: 'DeepSeek V3 (Low Cost Fallback)', slug: 'deepseek/deepseek-chat' },
];

const AI_MAX_TOKENS = Number(process.env.OPENROUTER_MAX_TOKENS || 65536);
const AI_TIMEOUT_MS = Number(process.env.OPENROUTER_REQUEST_TIMEOUT_MS || 300000);
const CONTEXT_GUARD_BAND = Number(process.env.OPENROUTER_CONTEXT_GUARD_BAND || 1024);
const MIN_USEFUL_COMPLETION_TOKENS = Number(process.env.OPENROUTER_MIN_COMPLETION_TOKENS || 1024);
const CACHE_VERSION = 2;
const MODEL_METADATA_CACHE = new Map();
const INVALID_CACHE_IDS = new Set();

function estimateTokens(text) {
  return Math.max(1, Math.ceil((text || '').length / 4));
}

function describeOpenRouterError(err) {
  const status = err?.status || err?.response?.status || err?.error?.status || null;
  const message = err?.message || err?.response?.data?.error?.message || err?.error?.message || 'Erro desconhecido';
  const metadata = err?.response?.data?.error?.metadata || err?.error?.metadata || null;
  const errorType = metadata?.error_type || metadata?.type || null;

  return {
    status,
    message,
    errorType,
  };
}

function isRetryableOpenRouterError(details) {
  return [408, 429, 500, 502, 503, 524, 529].includes(details.status);
}

function isLikelyContextOrPayloadError(details) {
  return [400, 413, 422].includes(details.status)
    || ['context_length_exceeded', 'max_tokens_exceeded', 'token_limit_exceeded', 'string_too_long', 'payload_too_large', 'invalid_request', 'invalid_prompt', 'unprocessable'].includes(details.errorType);
}

function appendWithoutOverlap(baseText, additionText) {
  const base = baseText || '';
  const addition = additionText || '';

  if (!base) return addition;
  if (!addition) return base;

  const maxOverlap = Math.min(4000, base.length, addition.length);
  for (let overlap = maxOverlap; overlap >= 80; overlap--) {
    if (base.slice(-overlap) === addition.slice(0, overlap)) {
      return base + addition.slice(overlap);
    }
  }

  return base + addition;
}

async function requestContinuation(openai, tier, capInfo, accumulatedText, maxTokens) {
  const trailingExcerpt = accumulatedText.slice(-1200);

  const response = await openai.chat.completions.create({
    model: tier.slug,
    messages: [
      {
        role: 'system',
        content: `Você está continuando a limpeza e formatação estrutural do mesmo capítulo médico.

REGRAS RÍGIDAS DE CONTINUAÇÃO:
1. Continue exatamente do ponto onde o texto anterior parou.
2. NÃO repita trechos já escritos.
3. Preserve integralmente conteúdo, números, doses, vias, listas e títulos.
4. Se o capítulo já estiver completo, responda apenas com <<FIM>>.
5. Mantenha o mesmo estilo Markdown usado anteriormente.`,
      },
      {
        role: 'user',
        content: `Continue o Capítulo ${capInfo.number}: "${capInfo.title}" a partir do trecho final abaixo, sem repetir o que já foi produzido:\n\n${trailingExcerpt}`,
      },
    ],
    temperature: 0.2,
    max_completion_tokens: maxTokens,
  });

  const choice = response.choices[0]?.message;
  let continuationText = choice?.content?.trim() || '';

  if (!continuationText && choice?.reasoning_content) {
    continuationText = choice.reasoning_content.trim();
  }

  if (continuationText && continuationText.includes('</think>')) {
    continuationText = continuationText.split('</think>').pop().trim();
  }

  return {
    text: continuationText,
    finishReason: response.choices[0]?.finish_reason || null,
  };
}

async function getModelMetadata(slug, apiKey) {
  if (MODEL_METADATA_CACHE.has(slug)) {
    return MODEL_METADATA_CACHE.get(slug);
  }

  try {
    const response = await fetch(`https://openrouter.ai/api/v1/model/${slug}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://emergemed.vercel.app',
        'X-OpenRouter-Title': 'EmergeMed Indexer',
      },
    });

    if (!response.ok) {
      console.warn(`   ⚠️ Não foi possível ler metadata de ${slug} (HTTP ${response.status}). Vou usar limites conservadores.`);
      MODEL_METADATA_CACHE.set(slug, null);
      return null;
    }

    const payload = await response.json();
    const metadata = payload?.data || null;
    MODEL_METADATA_CACHE.set(slug, metadata);
    return metadata;
  } catch (error) {
    console.warn(`   ⚠️ Falha ao consultar metadata de ${slug}: ${error.message || error}`);
    MODEL_METADATA_CACHE.set(slug, null);
    return null;
  }
}

async function callOpenRouterWithRotation(prompt, apiKey, capInfo) {
  if (!apiKey) {
    throw new Error('Chave da API OpenRouter não foi encontrada.');
  }

  const openai = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: apiKey,
    timeout: AI_TIMEOUT_MS,
    defaultHeaders: {
      'HTTP-Referer': 'https://emergemed.vercel.app',
      'X-Title': 'EmergeMed Indexer',
    },
  });

  const promptTokenEstimate = estimateTokens(prompt);
  let lastFailure = null;

  for (const tier of AI_MODELS_TIERS) {
    const modelMeta = await getModelMetadata(tier.slug, apiKey);
    const contextLength = modelMeta?.top_provider?.context_length || modelMeta?.context_length || null;
    const providerMaxCompletion = modelMeta?.top_provider?.max_completion_tokens || null;
    const modelMaxCompletion = modelMeta?.per_request_limits?.completion_tokens || null;

    let effectiveMaxTokens = Math.min(
      AI_MAX_TOKENS,
      providerMaxCompletion || AI_MAX_TOKENS,
      modelMaxCompletion || AI_MAX_TOKENS,
    );

    if (contextLength) {
      const inputBudget = contextLength - promptTokenEstimate - CONTEXT_GUARD_BAND;
      if (inputBudget <= 0) {
        console.warn(`   ⚠️ Cap ${capInfo.number}: o capítulo parece grande demais para ${tier.name} (${promptTokenEstimate.toLocaleString()} tokens estimados vs. contexto ${contextLength.toLocaleString()}). Pulando este modelo.`);
        lastFailure = `context length too small for ${tier.slug}`;
        continue;
      }

      effectiveMaxTokens = Math.min(effectiveMaxTokens, inputBudget);
    }

    if (effectiveMaxTokens < MIN_USEFUL_COMPLETION_TOKENS) {
      console.warn(`   ⚠️ Cap ${capInfo.number}: apenas ${effectiveMaxTokens.toLocaleString()} tokens sobraram para resposta em ${tier.name}. Pulando este modelo para evitar saída truncada.`);
      lastFailure = `insufficient completion budget for ${tier.slug}`;
      continue;
    }

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await openai.chat.completions.create({
          model: tier.slug,
          messages: [
            {
              role: 'system',
              content: `Você é um preceptor e especialista em pós-processamento de literatura médica de emergência (UPA/Sala Vermelha).
Sua missão é realizar a limpeza e formatação estrutural do texto do capítulo médico extraído de arquivo PDF.

REGRAS RÍGIDAS DE PROCESSAMENTO (OBRIGATÓRIO):
1. NUNCA resuma, parafraseie ou omita parágrafos clínicos. O texto limpo deve conter TODAS as informações do original.
2. PRESERVE com precisão absoluta todas as dosagens (mg, g, mcg/kg/min, UI, mL/kg), vias de administração (IV, IM, VO, SL, SC), diluições (SF 0.9%, SG 5%), aprazamentos e valores de exames (PA, FC, FR, SpO2, lactato, gasometria).
3. REMOVA apenas artefatos de conversão de PDF:
   - Números de página soltos (ex: "Página 184" ou "-- 184 of 2514 --")
   - Cabeçalhos e rodapés repetitivos da editora
   - Quebras de linha incorretas no meio de frases e hífens de quebra de palavra (ex: "car- díaco" -> "cardíaco")
4. FORMATO: O título principal do capítulo DEVE ser um Heading 1 Markdown (# Capítulo ${capInfo.number}: ${capInfo.title}) no topo, seguido de seções (# Título, ## Subtítulo) e listas em hífens (- item).
5. TRAVA RIGIDA DE CAPÍTULO: Você está processando APENAS o Capítulo ${capInfo.number}: "${capInfo.title}". Se o final do texto contiver o título do capítulo seguinte (ex: Capítulo ${capInfo.number + 1}), IGNORE o capítulo seguinte completamente.`,
            },
            {
              role: 'user',
              content: `Limpe, corrija quebras de linha de PDF e estruture o texto do Capítulo ${capInfo.number}: "${capInfo.title}" em Markdown limpo, sem resumir NADA:\n\n${prompt}`,
            },
          ],
          temperature: 0.2,
          max_completion_tokens: effectiveMaxTokens,
        });

        const choice = response.choices[0]?.message;
        let cleanedText = choice?.content?.trim() || '';

        if (!cleanedText && choice?.reasoning_content) {
          cleanedText = choice.reasoning_content.trim();
        }
        if (cleanedText && cleanedText.includes('</think>')) {
          cleanedText = cleanedText.split('</think>').pop().trim();
        }

        if (cleanedText && cleanedText.length > 50) {
          if (response.choices[0]?.finish_reason === 'length') {
            console.warn(`   ⚠️ Cap ${capInfo.number}: ${tier.name} terminou por limite de saída. Tentando continuação automática...`);

            let assembledText = cleanedText;
            let continuationFinishReason = 'length';

            for (let continuationAttempt = 1; continuationAttempt <= 2 && continuationFinishReason === 'length'; continuationAttempt++) {
              const continuation = await requestContinuation(openai, tier, capInfo, assembledText, effectiveMaxTokens);

              if (!continuation.text || continuation.text.length <= 20) {
                break;
              }

              assembledText = appendWithoutOverlap(assembledText, continuation.text);
              continuationFinishReason = continuation.finishReason;
            }

            cleanedText = assembledText;
          }
          return { text: cleanedText, model: tier.name };
        }
      } catch (err) {
        const details = describeOpenRouterError(err);
        lastFailure = `${tier.slug}: ${details.message}`;

        if (isLikelyContextOrPayloadError(details)) {
          console.warn(`   ⚠️ Cap ${capInfo.number}: ${tier.name} rejeitou o pedido (${details.status || 'sem status'}). Vou tentar o próximo modelo.`);
          break;
        }

        if (!isRetryableOpenRouterError(details) || attempt === 2) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
      }
    }
  }

  console.warn(`   ⚠️ Cap ${capInfo.number}: nenhum modelo conseguiu concluir a limpeza. Motivo: ${lastFailure || 'desconhecido'}. Usando texto bruto como fallback.`);
  return { text: prompt, model: 'Raw Text Fallback' };
}

// Concurrent Pool Helper
async function asyncPool(poolLimit, array, iteratorFn) {
  const ret = [];
  const executing = [];
  for (const item of array) {
    const p = Promise.resolve().then(() => iteratorFn(item, array));
    ret.push(p);

    if (poolLimit <= array.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= poolLimit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(ret);
}

async function main() {
  console.log('\n==================================================');
  console.log('🩺 EmergeMed — Indexador Auditado com Trava Rígida de Título de Capítulo');
  console.log('==================================================\n');

  const options = parseArgs();

  const cachePath = path.join(projectRoot, 'scripts', 'index_cache.json');
  let cacheData = {};
  if (fs.existsSync(cachePath)) {
    try {
      cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      console.log(`💾 Cache Local Carregado: ${Object.keys(cacheData).length} capítulos salvos em cache.`);
    } catch (e) {
      cacheData = {};
    }
  }

  function isChapterValid(rec, capNumber) {
    if (INVALID_CACHE_IDS.has(capNumber)) return false;
    if (!rec || rec.cache_version !== CACHE_VERSION || !rec.content || rec.content.length <= 50) return false;
    if (rec.content.trim().startsWith('-- ')) return false;
    return true;
  }

  const invalidCacheKeys = Object.keys(cacheData).filter((key) => !isChapterValid(cacheData[key], Number(key)));
  if (invalidCacheKeys.length > 0) {
    for (const key of invalidCacheKeys) {
      delete cacheData[key];
    }
    fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2), 'utf8');
    console.log(`🧹 Cache purgado: ${invalidCacheKeys.length} capítulos pendentes ou inválidos removidos do cache local.`);
  }

  function saveToCache(chapterNumber, record) {
    cacheData[chapterNumber] = {
      ...record,
      cache_version: CACHE_VERSION,
    };
    fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2), 'utf8');
  }

  function toSupabaseRecord(record) {
    return {
      chapter_id: record.chapter_id,
      content: record.content,
      word_count: record.word_count,
      updated_at: record.updated_at,
    };
  }

  if (!options.file) {
    const scriptsDir = path.join(projectRoot, 'scripts');
    const pdfFile = path.join(scriptsDir, 'Medicina de Emergência 18ed.pdf');
    if (fs.existsSync(pdfFile)) {
      options.file = pdfFile;
    } else {
      console.error('❌ Arquivo "scripts/Medicina de Emergência 18ed.pdf" não encontrado.');
      process.exit(1);
    }
  }

  if (!options.supabaseUrl || !options.supabaseKey) {
    console.error('❌ Supabase URL ou Chave não encontradas em .env.local.');
    process.exit(1);
  }

  const supabase = createClient(options.supabaseUrl, options.supabaseKey);

  const mapPath = path.join(projectRoot, 'scripts', 'pdf_bookmarks_map.json');
  if (!fs.existsSync(mapPath)) {
    console.error('❌ pdf_bookmarks_map.json não encontrado.');
    process.exit(1);
  }

  const chaptersMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));

  console.log(`📄 PDF Target: ${path.basename(options.file)}`);
  console.log(`📚 Total de Capítulos Mapeados: ${chaptersMap.length}`);
  console.log(`⚡ Supabase Target: ${options.supabaseUrl}`);
  console.log(`⚡ Limite máximo de saída OpenRouter solicitado: ${AI_MAX_TOKENS.toLocaleString()} tokens`);
  console.log('--------------------------------------------------\n');

  const fileBuffer = fs.readFileSync(options.file);
  console.log(`⏳ Lendo arquivo PDF em memória (${(fileBuffer.length / (1024 * 1024)).toFixed(2)} MB)...`);

  const parser = new PDFParse({ data: fileBuffer });
  await parser.load();

  console.log('⏳ Extraindo texto com marcadores de página...');
  const textResult = await parser.getText();
  const rawText = textResult.text || '';

  const chapterTasks = [];

  for (let i = 0; i < chaptersMap.length; i++) {
    const cap = chaptersMap[i];
    
    const startMarker = `-- ${cap.startPage} of`;
    const nextCap = chaptersMap[i + 1];
    const endPageTarget = nextCap ? nextCap.startPage : cap.endPage + 1;
    const endMarker = `-- ${endPageTarget} of`;

    let startIdx = rawText.indexOf(startMarker);
    if (startIdx === -1) {
      const altStart = `-- ${cap.startPage} `;
      startIdx = rawText.indexOf(altStart);
    }

    let endIdx = -1;
    if (startIdx !== -1) {
      endIdx = rawText.indexOf(endMarker, startIdx + 10);
      if (endIdx === -1) {
        const altEnd = `-- ${endPageTarget} `;
        endIdx = rawText.indexOf(altEnd, startIdx + 10);
      }
    }

    let chapterText = '';
    if (startIdx !== -1) {
      if (endIdx === -1) endIdx = rawText.length;
      chapterText = rawText.substring(startIdx, endIdx).trim();
    } else {
      const approxLen = Math.floor(rawText.length / chaptersMap.length);
      chapterText = rawText.slice(i * approxLen, (i + 1) * approxLen).trim();
    }

    // Strip trailing next chapter marker/title if present at the end
    if (nextCap) {
      const nextCapHeader = `${nextCap.number}   ${nextCap.title}`;
      const trailingIdx = chapterText.indexOf(nextCapHeader);
      if (trailingIdx !== -1) {
        chapterText = chapterText.slice(0, trailingIdx).trim();
      }
    }
    chapterTasks.push({
      cap,
      chapterText,
    });
  }

  console.log('✅ Marcadores de páginas reais carregados com sucesso!\n');

  const cachedRecords = [];
  const pendingTasks = [];

  for (const task of chapterTasks) {
    const capNum = task.cap.number;
    if (isChapterValid(cacheData[capNum], capNum)) {
      cachedRecords.push(cacheData[capNum]);
    } else {
      pendingTasks.push(task);
    }
  }

  console.log(`\n==================================================`);
  console.log(`📊 DIAGNÓSTICO DE PROCESSAMENTO DO LIVRO`);
  console.log(`  - Total de Capítulos Mapeados: ${chaptersMap.length}`);
  console.log(`  - Validados no Cache Local (v2 com IA): ${cachedRecords.length}`);
  console.log(`  - PENDENTES PARA OPENROUTER: ${pendingTasks.length}`);

  if (pendingTasks.length > 0) {
    console.log(`\n📌 Lista dos ${pendingTasks.length} Capítulos Faltantes/Pendentes:`);
    pendingTasks.forEach((t) => {
      console.log(`   - Cap ${t.cap.number}: ${t.cap.title} (Págs ${t.cap.startPage}-${t.cap.endPage})`);
    });
  } else {
    console.log(`\n🎉 Todos os ${chaptersMap.length} capítulos já estão 100% limpos e salvos em cache com IA!`);
  }
  console.log(`==================================================\n`);

  if (pendingTasks.length > 0) {
    const poolLimit = pendingTasks.length; // Launch ABSOLUTELY ALL pending requests simultaneously!
    console.log(`🚀 Lançando ABSOLUTAMENTE TODOS os ${pendingTasks.length} requests simultâneos para o OpenRouter (Concorrência Total: ${poolLimit})...\n`);

    let completedCount = cachedRecords.length;

    const pendingResults = await asyncPool(poolLimit, pendingTasks, async (task) => {
      const capNumber = task.cap.number;

      let finalContent = task.chapterText;
      let usedModel = 'Raw Text';

      if (!options.skipAiClean && options.apiKey) {
        const aiResult = await callOpenRouterWithRotation(task.chapterText, options.apiKey, task.cap);
        finalContent = aiResult.text;
        usedModel = aiResult.model;
      }

      completedCount++;
      const pct = Math.round((completedCount / chaptersMap.length) * 100);
      const wordCount = finalContent.split(/\s+/).filter(Boolean).length;
      const charCount = finalContent.length;
      const snippet = finalContent.slice(0, 80).replace(/\n/g, ' ');

      const record = {
        chapter_id: capNumber,
        content: finalContent,
        word_count: wordCount,
        updated_at: new Date().toISOString(),
      };

      saveToCache(capNumber, record);

      try {
        await supabase.from('chapter_contents').upsert([toSupabaseRecord(record)], { onConflict: 'chapter_id' });
      } catch (e) {
        console.warn(`   ⚠️ Erro ao salvar Cap ${capNumber} no Supabase: ${e.message}`);
      }

      console.log(`[${completedCount}/${chaptersMap.length} - ${pct}%] ✅ Cap ${capNumber}: ${task.cap.title} (Págs ${task.cap.startPage}-${task.cap.endPage} — ${charCount.toLocaleString()} chars / ${wordCount.toLocaleString()} palavras — ${usedModel}) | Snippet: "${snippet}..."`);

      return record;
    });

    const allResults = [...cachedRecords, ...pendingResults];

    console.log('\n==================================================');
    console.log(`💾 Verificando envio final de todos os ${allResults.length} capítulos no Supabase...`);

    const supabaseResults = allResults.map(toSupabaseRecord);

    try {
      const { error } = await supabase
        .from('chapter_contents')
        .upsert(supabaseResults, { onConflict: 'chapter_id' });

      if (error) {
        console.warn('⚠️ Nota na sincronização final do Supabase:', error.message);
      } else {
        console.log('✅ Todos os capítulos sincronizados com sucesso no Supabase!');
      }
    } catch (e) {
      console.warn('⚠️ Exceção no envio Supabase:', e.message);
    }
  } else {
    console.log('✅ Nenhum capítulo pendente. O livro completo já está indexado no cache.');
  }

  console.log('\n🎉 SUCESSO ABSOLUTO! Processamento do livro concluído!');
  console.log('==================================================\n');
}

main().catch((err) => {
  console.error('❌ Erro fatal durante a execução:', err);
  process.exit(1);
});

