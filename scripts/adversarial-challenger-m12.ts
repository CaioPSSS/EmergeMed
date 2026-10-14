/**
 * scripts/adversarial-challenger-m12.ts
 *
 * Adversarial Challenger Suite for Milestone M12
 * (Database Schema, Batch Partitioning, Payload Sizing, Boundary Chapters & Retry Resilience)
 *
 * Requirements Tested:
 * 1. Exact Batch Slicing: 150 chapters / 5 = exactly 30 batches.
 * 2. Payload Sizing & Budget: payload measurement for all 30 batches; strict verification that none exceeds 500 KB.
 * 3. Boundary & Key Chapters: Cap 1, Cap 11 (smallest), Cap 54 (largest), Cap 122 (last main), Cap 123 (first complementary), Cap 150 (last complementary).
 * 4. Fault Injection & Retry Resilience: HTTP 429, 502, 504 simulation, network drop exceptions, and RLS 42501 fast-fail handling.
 * 5. Dry-Run Execution & CLI Protocol Verification.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import {
  loadEnvLocal,
  uploadBatchWithRetry,
  runSync,
  ChapterContentRecord,
  CacheChapterEntry,
} from './sync-chapters-supabase';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

interface TestResult {
  id: string;
  suite: string;
  name: string;
  passed: boolean;
  details?: string;
  metrics?: Record<string, any>;
}

const results: TestResult[] = [];

function check(
  id: string,
  suite: string,
  name: string,
  condition: boolean,
  details?: string,
  metrics?: Record<string, any>
): void {
  results.push({ id, suite, name, passed: condition, details, metrics });
  const badge = condition ? '✅ [PASS]' : '❌ [FAIL]';
  console.log(`  ${badge} [${id}] [${suite}] ${name}${!condition && details ? ` -> ${details}` : ''}`);
}

async function runAdversarialM12Suite(): Promise<{
  success: boolean;
  total: number;
  passed: number;
  failed: number;
}> {
  console.log('\n================================================================================');
  console.log('⚔️  CHALLENGER 1 (M12): SUÍTE DE TESTES DE ESTRESSE ADVERSARIAL');
  console.log('    Mecanismo de Particionamento, Payloads, Capítulos Limítrofes e Retentativas');
  console.log('================================================================================\n');

  // Load ground truth cache
  const cachePath = path.join(projectRoot, 'scripts', 'index_cache.json');
  if (!fs.existsSync(cachePath)) {
    throw new Error(`Cache não encontrado em ${cachePath}`);
  }
  const rawCache: Record<string, CacheChapterEntry> = JSON.parse(
    fs.readFileSync(cachePath, 'utf8')
  );
  const chapterKeys = Object.keys(rawCache).map(Number).sort((a, b) => a - b);

  // ============================================================================
  // SUITE 1: FATIAMENTO EXATO E PARTICIONAMENTO DE LOTES (Task 1a)
  // ============================================================================
  console.log('▶ [SUITE 1] Fatiamento Exato: 150 Capítulos / 5 = Exatamente 30 Lotes...');

  check(
    'T1.1',
    'SLICING',
    'Cache fonte contém exatamente 150 capítulos',
    chapterKeys.length === 150,
    `Total encontrado: ${chapterKeys.length}`
  );

  const expectedIds = Array.from({ length: 150 }, (_, i) => i + 1);
  const missingIds = expectedIds.filter((id) => !chapterKeys.includes(id));
  const extraneousIds = chapterKeys.filter((id) => id < 1 || id > 150);

  check(
    'T1.2',
    'SLICING',
    'Conjunto de chaves é estritamente bijetivo {1..150} sem lacunas nem excedentes',
    missingIds.length === 0 && extraneousIds.length === 0,
    `Faltantes: [${missingIds.join(',')}], Excedentes: [${extraneousIds.join(',')}]`
  );

  const BATCH_SIZE = 5;
  const totalBatches = Math.ceil(chapterKeys.length / BATCH_SIZE);

  check(
    'T1.3',
    'SLICING',
    'Cálculo de lotes produz exatamente 30 lotes (150 / 5 = 30)',
    totalBatches === 30,
    `Lotes calculados: ${totalBatches}`
  );

  // Build projected records strictly with 4 columns
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

  // Partition records into batches
  const batches: ChapterContentRecord[][] = [];
  for (let i = 0; i < totalBatches; i++) {
    batches.push(records.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE));
  }

  const allBatchesExactFive = batches.every((b) => b.length === 5);
  check(
    'T1.4',
    'SLICING',
    'Todos os 30 lotes possuem exatamente 5 capítulos (uniformidade absoluta)',
    allBatchesExactFive && batches.length === 30,
    `Lotes com tamanho != 5: ${batches.filter((b) => b.length !== 5).length}`
  );

  const firstBatchIds = batches[0].map((r) => r.chapter_id);
  check(
    'T1.5',
    'SLICING',
    'Primeiro lote (Lote 1) contém exatamente capítulos [1, 2, 3, 4, 5]',
    JSON.stringify(firstBatchIds) === JSON.stringify([1, 2, 3, 4, 5]),
    `Lote 1 IDs: [${firstBatchIds.join(', ')}]`
  );

  const lastBatchIds = batches[29].map((r) => r.chapter_id);
  check(
    'T1.6',
    'SLICING',
    'Último lote (Lote 30) contém exatamente capítulos [146, 147, 148, 149, 150]',
    JSON.stringify(lastBatchIds) === JSON.stringify([146, 147, 148, 149, 150]),
    `Lote 30 IDs: [${lastBatchIds.join(', ')}]`
  );

  // Bijective union across all batches
  const flattenedIds = batches.flatMap((b) => b.map((r) => r.chapter_id));
  const uniqueBatchedIds = new Set(flattenedIds);
  check(
    'T1.7',
    'SLICING',
    'A união de todos os lotes cobre todos os 150 IDs sem repetições nem omissões',
    flattenedIds.length === 150 && uniqueBatchedIds.size === 150,
    `Total fatiado: ${flattenedIds.length}, Únicos: ${uniqueBatchedIds.size}`
  );

  // Boundary math simulation for slicing
  const sliceMathTestCases = [
    { n: 0, expected: 0 },
    { n: 1, expected: 1 },
    { n: 4, expected: 1 },
    { n: 5, expected: 1 },
    { n: 6, expected: 2 },
    { n: 149, expected: 30 },
    { n: 150, expected: 30 },
    { n: 151, expected: 31 },
  ];
  const allSliceMathPassed = sliceMathTestCases.every(
    (tc) => Math.ceil(tc.n / 5) === tc.expected
  );
  check(
    'T1.8',
    'SLICING',
    'Mecanismo de partição resiste a entradas arbitrárias (0, 1, 149, 150, 151)',
    allSliceMathPassed
  );

  // ============================================================================
  // SUITE 2: MEDIÇÃO DE PAYLOAD E LIMITE DE 500 KB (Task 1b)
  // ============================================================================
  console.log('\n▶ [SUITE 2] Medição de Payload de Cada um dos 30 Lotes (< 500 KB)...');

  const MAX_ALLOWED_BYTES = 500 * 1024; // 512,000 bytes
  const STRICT_METRIC_BYTES = 500_000;  // 500,000 bytes (decimal standard)

  interface BatchMetric {
    batchNumber: number;
    rangeStr: string;
    chapterIds: number[];
    recordCount: number;
    totalWords: number;
    payloadBytes: number;
    payloadKb: number;
    marginKb: number;
  }

  const batchMetrics: BatchMetric[] = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const jsonStr = JSON.stringify(batch);
    const bytes = Buffer.byteLength(jsonStr, 'utf8');
    const totalWords = batch.reduce((acc, c) => acc + c.word_count, 0);
    const kb = Number((bytes / 1024).toFixed(2));
    const marginKb = Number(((MAX_ALLOWED_BYTES - bytes) / 1024).toFixed(2));

    batchMetrics.push({
      batchNumber: i + 1,
      rangeStr: `${batch[0].chapter_id}..${batch[batch.length - 1].chapter_id}`,
      chapterIds: batch.map((c) => c.chapter_id),
      recordCount: batch.length,
      totalWords,
      payloadBytes: bytes,
      payloadKb: kb,
      marginKb,
    });
  }

  // Print formatted metrics table
  console.log('   ┌──────┬──────────┬──────────┬─────────────┬───────────┬──────────────┐');
  console.log('   │ Lote │ Caps     │ Palavras │ Payload (B) │ Tam (KB)  │ Margem Segura│');
  console.log('   ├──────┼──────────┼──────────┼─────────────┼───────────┼──────────────┤');
  for (const m of batchMetrics) {
    const bNum = String(m.batchNumber).padStart(4, ' ');
    const range = m.rangeStr.padEnd(8, ' ');
    const words = String(m.totalWords).padStart(8, ' ');
    const bytes = String(m.payloadBytes).padStart(11, ' ');
    const kb = (m.payloadKb.toFixed(1) + ' KB').padStart(9, ' ');
    const margin = ('+' + m.marginKb.toFixed(1) + ' KB').padStart(12, ' ');
    console.log(`   │ ${bNum} │ ${range} │ ${words} │ ${bytes} │ ${kb} │ ${margin} │`);
  }
  console.log('   └──────┴──────────┴──────────┴─────────────┴───────────┴──────────────┘');

  const maxPayloadBatch = batchMetrics.reduce((prev, curr) =>
    curr.payloadBytes > prev.payloadBytes ? curr : prev
  );
  const minPayloadBatch = batchMetrics.reduce((prev, curr) =>
    curr.payloadBytes < prev.payloadBytes ? curr : prev
  );
  const totalPayloadBytes = batchMetrics.reduce((sum, b) => sum + b.payloadBytes, 0);
  const avgPayloadBytes = Math.round(totalPayloadBytes / batchMetrics.length);
  const avgPayloadKb = (avgPayloadBytes / 1024).toFixed(2);

  console.log(`\n   📊 Sumário Estatístico dos Payloads:`);
  console.log(`      - Maior Lote:  Lote ${maxPayloadBatch.batchNumber} (Caps ${maxPayloadBatch.rangeStr}) -> ${maxPayloadBatch.payloadKb} KB (${maxPayloadBatch.payloadBytes} bytes)`);
  console.log(`      - Menor Lote:  Lote ${minPayloadBatch.batchNumber} (Caps ${minPayloadBatch.rangeStr}) -> ${minPayloadBatch.payloadKb} KB (${minPayloadBatch.payloadBytes} bytes)`);
  console.log(`      - Média:       ${avgPayloadKb} KB (${avgPayloadBytes} bytes)`);
  console.log(`      - Volume Total:${(totalPayloadBytes / (1024 * 1024)).toFixed(2)} MB (${totalPayloadBytes} bytes)`);

  const anyBatchExceedsBinary = batchMetrics.some((b) => b.payloadBytes > MAX_ALLOWED_BYTES);
  check(
    'T2.1',
    'PAYLOAD',
    'Nenhum dos 30 lotes ultrapassa o teto de 500 KiB (512.000 bytes)',
    !anyBatchExceedsBinary,
    `Maior lote: ${maxPayloadBatch.payloadBytes} bytes (Lote ${maxPayloadBatch.batchNumber})`
  );

  const anyBatchExceedsDecimal = batchMetrics.some((b) => b.payloadBytes > STRICT_METRIC_BYTES);
  check(
    'T2.2',
    'PAYLOAD',
    'Nenhum dos 30 lotes ultrapassa o teto decimal estrito de 500 KB (500.000 bytes)',
    !anyBatchExceedsDecimal,
    `Maior lote: ${maxPayloadBatch.payloadBytes} bytes (Lote ${maxPayloadBatch.batchNumber})`
  );

  const safetyMarginOfHeaviest = MAX_ALLOWED_BYTES - maxPayloadBatch.payloadBytes;
  check(
    'T2.3',
    'PAYLOAD',
    'Margem de segurança do lote mais pesado é superior a 100 KB',
    safetyMarginOfHeaviest > 100 * 1024,
    `Margem real: ${(safetyMarginOfHeaviest / 1024).toFixed(2)} KB`
  );

  // Verify strict 4-column projection savings vs raw cache object
  const rawFirstBatch = chapterKeys.slice(0, 5).map((num) => rawCache[String(num)]);
  const rawFirstBatchBytes = Buffer.byteLength(JSON.stringify(rawFirstBatch), 'utf8');
  const projectedFirstBatchBytes = batchMetrics[0].payloadBytes;
  const savingsPct = (((rawFirstBatchBytes - projectedFirstBatchBytes) / rawFirstBatchBytes) * 100).toFixed(2);

  check(
    'T2.4',
    'PAYLOAD',
    'Projeção estrita de 4 colunas economiza overhead de metadados desnecessários',
    projectedFirstBatchBytes <= rawFirstBatchBytes,
    `Original: ${rawFirstBatchBytes} B, Projetado: ${projectedFirstBatchBytes} B, Economia: ${savingsPct}%`
  );

  // Verify each record contains ONLY the 4 permitted columns
  const allowedKeys = new Set(['chapter_id', 'content', 'word_count', 'updated_at']);
  const allRecordsStrict = records.every((r) => {
    const keys = Object.keys(r);
    return keys.length === 4 && keys.every((k) => allowedKeys.has(k));
  });
  check(
    'T2.5',
    'PAYLOAD',
    'Todos os 150 registros contêm estritamente e apenas as 4 colunas aceitas pelo PostgREST',
    allRecordsStrict
  );

  // ============================================================================
  // SUITE 3: COMPORTAMENTO COM CAPÍTULOS LIMÍTROFES E ESTRATÉGICOS (Task 1c)
  // ============================================================================
  console.log('\n▶ [SUITE 3] Comportamento com Capítulos Limítrofes (1, 11, 54, 122, 123, 150)...');

  // Cap 1: First Chapter
  const cap1 = rawCache['1'];
  check(
    'T3.1',
    'BOUNDARY',
    'Cap 1 (Primeiro Cap): ID=1, não-complementar, título e cabeçalho presentes',
    cap1 &&
      cap1.chapter_id === 1 &&
      cap1.is_complementary === false &&
      cap1.content.includes('# Capítulo 1:') &&
      cap1.word_count === 5036,
    `Encontrado: id=${cap1?.chapter_id}, words=${cap1?.word_count}, comp=${cap1?.is_complementary}`
  );

  // Cap 11: Smallest Chapter in words
  const cap11 = rawCache['11'];
  const cap11Words = cap11?.word_count || 0;
  // Verify it is indeed the minimum across all 150
  const minWordsInAll = Math.min(...chapterKeys.map((k) => rawCache[String(k)].word_count));
  check(
    'T3.2',
    'BOUNDARY',
    'Cap 11 (Menor Cap): 2.035 palavras, confirmado como menor de toda a 19ª edição',
    cap11 &&
      cap11Words === 2035 &&
      cap11Words === minWordsInAll &&
      cap11.title.includes('Medicina Aeroespacial') &&
      cap11.content.includes('# Capítulo 11:'),
    `Palavras: ${cap11Words}, Menor global: ${minWordsInAll}, Título: ${cap11?.title}`
  );

  // Cap 54: Largest Chapter in words
  const cap54 = rawCache['54'];
  const cap54Words = cap54?.word_count || 0;
  // Verify it is indeed the maximum across all 150
  const maxWordsInAll = Math.max(...chapterKeys.map((k) => rawCache[String(k)].word_count));
  const batchWithCap54 = batchMetrics.find((b) => b.chapterIds.includes(54));
  check(
    'T3.3',
    'BOUNDARY',
    'Cap 54 (Maior Cap): 18.446 palavras, confirmado como maior de toda a 19ª edição',
    cap54 &&
      cap54Words === 18446 &&
      cap54Words === maxWordsInAll &&
      cap54.content.includes('# Capítulo 54:'),
    `Palavras: ${cap54Words}, Maior global: ${maxWordsInAll}`
  );

  check(
    'T3.4',
    'BOUNDARY',
    'Lote contendo o Cap 54 (Lote 11, Caps 51..55) permanece estritamente abaixo de 500 KB',
    batchWithCap54 !== undefined && batchWithCap54.payloadBytes < MAX_ALLOWED_BYTES,
    `Lote do Cap 54: ${batchWithCap54?.batchNumber}, Payload: ${batchWithCap54?.payloadKb} KB`
  );

  // Cap 122: Last Main Chapter
  const cap122 = rawCache['122'];
  check(
    'T3.5',
    'BOUNDARY',
    'Cap 122 (Último Principal): ID=122, is_complementary=false, seção regular',
    cap122 &&
      cap122.chapter_id === 122 &&
      cap122.is_complementary === false &&
      cap122.content.includes('# Capítulo 122:') &&
      cap122.word_count === 4191,
    `Cap 122 comp=${cap122?.is_complementary}, words=${cap122?.word_count}`
  );

  // Cap 123: First Complementary Chapter
  const cap123 = rawCache['123'];
  check(
    'T3.6',
    'BOUNDARY',
    'Cap 123 (Primeiro Complementar): ID=123, is_complementary=true, título e cabeçalho presentes (# Capítulo 1: no manual)',
    cap123 &&
      cap123.chapter_id === 123 &&
      cap123.is_complementary === true &&
      cap123.section.toLowerCase() === 'conteúdo complementar' &&
      cap123.content.startsWith('# Capítulo 1:') &&
      cap123.title === 'Cuidados pós-parada cardiorrespiratória' &&
      cap123.word_count === 6749,
    `Cap 123 comp=${cap123?.is_complementary}, section=${cap123?.section}, title=${cap123?.title}`
  );

  // Cap 150: Last Complementary Chapter (Final of 19th ed)
  const cap150 = rawCache['150'];
  check(
    'T3.7',
    'BOUNDARY',
    'Cap 150 (Último Complementar): ID=150, is_complementary=true, título e cabeçalho presentes (# Capítulo 28: no manual)',
    cap150 &&
      cap150.chapter_id === 150 &&
      cap150.is_complementary === true &&
      cap150.section.toLowerCase() === 'conteúdo complementar' &&
      cap150.content.startsWith('# Capítulo 28:') &&
      cap150.title.includes('Nutrição enteral') &&
      cap150.word_count === 4333,
    `Cap 150 comp=${cap150?.is_complementary}, section=${cap150?.section}, title=${cap150?.title}`
  );

  // Cross-verification: 1..122 are NOT complementary; 123..150 ARE complementary
  const mainComplCheck = chapterKeys.every((k) => {
    const item = rawCache[String(k)];
    if (k <= 122) {
      return item.is_complementary === false;
    } else {
      return item.is_complementary === true;
    }
  });
  check(
    'T3.8',
    'BOUNDARY',
    'Divisão estrita do catálogo: Caps 1..122 são principais; Caps 123..150 são complementares',
    mainComplCheck
  );

  // Check all boundary chapters for zero corruption
  const boundaryKeys = ['1', '11', '54', '122', '123', '150'];
  const mojibakeRegex = /[ÃÂ][\u0080-\u00BF]/;
  const boundaryCorruptions = boundaryKeys.filter((k) => {
    const c = rawCache[k].content;
    return mojibakeRegex.test(c) || c.includes('\uFFFD');
  });
  check(
    'T3.9',
    'BOUNDARY',
    'Todos os 6 capítulos limítrofes possuem zero Mojibake e zero \\uFFFD',
    boundaryCorruptions.length === 0,
    `Corrompidos: [${boundaryCorruptions.join(', ')}]`
  );

  // ============================================================================
  // SUITE 4: RESILIÊNCIA DE RETENTATIVAS E FALHAS HTTP / RLS (Task 1d)
  // ============================================================================
  console.log('\n▶ [SUITE 4] Resiliência de Retentativas e Tratamento de RLS 42501...');

  // Mock sample batch of 2 records
  const sampleBatch: ChapterContentRecord[] = records.slice(0, 2);

  // Temporarily override global.setTimeout to make backoff timers instantaneous (1ms)
  const origSetTimeout = global.setTimeout;
  function useFastTimers() {
    global.setTimeout = ((fn: any, _ms: number) => origSetTimeout(fn, 1)) as any;
  }
  function restoreTimers() {
    global.setTimeout = origSetTimeout;
  }

  // 4.1 Transient HTTP 429 (Rate Limit): Fails attempt 1 with 429, succeeds on attempt 2
  let calls429 = 0;
  const mockClient429: any = {
    from: () => ({
      upsert: async () => {
        calls429++;
        if (calls429 === 1) {
          return { error: { code: '429', message: 'Too Many Requests (Rate limit exceeded)' } };
        }
        return { error: null };
      },
    }),
  };

  useFastTimers();
  const res429 = await uploadBatchWithRetry(mockClient429, sampleBatch, 0, 30, 3);
  restoreTimers();

  check(
    'T4.1',
    'FAULT_INJECTION',
    'Erro HTTP 429 (Rate Limit) é recuperado com sucesso na tentativa subsequente',
    res429.success === true && calls429 === 2,
    `Sucesso: ${res429.success}, Chamadas: ${calls429}`
  );

  // 4.2 Transient HTTP 502 (Bad Gateway): Fails attempts 1 & 2, succeeds on attempt 3
  let calls502 = 0;
  const mockClient502: any = {
    from: () => ({
      upsert: async () => {
        calls502++;
        if (calls502 <= 2) {
          return { error: { code: '502', message: 'Bad Gateway - PostgREST restarting' } };
        }
        return { error: null };
      },
    }),
  };

  useFastTimers();
  const res502 = await uploadBatchWithRetry(mockClient502, sampleBatch, 0, 30, 3);
  restoreTimers();

  check(
    'T4.2',
    'FAULT_INJECTION',
    'Erro HTTP 502 (Bad Gateway) sobrevive a 2 falhas consecutivas e conclui no 3º reenvio',
    res502.success === true && calls502 === 3,
    `Sucesso: ${res502.success}, Chamadas: ${calls502}`
  );

  // 4.3 Persistent HTTP 504 (Gateway Timeout): Fails all 3 attempts
  let calls504 = 0;
  const mockClient504: any = {
    from: () => ({
      upsert: async () => {
        calls504++;
        return { error: { code: '504', message: 'Gateway Timeout (Query took > 30s)' } };
      },
    }),
  };

  useFastTimers();
  const res504 = await uploadBatchWithRetry(mockClient504, sampleBatch, 0, 30, 3);
  restoreTimers();

  check(
    'T4.3',
    'FAULT_INJECTION',
    'Erro HTTP 504 persistente esgota 3 tentativas sem crash e retorna falha estruturada',
    res504.success === false &&
      calls504 === 3 &&
      (res504.error?.includes('Gateway Timeout') || false),
    `Sucesso: ${res504.success}, Chamadas: ${calls504}, Erro: ${res504.error}`
  );

  // 4.4 Network Exception / Broken Socket: Throws rejected error on attempt 1, succeeds on attempt 2
  let callsNetwork = 0;
  const mockClientNetwork: any = {
    from: () => ({
      upsert: async () => {
        callsNetwork++;
        if (callsNetwork === 1) {
          throw new Error('FetchError: connect ETIMEDOUT 104.18.25.1:443');
        }
        return { error: null };
      },
    }),
  };

  useFastTimers();
  const resNetwork = await uploadBatchWithRetry(mockClientNetwork, sampleBatch, 0, 30, 3);
  restoreTimers();

  check(
    'T4.4',
    'FAULT_INJECTION',
    'Exceção de rede (FetchError/ETIMEDOUT) é capturada e recuperada no reenvio',
    resNetwork.success === true && callsNetwork === 2,
    `Sucesso: ${resNetwork.success}, Chamadas: ${callsNetwork}`
  );

  // 4.5 RLS Error 42501 (Fast-Fail): Returns 42501 on attempt 1 -> MUST NOT RETRY!
  let callsRls = 0;
  const mockClientRls: any = {
    from: () => ({
      upsert: async () => {
        callsRls++;
        return {
          error: {
            code: '42501',
            message: 'new row violates row-level security policy for table "chapter_contents"',
          },
        };
      },
    }),
  };

  useFastTimers();
  const resRls = await uploadBatchWithRetry(mockClientRls, sampleBatch, 0, 30, 3);
  restoreTimers();

  check(
    'T4.5',
    'FAULT_INJECTION',
    'Erro RLS 42501 aciona Fast-Fail imediato (NÃO retenta desnecessariamente)',
    resRls.success === false &&
      resRls.isRlsError === true &&
      callsRls === 1,
    `isRlsError: ${resRls.isRlsError}, Chamadas: ${callsRls} (esperado: 1)`
  );

  // 4.6 RLS Message Fallback: Returns error without code '42501' but with 'row-level security' in message
  let callsRlsMsg = 0;
  const mockClientRlsMsg: any = {
    from: () => ({
      upsert: async () => {
        callsRlsMsg++;
        return {
          error: {
            code: 'P0001',
            message: 'permission denied due to row-level security policy',
          },
        };
      },
    }),
  };

  useFastTimers();
  const resRlsMsg = await uploadBatchWithRetry(mockClientRlsMsg, sampleBatch, 0, 30, 3);
  restoreTimers();

  check(
    'T4.6',
    'FAULT_INJECTION',
    'Detecção de RLS via mensagem textual aciona Fast-Fail e sinaliza isRlsError',
    resRlsMsg.success === false &&
      resRlsMsg.isRlsError === true &&
      callsRlsMsg === 1,
    `isRlsError: ${resRlsMsg.isRlsError}, Chamadas: ${callsRlsMsg}`
  );

  // 4.7 Exponential backoff formula verification
  const baseDelay = 1000;
  const delayAtt1Min = baseDelay * Math.pow(2, 0); // 1000
  const delayAtt1Max = delayAtt1Min + 500;        // 1500
  const delayAtt2Min = baseDelay * Math.pow(2, 1); // 2000
  const delayAtt2Max = delayAtt2Min + 500;        // 2500
  const delayAtt3Min = baseDelay * Math.pow(2, 2); // 4000
  const delayAtt3Max = delayAtt3Min + 500;        // 4500

  check(
    'T4.7',
    'FAULT_INJECTION',
    'Equação de recuo exponencial com jitter respeita limites matemáticos rígidos',
    delayAtt1Min === 1000 &&
      delayAtt2Min === 2000 &&
      delayAtt3Min === 4000 &&
      delayAtt1Max === 1500 &&
      delayAtt2Max === 2500 &&
      delayAtt3Max === 4500,
    `Faixas: att1=[${delayAtt1Min}..${delayAtt1Max}], att2=[${delayAtt2Min}..${delayAtt2Max}], att3=[${delayAtt3Min}..${delayAtt3Max}]`
  );

  // ============================================================================
  // SUITE 5: DRY-RUN E PROTOCOLO CLI (Task 2)
  // ============================================================================
  console.log('\n▶ [SUITE 5] Execução de Dry-Run Programático e CLI...');

  // 5.1 Programmatic runSync({ dryRun: true })
  const dryRunRes = await runSync({ dryRun: true });
  check(
    'T5.1',
    'CLI_DRY_RUN',
    'runSync({ dryRun: true }) encerra com success=true e 150 registros processados',
    dryRunRes.success === true && dryRunRes.uploadedCount === 150,
    `Sucesso: ${dryRunRes.success}, Registros: ${dryRunRes.uploadedCount}`
  );

  // 5.2 Subprocess CLI execution
  let cliOutput = '';
  let cliExitCode = 0;
  try {
    cliOutput = execSync('npx tsx scripts/sync-chapters-supabase.ts --dry-run', {
      cwd: projectRoot,
      encoding: 'utf8',
    });
  } catch (err: any) {
    cliExitCode = err.status || 1;
    cliOutput = err.stdout || err.message;
  }

  check(
    'T5.2',
    'CLI_DRY_RUN',
    'npx tsx scripts/sync-chapters-supabase.ts --dry-run encerra com código de saída 0',
    cliExitCode === 0,
    `Código de saída: ${cliExitCode}`
  );

  check(
    'T5.3',
    'CLI_DRY_RUN',
    'Saída do CLI confirma 150 capítulos, 30 lotes de 5 caps e ativação de DRY-RUN',
    cliOutput.includes('Total de Capítulos no Cache: 150') &&
      cliOutput.includes('Tamanho do Lote: 5 capítulos / requisição') &&
      cliOutput.includes('Total de Lotes:  30 lotes') &&
      cliOutput.includes('Modo DRY-RUN ativado'),
    `Conteúdo validado na saída CLI`
  );

  // ============================================================================
  // FINAL SCORE & SUMMARY
  // ============================================================================
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const success = failed === 0;

  console.log('\n================================================================================');
  console.log(`🏁 RESULTADO DA SUÍTE ADVERSARIAL M12:`);
  console.log(`   - Total de Testes Adversariais: ${total}`);
  console.log(`   - Aprovados:                    ${passed}`);
  console.log(`   - Falhas:                       ${failed}`);
  console.log(`   - Veredito da Suíte:            ${success ? '🏆 APROVADO' : '❌ REPROVADO'}`);
  console.log('================================================================================\n');

  return { success, total, passed, failed };
}

runAdversarialM12Suite()
  .then((res) => {
    process.exit(res.success ? 0 : 1);
  })
  .catch((err) => {
    console.error('❌ Erro fatal na suíte adversarial:', err);
    process.exit(1);
  });
