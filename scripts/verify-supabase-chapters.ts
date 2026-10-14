/**
 * scripts/verify-supabase-chapters.ts
 *
 * Standalone post-upload verification and forensic integrity audit script
 * for the Supabase `chapter_contents` table against `scripts/index_cache.json`.
 *
 * Verifies:
 * 1. Supabase connectivity & RLS detection
 * 2. 100% Bijective Cardinality (Exact 150 rows, IDs 1 to 150, 0 missing, 0 extraneous)
 * 3. Double Word Count Parity (DB.word_count == Cache.word_count && DB.word_count == DB.content.split(/\s+/).length)
 * 4. Timestamp Health (valid ISO 8601, within realistic range)
 * 5. Full Text Fidelity & Anti-Corruption (SHA-256 match against ground truth, 0 Mojibake, 0 \uFFFD)
 * 6. Strategic chapters check (IDs: 1, 2, 11, 79, 99, 120, 122, 123, 150)
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
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

function loadEnv(): Record<string, string> {
  const envPath = path.join(projectRoot, '.env.local');
  const env: Record<string, string> = {};
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const idx = trimmed.indexOf('=');
        if (idx > 0) {
          const k = trimmed.substring(0, idx).trim();
          let v = trimmed.substring(idx + 1).trim();
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.substring(1, v.length - 1);
          }
          env[k] = v;
        }
      }
    }
  }
  return env;
}

interface ChapterRecord {
  chapter_id: number;
  content: string;
  word_count: number;
  updated_at: string;
}

interface Assertion {
  id: string;
  suite: string;
  name: string;
  passed: boolean;
  details?: string;
}

export async function runVerification(client?: SupabaseClient): Promise<{
  success: boolean;
  totalAssertions: number;
  passedAssertions: number;
  failedAssertions: number;
}> {
  console.log('\n================================================================================');
  console.log('🩺 EMERGEMED: AUDITORIA DE INTEGRIDADE SUPABASE (chapter_contents)');
  console.log('================================================================================\n');

  const env = loadEnv();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    console.error('❌ FATAL: NEXT_PUBLIC_SUPABASE_URL não encontrada no ambiente.');
    return { success: false, totalAssertions: 0, passedAssertions: 0, failedAssertions: 1 };
  }

  const supabase = client || createClient(supabaseUrl, serviceKey || anonKey || '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const cachePath = path.join(projectRoot, 'scripts', 'index_cache.json');
  if (!fs.existsSync(cachePath)) {
    console.error('❌ FATAL: scripts/index_cache.json não encontrado!');
    return { success: false, totalAssertions: 0, passedAssertions: 0, failedAssertions: 1 };
  }

  const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  const assertions: Assertion[] = [];

  function assert(id: string, suite: string, name: string, condition: boolean, details?: string) {
    assertions.push({ id, suite, name, passed: condition, details });
    const mark = condition ? '✅ [PASS]' : '❌ [FAIL]';
    console.log(`  ${mark} [${id}] ${name}${!condition && details ? ` -> ${details}` : ''}`);
  }

  // ---------------------------------------------------------------------------
  // SUITE 1: CONNECTIVITY & RLS
  // ---------------------------------------------------------------------------
  console.log('▶ [SUITE 1] Conexão com Supabase e Detecção de RLS...');

  const { count: rawCount, error: countError } = await supabase
    .from('chapter_contents')
    .select('chapter_id', { count: 'exact', head: true });

  assert(
    'A1.1',
    'CONNECTIVITY',
    'Consulta ao Supabase respondeu sem erros de rede ou conexão',
    countError === null,
    countError?.message
  );

  const isRlsBlocked = (rawCount === 0 || rawCount === null) && !serviceKey;
  if (isRlsBlocked) {
    console.warn('  ⚠️ ALERTA DE RLS: A consulta retornou 0 linhas e SUPABASE_SERVICE_ROLE_KEY não está configurada.');
  }

  // ---------------------------------------------------------------------------
  // SUITE 2: BIJECTIVE SET CARDINALITY (150 RECORDS, IDS 1 TO 150)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [SUITE 2] Cardinalidade Bijetiva e Intervalo Numérico (IDs 1 a 150)...');

  // Fetch all rows
  const allRows: ChapterRecord[] = [];
  for (let offset = 0; offset < 200; offset += 50) {
    const { data, error } = await supabase
      .from('chapter_contents')
      .select('chapter_id, word_count, updated_at, content')
      .range(offset, offset + 49)
      .order('chapter_id', { ascending: true });

    if (error) {
      console.error(`  ❌ Erro na consulta de range [${offset}..${offset + 49}]: ${error.message}`);
      break;
    }
    if (data && data.length > 0) {
      allRows.push(...(data as ChapterRecord[]));
    } else {
      break;
    }
  }

  const dbIds = allRows.map((r) => r.chapter_id);
  const dbIdSet = new Set(dbIds);

  assert(
    'A2.1',
    'CARDINALITY',
    'Total exato de registros em chapter_contents é rigorosamente igual a 150',
    allRows.length === 150,
    `Encontrado: ${allRows.length} registros (esperado: 150)`
  );

  const expectedIds = Array.from({ length: 150 }, (_, i) => i + 1);
  const missingIds = expectedIds.filter((id) => !dbIdSet.has(id));
  const extraneousIds = dbIds.filter((id) => id < 1 || id > 150);

  assert(
    'A2.2',
    'BIJECTION',
    'Conjunto de IDs faltantes é estritamente vazio (sem lacunas de 1 a 150)',
    missingIds.length === 0,
    `IDs ausentes: [${missingIds.slice(0, 10).join(', ')}${missingIds.length > 10 ? '...' : ''}]`
  );

  assert(
    'A2.3',
    'BIJECTION',
    'Conjunto de IDs estranhos/fora da faixa é estritamente vazio (nenhum ID < 1 ou > 150)',
    extraneousIds.length === 0,
    `IDs estranhos: [${extraneousIds.join(', ')}]`
  );

  assert(
    'A2.4',
    'BIJECTION',
    'Ausência de IDs duplicados (chave primária íntegra)',
    dbIds.length === dbIdSet.size,
    `Total IDs: ${dbIds.length}, IDs únicos: ${dbIdSet.size}`
  );

  assert(
    'A2.5',
    'BOUNDARIES',
    'Menor ID é 1 e Maior ID é 150',
    (dbIds[0] === 1 && dbIds[dbIds.length - 1] === 150) || allRows.length === 0,
    `Min: ${dbIds[0]}, Max: ${dbIds[dbIds.length - 1]}`
  );

  // ---------------------------------------------------------------------------
  // SUITE 3: WORD COUNT FIDELITY & PARITY
  // ---------------------------------------------------------------------------
  console.log('\n▶ [SUITE 3] Fidelidade e Paridade da Contagem de Palavras (word_count)...');

  const dbMap = new Map<number, ChapterRecord>();
  allRows.forEach((r) => dbMap.set(r.chapter_id, r));

  let wcMismatchWithCache = 0;
  let wcMismatchWithSplit = 0;
  let invalidWcTypes = 0;

  for (const id of expectedIds) {
    const row = dbMap.get(id);
    const local = cacheData[String(id)] || cacheData[id];

    if (!row || !local) continue;

    if (typeof row.word_count !== 'number' || row.word_count <= 0) {
      invalidWcTypes++;
    }

    if (row.word_count !== local.word_count) {
      wcMismatchWithCache++;
    }

    const actualWords = (row.content || '').split(/\s+/).filter(Boolean).length;
    if (row.word_count !== actualWords) {
      wcMismatchWithSplit++;
    }
  }

  assert(
    'A3.1',
    'WORD_COUNT',
    'Todos os word_count são números inteiros positivos (> 0)',
    allRows.length === 150 && invalidWcTypes === 0,
    `Contagens inválidas: ${invalidWcTypes}`
  );

  assert(
    'A3.2',
    'WORD_COUNT',
    'Paridade 100% de word_count com index_cache.json (tolerância 0)',
    allRows.length === 150 && wcMismatchWithCache === 0,
    `Divergências com cache: ${wcMismatchWithCache}`
  );

  assert(
    'A3.3',
    'WORD_COUNT',
    'Paridade 100% de word_count com re-tokenização do texto real do banco',
    allRows.length === 150 && wcMismatchWithSplit === 0,
    `Divergências com split real: ${wcMismatchWithSplit}`
  );

  // ---------------------------------------------------------------------------
  // SUITE 4: TIMESTAMPS
  // ---------------------------------------------------------------------------
  console.log('\n▶ [SUITE 4] Validade Temporal e Preenchimento de updated_at...');

  let invalidTimestampFormats = 0;
  let outOfRangeTimestamps = 0;
  const minDate = new Date('2026-08-01T00:00:00Z').getTime();
  const maxDate = Date.now() + 120_000;

  for (const row of allRows) {
    if (!row.updated_at || typeof row.updated_at !== 'string') {
      invalidTimestampFormats++;
      continue;
    }
    const t = Date.parse(row.updated_at);
    if (isNaN(t)) {
      invalidTimestampFormats++;
    } else if (t < minDate || t > maxDate) {
      outOfRangeTimestamps++;
    }
  }

  assert(
    'A4.1',
    'TIMESTAMPS',
    'Todos os updated_at são timestamps válidos no formato ISO 8601',
    allRows.length === 150 && invalidTimestampFormats === 0,
    `Formatos inválidos: ${invalidTimestampFormats}`
  );

  assert(
    'A4.2',
    'TIMESTAMPS',
    'Todos os timestamps estão na janela temporal realista (>= 2026-08-01 e <= agora)',
    allRows.length === 150 && outOfRangeTimestamps === 0,
    `Fora da janela: ${outOfRangeTimestamps}`
  );

  // ---------------------------------------------------------------------------
  // SUITE 5: FULL TEXT FIDELITY & SHA-256 INTEGRITY
  // ---------------------------------------------------------------------------
  console.log('\n▶ [SUITE 5] Integridade Textual, Anti-Truncamento e Anti-Corrupção (SHA-256)...');

  let emptyOrWhitespace = 0;
  let charCountMismatches = 0;
  let sha256Mismatches = 0;
  let mojibakeDetected = 0;
  let replacementCharsDetected = 0;
  let missingMarkdownHeader = 0;

  for (const id of expectedIds) {
    const row = dbMap.get(id);
    const local = cacheData[String(id)] || cacheData[id];
    if (!row || !local) continue;

    const content = row.content || '';
    if (content.trim().length === 0) {
      emptyOrWhitespace++;
    }

    if (content.length !== (local.content || '').length) {
      charCountMismatches++;
    }

    const dbHash = crypto.createHash('sha256').update(content).digest('hex');
    const cacheHash = crypto.createHash('sha256').update(local.content || '').digest('hex');
    if (dbHash !== cacheHash) {
      sha256Mismatches++;
    }

    if (/[ÃÂ][\u0080-\u00BF]/.test(content)) {
      mojibakeDetected++;
    }

    if (content.includes('\uFFFD')) {
      replacementCharsDetected++;
    }

    if (!content.trim().startsWith('# Capítulo')) {
      missingMarkdownHeader++;
    }
  }

  assert(
    'A5.1',
    'INTEGRITY',
    'Nenhum capítulo possui conteúdo vazio ou apenas espaços',
    allRows.length === 150 && emptyOrWhitespace === 0,
    `Conteúdos vazios: ${emptyOrWhitespace}`
  );

  assert(
    'A5.2',
    'INTEGRITY',
    'Extensão em caracteres corresponde 100% ao cache original (0 truncamento)',
    allRows.length === 150 && charCountMismatches === 0,
    `Divergências de tamanho: ${charCountMismatches}`
  );

  assert(
    'A5.3',
    'INTEGRITY',
    'Hash criptográfico SHA-256 idêntico ao cache original em 100% dos capítulos',
    allRows.length === 150 && sha256Mismatches === 0,
    `Divergências SHA-256: ${sha256Mismatches}`
  );

  assert(
    'A5.4',
    'INTEGRITY',
    'Ausência de padrões Mojibake de codificação UTF-8 duplamente convertida',
    allRows.length === 150 && mojibakeDetected === 0,
    `Capítulos com Mojibake: ${mojibakeDetected}`
  );

  assert(
    'A5.5',
    'INTEGRITY',
    'Ausência do caractere de substituição Unicode (\\uFFFD)',
    allRows.length === 150 && replacementCharsDetected === 0,
    `Capítulos com \\uFFFD: ${replacementCharsDetected}`
  );

  assert(
    'A5.6',
    'INTEGRITY',
    'Todos os 150 capítulos possuem o cabeçalho padrão Markdown "# Capítulo {n}:"',
    allRows.length === 150 && missingMarkdownHeader === 0,
    `Sem cabeçalho: ${missingMarkdownHeader}`
  );

  // ---------------------------------------------------------------------------
  // SUITE 6: STRATEGIC CHAPTERS CHECK
  // ---------------------------------------------------------------------------
  console.log('\n▶ [SUITE 6] Checagem Estratégica de Capítulos-Chave (1, 2, 11, 79, 99, 120, 122, 123, 150)...');

  const strategicIds = [1, 2, 11, 79, 99, 120, 122, 123, 150];
  let strategicFailures = 0;

  for (const sId of strategicIds) {
    const { data: sData, error: sErr } = await supabase
      .from('chapter_contents')
      .select('content, word_count')
      .eq('chapter_id', sId)
      .maybeSingle();

    if (sErr || !sData || !sData.content || (sData.content as string).length < 10000) {
      console.error(`  ❌ Falha no capítulo estratégico ${sId}: ${sErr?.message || (!sData ? 'não encontrado' : 'conteúdo muito curto')}`);
      strategicFailures++;
    } else {
      console.log(`  🔎 Cap. ${sId}: ${(sData.content as string).length} chars, ${sData.word_count} palavras ✅`);
    }
  }

  assert(
    'A6.1',
    'STRATEGIC',
    'Todos os 9 capítulos estratégicos foram validados com fidelidade total',
    strategicFailures === 0,
    `Falhas em capítulos estratégicos: ${strategicFailures}`
  );

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  const totalAssertions = assertions.length;
  const passedAssertions = assertions.filter((a) => a.passed).length;
  const failedAssertions = assertions.filter((a) => !a.passed).length;
  const overallSuccess = failedAssertions === 0;

  console.log('\n================================================================================');
  console.log(`📊 RESULTADO DA AUDITORIA FORENSE DE INTEGRIDADE:`);
  console.log(`  - Total de Asserções: ${totalAssertions}`);
  console.log(`  - Aprovadas:         ${passedAssertions}`);
  console.log(`  - Falhas:            ${failedAssertions}`);
  console.log(`  - Veredito:          ${overallSuccess ? '🎉 APROVADO COM 100% DE SUCESSO' : '⚠️ REPROVADO (AÇÃO NECESSÁRIA)'}`);
  console.log('================================================================================\n');

  return {
    success: overallSuccess,
    totalAssertions,
    passedAssertions,
    failedAssertions,
  };
}

// Self-executable CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runVerification()
    .then((res) => {
      process.exit(res.success ? 0 : 1);
    })
    .catch((err) => {
      console.error('❌ Erro fatal na verificação:', err);
      process.exit(1);
    });
}
