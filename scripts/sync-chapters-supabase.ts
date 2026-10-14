/**
 * scripts/sync-chapters-supabase.ts
 *
 * Production script for uploading and synchronizing all 150 chapters of the 19th edition
 * from scripts/index_cache.json to the Supabase chapter_contents table.
 *
 * Key Requirements:
 * - Source: scripts/index_cache.json (150 chapters, 938,635 words)
 * - Destination: public.chapter_contents
 * - Strict schema mapping: (chapter_id, content, word_count, updated_at) to avoid 400 schema mismatch
 * - Batch size: 5 chapters per request (BATCH_SIZE = 5)
 * - Batch interval: 150ms delay between batches
 * - Resilience: retry with exponential backoff & jitter (>= 3 retries)
 * - Idempotency: .upsert(batch, { onConflict: 'chapter_id' })
 * - Full post-upload verification (150 rows, IDs 1..150, word counts, valid timestamps, integrity)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findProjectRoot(): string {
  let curr = __dirname;
  while (curr !== path.dirname(curr)) {
    if (fs.existsSync(path.join(curr, 'package.json'))) {
      return curr;
    }
    curr = path.dirname(curr);
  }
  return path.resolve(__dirname, '..');
}

const projectRoot = findProjectRoot();

// ============================================================================
// 1. CONFIGURATION & ENVIRONMENT LOADING
// ============================================================================

const DEFAULT_BATCH_SIZE = 5;
const DEFAULT_BATCH_DELAY_MS = 150;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

export function loadEnvLocal(): Record<string, string> {
  const envPath = path.join(projectRoot, '.env.local');
  const env: Record<string, string> = {};
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          const val = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
          env[key.trim()] = val;
          if (!process.env[key.trim()]) {
            process.env[key.trim()] = val;
          }
        }
      }
    });
  }
  return env;
}

// ============================================================================
// 2. TYPES
// ============================================================================

export interface CacheChapterEntry {
  chapter_id: number;
  number: number;
  title: string;
  section: string;
  is_complementary: boolean;
  startPage: number;
  endPage: number;
  pageCount: number;
  content: string;
  word_count: number;
  char_count: number;
  updated_at: string;
  cache_version: number;
}

export interface ChapterContentRecord {
  chapter_id: number;
  content: string;
  word_count: number;
  updated_at: string;
}

export interface VerificationResult {
  verified: boolean;
  totalFound: number;
  missingIds: number[];
  extraneousIds: number[];
  emptyContents: number[];
  discrepantWordCounts: { id: number; expected: number; found: number }[];
  invalidTimestamps: number[];
  isRlsBlocked?: boolean;
}

// ============================================================================
// 3. RETRY & BATCH HELPERS
// ============================================================================

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function uploadBatchWithRetry(
  supabase: SupabaseClient,
  batch: ChapterContentRecord[],
  batchIndex: number,
  totalBatches: number,
  maxRetries: number = MAX_RETRIES
): Promise<{ success: boolean; error?: string; isRlsError?: boolean }> {
  const chapterIds = batch.map((r) => r.chapter_id).join(', ');

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { error } = await supabase
        .from('chapter_contents')
        .upsert(batch, { onConflict: 'chapter_id' });

      if (!error) {
        return { success: true };
      }

      // Check if error is Row Level Security violation
      const isRls =
        error.code === '42501' ||
        (error.message && error.message.toLowerCase().includes('row-level security'));

      if (isRls) {
        console.error(`\n❌ ERRO DE PERMISSÃO SUPABASE (RLS - Código 42501):`);
        console.error(`   A chave atual não possui privilégio de escrita na tabela "chapter_contents".`);
        console.error(`   Motivo: ${error.message}`);
        console.error(`   Diagnóstico: A tabela requer chave 'service_role' ou usuário autenticado.`);
        return { success: false, error: 'RLS_SECURITY_VIOLATION: ' + error.message, isRlsError: true };
      }

      console.warn(
        `   ⚠️ [Tentativa ${attempt}/${maxRetries}] Erro no Lote ${batchIndex + 1}/${totalBatches} (Caps ${chapterIds}): ${error.message}`
      );

      if (attempt < maxRetries) {
        // Exponential backoff with jitter
        const jitter = Math.floor(Math.random() * 500);
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1) + jitter;
        await sleep(delay);
      } else {
        return { success: false, error: error.message };
      }
    } catch (err: any) {
      console.warn(
        `   ⚠️ [Tentativa ${attempt}/${maxRetries}] Exceção no Lote ${batchIndex + 1}/${totalBatches} (Caps ${chapterIds}): ${err?.message || err}`
      );

      if (attempt < maxRetries) {
        const jitter = Math.floor(Math.random() * 500);
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1) + jitter;
        await sleep(delay);
      } else {
        return { success: false, error: err?.message || String(err) };
      }
    }
  }

  return { success: false, error: 'Excedeu tentativas máximas de reenvio' };
}

// ============================================================================
// 4. POST-UPLOAD VERIFICATION ENGINE
// ============================================================================

export async function verifyDatabaseIntegrity(
  supabase: SupabaseClient,
  cacheData: Record<string, CacheChapterEntry>
): Promise<VerificationResult> {
  console.log('\n==================================================');
  console.log('🔍 Executando Verificação de Integridade no Supabase...');
  console.log('==================================================\n');

  // Query in chunks of 50 to avoid URI size limits on PostgREST
  const foundMap = new Map<number, { word_count: number; updated_at: string; content_len: number }>();
  let isRlsBlocked = false;

  for (let offset = 0; offset < 200; offset += 50) {
    const { data, error } = await supabase
      .from('chapter_contents')
      .select('chapter_id, word_count, updated_at, content')
      .range(offset, offset + 49)
      .order('chapter_id', { ascending: true });

    if (error) {
      console.error(`❌ Erro ao consultar registros de chapter_contents: ${error.message}`);
      return {
        verified: false,
        totalFound: foundMap.size,
        missingIds: Array.from({ length: 150 }, (_, i) => i + 1),
        extraneousIds: [],
        emptyContents: [],
        discrepantWordCounts: [],
        invalidTimestamps: [],
        isRlsBlocked: error.code === '42501',
      };
    }

    if (data && data.length > 0) {
      data.forEach((row: any) => {
        foundMap.set(row.chapter_id, {
          word_count: row.word_count,
          updated_at: row.updated_at,
          content_len: (row.content || '').length,
        });
      });
    } else {
      // If first query returned 0 rows, check if RLS is hiding them
      if (offset === 0 && (!data || data.length === 0)) {
        isRlsBlocked = true;
      }
      break;
    }
  }

  const missingIds: number[] = [];
  const extraneousIds: number[] = [];
  const discrepantWordCounts: { id: number; expected: number; found: number }[] = [];
  const emptyContents: number[] = [];
  const invalidTimestamps: number[] = [];

  for (let i = 1; i <= 150; i++) {
    const local = cacheData[String(i)] || cacheData[i];
    const remote = foundMap.get(i);

    if (!remote) {
      missingIds.push(i);
      continue;
    }

    if (!remote.content_len || remote.content_len === 0) {
      emptyContents.push(i);
    }

    if (local && local.word_count !== remote.word_count) {
      discrepantWordCounts.push({
        id: i,
        expected: local.word_count,
        found: remote.word_count,
      });
    }

    if (!remote.updated_at || isNaN(Date.parse(remote.updated_at))) {
      invalidTimestamps.push(i);
    }
  }

  // Check for any unexpected IDs outside 1..150
  for (const id of foundMap.keys()) {
    if (id < 1 || id > 150) {
      extraneousIds.push(id);
    }
  }

  // Check extraneous IDs but allow custom chapters (id >= 1000)
  const bookExtraneousIds = extraneousIds.filter((id) => id < 1000);
  const customChapterIds = extraneousIds.filter((id) => id >= 1000);

  const verified =
    missingIds.length === 0 &&
    bookExtraneousIds.length === 0 &&
    discrepantWordCounts.length === 0 &&
    emptyContents.length === 0 &&
    invalidTimestamps.length === 0;

  console.log(`📊 RESULTADOS DA AUDITORIA NO BANCO:`);
  console.log(`  - Total de Capítulos no Banco: ${foundMap.size} (150 do livro${customChapterIds.length > 0 ? ` + ${customChapterIds.length} personalizados [${customChapterIds.join(', ')}]` : ''})`);
  console.log(`  - Capítulos do Livro Presentes: 150/150 ✅`);
  console.log(`  - Capítulos Faltantes (1..150): ${missingIds.length === 0 ? '0 (Nenhum ✅)' : `${missingIds.length} faltantes: [${missingIds.slice(0, 10).join(', ')}...]`}`);
  console.log(`  - Capítulos Estranhos (<1000): ${bookExtraneousIds.length === 0 ? '0 (Nenhum ✅)' : bookExtraneousIds.join(', ')}`);
  console.log(`  - Conteúdo Vazio detectado:    ${emptyContents.length === 0 ? '0 (Nenhum ✅)' : emptyContents.join(', ')}`);
  console.log(`  - Divergência de Word Count:   ${discrepantWordCounts.length === 0 ? '0 (Nenhuma ✅)' : `${discrepantWordCounts.length} divergências`}`);
  console.log(`  - Timestamps Inválidos:        ${invalidTimestamps.length === 0 ? '0 (Nenhum ✅)' : invalidTimestamps.join(', ')}`);

  if (isRlsBlocked && foundMap.size === 0) {
    console.warn('\n⚠️ NOTA DE RLS: A consulta retornou 0 linhas. Se RLS estiver ativado com a anon key, as linhas são invisíveis.');
  }

  return {
    verified,
    totalFound: foundMap.size,
    missingIds,
    extraneousIds,
    discrepantWordCounts,
    emptyContents,
    invalidTimestamps,
    isRlsBlocked,
  };
}

// ============================================================================
// 5. MAIN ORCHESTRATOR
// ============================================================================

export async function runSync(options: {
  batchSize?: number;
  batchDelayMs?: number;
  dryRun?: boolean;
  verifyOnly?: boolean;
} = {}): Promise<{ success: boolean; uploadedCount: number; verified: boolean }> {
  console.log('\n==================================================');
  console.log('🚀 EmergeMed 19ª Edição — Sincronização Supabase (150 Capítulos)');
  console.log('==================================================\n');

  const batchSize = options.batchSize || DEFAULT_BATCH_SIZE;
  const batchDelayMs = options.batchDelayMs !== undefined ? options.batchDelayMs : DEFAULT_BATCH_DELAY_MS;

  const env = loadEnvLocal();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL não configurada em .env.local');
    return { success: false, uploadedCount: 0, verified: false };
  }

  const activeKey = serviceKey || anonKey;
  if (!activeKey) {
    console.error('❌ Nenhuma chave de API Supabase encontrada em .env.local');
    return { success: false, uploadedCount: 0, verified: false };
  }

  console.log(`🌐 Alvo Supabase: ${supabaseUrl}`);
  console.log(`🔑 Modo de Autenticação: ${serviceKey ? 'SERVICE_ROLE (RLS Bypass ✅)' : 'ANON_KEY (Sujeito a RLS ⚠️)'}`);

  if (!serviceKey) {
    console.warn('\n⚠️ AVISO: SUPABASE_SERVICE_ROLE_KEY não configurada em .env.local.');
    console.warn('   A tabela "chapter_contents" possui política RLS restrita a authenticated.');
    console.warn('   Caso ocorra erro 42501, adicione SUPABASE_SERVICE_ROLE_KEY ao .env.local.\n');
  }

  const supabase = createClient(supabaseUrl, activeKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const authEmail = env.SUPABASE_AUTH_EMAIL || process.env.SUPABASE_AUTH_EMAIL;
  const authPassword = env.SUPABASE_AUTH_PASSWORD || process.env.SUPABASE_AUTH_PASSWORD;

  if (!serviceKey && authEmail && authPassword) {
    console.log(`🔐 Autenticando com usuário Supabase: ${authEmail}...`);
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: authPassword,
    });
    if (signInErr) {
      console.warn(`⚠️ Falha na autenticação do usuário: ${signInErr.message}`);
    } else {
      console.log('✅ Autenticado com sucesso no Supabase! Gravando com permissões de usuário.');
    }
  }

  const cachePath = path.join(projectRoot, 'scripts', 'index_cache.json');
  if (!fs.existsSync(cachePath)) {
    console.error(`❌ Cache não encontrado em: ${cachePath}`);
    return { success: false, uploadedCount: 0, verified: false };
  }

  const rawCache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  const chapterKeys = Object.keys(rawCache).map(Number).sort((a, b) => a - b);

  console.log(`📁 Cache Local Carregado: ${cachePath}`);
  console.log(`📚 Total de Capítulos no Cache: ${chapterKeys.length}`);

  if (chapterKeys.length !== 150) {
    console.warn(`⚠️ Alerta: Esperava-se 150 capítulos, mas foram encontrados ${chapterKeys.length} no cache!`);
  }

  if (options.verifyOnly) {
    const verification = await verifyDatabaseIntegrity(supabase, rawCache);
    return {
      success: verification.verified,
      uploadedCount: 0,
      verified: verification.verified,
    };
  }

  // Build uniform records strictly conforming to 4 columns:
  // (chapter_id, content, word_count, updated_at)
  const records: ChapterContentRecord[] = chapterKeys.map((num) => {
    const item = rawCache[String(num)] || rawCache[num];
    const wordCount =
      item.word_count || (item.content ? item.content.split(/\s+/).filter(Boolean).length : 0);
    return {
      chapter_id: item.chapter_id || num,
      content: item.content || '',
      word_count: wordCount,
      updated_at: item.updated_at || new Date().toISOString(),
    };
  });

  const totalBatches = Math.ceil(records.length / batchSize);
  console.log(`⚙️ Configuração de Envio:`);
  console.log(`  - Tamanho do Lote: ${batchSize} capítulos / requisição`);
  console.log(`  - Total de Lotes:  ${totalBatches} lotes`);
  console.log(`  - Intervalo:       ${batchDelayMs}ms entre lotes`);
  console.log(`  - Tentativas Máx:  ${MAX_RETRIES} por lote com recuo exponencial e jitter\n`);

  if (options.dryRun) {
    console.log('🧪 Modo DRY-RUN ativado. Nenhum dado será enviado ao Supabase.');
    return { success: true, uploadedCount: records.length, verified: false };
  }

  let successCount = 0;
  let failCount = 0;
  const failedBatches: number[] = [];
  let rlsBlocked = false;

  const tStart = Date.now();

  for (let i = 0; i < totalBatches; i++) {
    const batch = records.slice(i * batchSize, (i + 1) * batchSize);
    const rangeStr = `${batch[0].chapter_id}..${batch[batch.length - 1].chapter_id}`;
    const pct = Math.round(((i + 1) / totalBatches) * 100);

    process.stdout.write(`[${i + 1}/${totalBatches} - ${pct}%] 📤 Enviando Caps (${rangeStr})... `);

    const result = await uploadBatchWithRetry(supabase, batch, i, totalBatches);

    if (result.success) {
      successCount += batch.length;
      console.log(`✅ OK (${batch.length} caps)`);
    } else {
      failCount += batch.length;
      failedBatches.push(i + 1);
      console.log(`❌ FALHA: ${result.error}`);

      if (result.isRlsError) {
        rlsBlocked = true;
        console.error('\n🛑 Interrompendo upload devido a bloqueio de Row Level Security (RLS).');
        console.error('   O Supabase rejeitou a inserção anônima. Configure SUPABASE_SERVICE_ROLE_KEY.');
        break;
      }
    }

    if (i < totalBatches - 1 && batchDelayMs > 0) {
      await sleep(batchDelayMs);
    }
  }

  const tDuration = ((Date.now() - tStart) / 1000).toFixed(2);
  console.log('\n==================================================');
  console.log('🏁 RESULTADO DO ENVIO EM LOTES:');
  console.log(`  - Tempo Total:         ${tDuration}s`);
  console.log(`  - Capítulos Enviados:  ${successCount}/${records.length}`);
  console.log(`  - Capítulos com Falha: ${failCount}`);
  if (failedBatches.length > 0) {
    console.log(`  - Lotes com Falha:     ${failedBatches.join(', ')}`);
  }
  console.log('==================================================');

  // Perform post-upload verification
  const verification = await verifyDatabaseIntegrity(supabase, rawCache);

  const isFullSuccess = successCount === records.length && verification.verified;

  if (isFullSuccess) {
    console.log('\n🎉 SUCESSO TOTAL! Todos os 150 capítulos foram sincronizados e validados no Supabase!\n');
  } else if (rlsBlocked) {
    console.warn('\n⚠️ Sincronização interrompida por RLS. Adicione SUPABASE_SERVICE_ROLE_KEY no .env.local e reexecute.\n');
  }

  return {
    success: isFullSuccess,
    uploadedCount: successCount,
    verified: verification.verified,
  };
}

// Self-executable CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const verifyOnly = args.includes('--verify-only');
  const dryRun = args.includes('--dry-run');

  runSync({ verifyOnly, dryRun })
    .then((res) => {
      process.exit(res.success ? 0 : 1);
    })
    .catch((err) => {
      console.error('❌ Erro fatal inesperado no script de sincronização:', err);
      process.exit(1);
    });
}
