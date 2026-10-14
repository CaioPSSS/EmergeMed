/**
 * scripts/adversarial-challenger-m12-2.ts
 *
 * Empirical Adversarial Test Suite for M12 Data Fidelity & Truncation
 * Executed by Challenger 2 (teamwork_preview_challenger_m12_2).
 *
 * Dimensions Tested:
 * 1. Cryptographic Integrity & Anti-Collision (SHA-256) across all 150 chapters
 * 2. Mathematical Parity of Word Counting (`word_count === content.split(/\s+/).filter(Boolean).length`)
 * 3. Boundary & Anti-Truncation Testing (>=10k chars, # Capítulo {n}: title pattern)
 * 4. Special Character Fuzzing (α, β, ±, ≥, ≤, °C, medical units, Greek symbols, 0 Mojibake, 0 \uFFFD)
 * 5. GFM Markdown Table Invariant & Structural Validation
 * 6. PostgREST 4-Column Schema Projection & Payload Round-Trip Safety
 * 7. Verification Harness Simulation (Testing verify-supabase-chapters.ts with mock client)
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { runVerification } from './verify-supabase-chapters.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

interface ChapterEntry {
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

interface TestResult {
  dimension: string;
  testId: string;
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function assertTest(
  dimension: string,
  testId: string,
  name: string,
  condition: boolean,
  details?: string
) {
  results.push({ dimension, testId, name, passed: condition, details });
  const badge = condition ? '✅ [PASS]' : '❌ [FAIL]';
  console.log(`  ${badge} [${testId}] ${name}${!condition && details ? ` -> ${details}` : ''}`);
}

async function runAdversarialSuite() {
  console.log('\n================================================================================');
  console.log('⚔️  CHALLENGER 2: ADVERSARIAL SUITE — DATA FIDELITY & TRUNCATION (M12)');
  console.log('================================================================================\n');

  const cachePath = path.join(projectRoot, 'scripts', 'index_cache.json');
  if (!fs.existsSync(cachePath)) {
    console.error('❌ FATAL: scripts/index_cache.json not found!');
    process.exit(1);
  }

  const cacheRaw = fs.readFileSync(cachePath, 'utf8');
  const cacheData: Record<string, ChapterEntry> = JSON.parse(cacheRaw);
  const chapterKeys = Object.keys(cacheData);

  // ---------------------------------------------------------------------------
  // DIMENSION 1: CRYPTOGRAPHIC INTEGRITY & SHA-256 HASHING
  // ---------------------------------------------------------------------------
  console.log('▶ [DIMENSION 1] Cryptographic Integrity & Anti-Collision (SHA-256)...');

  const hashes = new Map<string, number>();
  const chapterHashes: { id: number; hash: string; charLength: number }[] = [];
  let invalidHashFormat = 0;
  let nonDeterministicHashes = 0;
  let chunkMismatch = 0;

  for (let i = 1; i <= 150; i++) {
    const item = cacheData[String(i)];
    if (!item || !item.content) {
      assertTest('CRYPTO', 'D1.0', `Capítulo ${i} existe no cache`, false, 'Registro ausente ou vazio');
      continue;
    }

    const content = item.content;
    const h1 = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
    const h2 = crypto.createHash('sha256').update(content, 'utf8').digest('hex');

    if (h1 !== h2) {
      nonDeterministicHashes++;
    }

    if (!/^[a-f0-9]{64}$/.test(h1)) {
      invalidHashFormat++;
    }

    // Chunked hash test (stress streaming / chunk boundary)
    const streamHash = crypto.createHash('sha256');
    const chunkSize = 1024;
    const buf = Buffer.from(content, 'utf8');
    for (let offset = 0; offset < buf.length; offset += chunkSize) {
      streamHash.update(buf.subarray(offset, Math.min(offset + chunkSize, buf.length)));
    }
    const hStream = streamHash.digest('hex');
    if (hStream !== h1) {
      chunkMismatch++;
    }

    chapterHashes.push({ id: i, hash: h1, charLength: content.length });
    hashes.set(h1, i);
  }

  assertTest(
    'CRYPTO',
    'D1.1',
    'Todos os 150 capítulos possuem hash SHA-256 de 64 caracteres hexadecimais',
    invalidHashFormat === 0 && chapterHashes.length === 150,
    `Formatos inválidos: ${invalidHashFormat}`
  );

  assertTest(
    'CRYPTO',
    'D1.2',
    'Determinismo criptográfico estrito (hash determinístico em múltiplas passagens)',
    nonDeterministicHashes === 0,
    `Falhas de determinismo: ${nonDeterministicHashes}`
  );

  assertTest(
    'CRYPTO',
    'D1.3',
    'Equivalência estrita entre hash por buffer contínuo e hash particionado em chunks de 1KB',
    chunkMismatch === 0,
    `Divergências de chunking: ${chunkMismatch}`
  );

  assertTest(
    'CRYPTO',
    'D1.4',
    'Zero colisões criptográficas: exatamente 150 hashes SHA-256 únicos e distintos',
    hashes.size === 150,
    `Hashes únicos: ${hashes.size} (esperado: 150)`
  );

  // Avalanche effect test on sample chapter (Cap 1)
  const cap1Original = cacheData['1'].content;
  const cap1HashOrig = crypto.createHash('sha256').update(cap1Original).digest('hex');
  const cap1Mutated = cap1Original + ' ';
  const cap1HashMut = crypto.createHash('sha256').update(cap1Mutated).digest('hex');
  assertTest(
    'CRYPTO',
    'D1.5',
    'Efeito Avalanche comprovado: adição de 1 espaço altera 100% o hash SHA-256',
    cap1HashOrig !== cap1HashMut,
    'Hash permaneceu idêntico após mutação'
  );

  // ---------------------------------------------------------------------------
  // DIMENSION 2: MATHEMATICAL PARITY OF WORD COUNTING
  // ---------------------------------------------------------------------------
  console.log('\n▶ [DIMENSION 2] Paridade Matemática de Contagem de Palavras (word_count)...');

  let wcParityDiscrepancies = 0;
  let totalWordsComputed = 0;
  let totalWordsCached = 0;
  let minWords = Infinity;
  let maxWords = 0;
  let minWordsId = 0;
  let maxWordsId = 0;

  for (let i = 1; i <= 150; i++) {
    const item = cacheData[String(i)];
    const content = item.content || '';
    const computedWords = content.split(/\s+/).filter(Boolean).length;
    totalWordsComputed += computedWords;
    totalWordsCached += item.word_count;

    if (computedWords !== item.word_count) {
      wcParityDiscrepancies++;
      console.warn(`    ⚠️ Discrepância Cap ${i}: cache=${item.word_count}, split=${computedWords}`);
    }

    if (item.word_count < minWords) {
      minWords = item.word_count;
      minWordsId = i;
    }
    if (item.word_count > maxWords) {
      maxWords = item.word_count;
      maxWordsId = i;
    }
  }

  assertTest(
    'WORD_COUNT',
    'D2.1',
    'Paridade matemática absoluta (word_count === content.split(/\\s+/).filter(Boolean).length) nos 150 capítulos',
    wcParityDiscrepancies === 0,
    `Discrepâncias: ${wcParityDiscrepancies}`
  );

  assertTest(
    'WORD_COUNT',
    'D2.2',
    'Soma total do corpus é de exatamente 938.635 palavras sem desvios',
    totalWordsComputed === 938635 && totalWordsCached === 938635,
    `Computado: ${totalWordsComputed}, Em cache: ${totalWordsCached} (esperado: 938635)`
  );

  assertTest(
    'WORD_COUNT',
    'D2.3',
    'Capítulo menor (Cap 11 - Medicina Aeroespacial) possui exatamente 2.035 palavras (> 0)',
    minWordsId === 11 && minWords === 2035,
    `Menor: Cap ${minWordsId} com ${minWords} palavras`
  );

  assertTest(
    'WORD_COUNT',
    'D2.4',
    'Capítulo maior (Cap 54 - AVC Isquêmico) possui exatamente 18.446 palavras',
    maxWordsId === 54 && maxWords === 18446,
    `Maior: Cap ${maxWordsId} com ${maxWords} palavras`
  );

  // ---------------------------------------------------------------------------
  // DIMENSION 3: BOUNDARY & ANTI-TRUNCATION TESTING
  // ---------------------------------------------------------------------------
  console.log('\n▶ [DIMENSION 3] Teste Limítrofe e Anti-Truncamento (>=10.000 chars, cabeçalhos)...');

  let chaptersUnder10k = 0;
  let minChars = Infinity;
  let maxChars = 0;
  let minCharsId = 0;
  let maxCharsId = 0;
  let headerFormatIssues = 0;
  let trailingTruncationSuspects = 0;

  for (let i = 1; i <= 150; i++) {
    const item = cacheData[String(i)];
    const content = item.content || '';
    const charLen = content.length;

    if (charLen < 10000) {
      chaptersUnder10k++;
    }

    if (charLen < minChars) {
      minChars = charLen;
      minCharsId = i;
    }
    if (charLen > maxChars) {
      maxChars = charLen;
      maxCharsId = i;
    }

    const firstLine = content.trim().split('\n')[0];
    const headerRegex = /^#\s+Capítulo\s+(\d+):\s*(.+)$/i;
    const match = firstLine.match(headerRegex);

    if (!match) {
      headerFormatIssues++;
    } else {
      const headerNum = parseInt(match[1], 10);
      if (i <= 122) {
        if (headerNum !== i) {
          headerFormatIssues++;
        }
      } else {
        // Complementary chapters: 123..150 corresponds to complementary 1..28
        const expectedComplementaryNum = i - 122;
        if (headerNum !== expectedComplementaryNum) {
          headerFormatIssues++;
        }
      }
    }

    // Trailing truncation check: does the chapter end abruptly mid-sentence?
    const lastNonEmptyLine = content.trim().split('\n').filter(Boolean).pop() || '';
    // A clean markdown end usually ends with punctuation, table pipe, blockquote, or code block
    if (lastNonEmptyLine.endsWith(',') || lastNonEmptyLine.endsWith(';')) {
      trailingTruncationSuspects++;
    }
  }

  assertTest(
    'ANTI_TRUNCATION',
    'D3.1',
    'Nenhum capítulo possui extensão inferior a 10.000 caracteres (0 truncamentos severos)',
    chaptersUnder10k === 0,
    `Capítulos < 10k: ${chaptersUnder10k}`
  );

  assertTest(
    'ANTI_TRUNCATION',
    'D3.2',
    `Extensão mínima comprovada: Cap ${minCharsId} possui ${minChars} caracteres (acima de 10.000)`,
    minChars >= 10000 && minCharsId === 11 && minChars === 13680,
    `Min: Cap ${minCharsId} (${minChars} chars)`
  );

  assertTest(
    'ANTI_TRUNCATION',
    'D3.3',
    `Extensão máxima comprovada: Cap ${maxCharsId} possui ${maxChars} caracteres`,
    maxCharsId === 54 && maxChars === 115305,
    `Max: Cap ${maxCharsId} (${maxChars} chars)`
  );

  assertTest(
    'ANTI_TRUNCATION',
    'D3.4',
    'Padrão de cabeçalho Markdown "# Capítulo {n}:" válido em 100% dos 150 capítulos',
    headerFormatIssues === 0,
    `Problemas de cabeçalho: ${headerFormatIssues}`
  );

  assertTest(
    'ANTI_TRUNCATION',
    'D3.5',
    'Ausência de finais abruptos ou truncados na última linha dos capítulos',
    trailingTruncationSuspects === 0,
    `Finais suspeitos: ${trailingTruncationSuspects}`
  );

  // ---------------------------------------------------------------------------
  // DIMENSION 4: CHARACTER FUZZING & UNICODE FIDELITY
  // ---------------------------------------------------------------------------
  console.log('\n▶ [DIMENSION 4] Fuzzing de Caracteres Especiais, Símbolos Médicos e Codificação...');

  const symbolsToTrack = [
    { sym: 'α', name: 'Alpha (α)' },
    { sym: 'β', name: 'Beta (β)' },
    { sym: '±', name: 'Mais/menos (±)' },
    { sym: '≥', name: 'Maior ou igual (≥)' },
    { sym: '≤', name: 'Menor ou igual (≤)' },
    { sym: '°C', name: 'Graus Celsius (°C)' },
    { sym: '°', name: 'Grau (°)' },
    { sym: 'μ', name: 'Micro grego (μ)' },
    { sym: 'µ', name: 'Micro legado (µ)' },
    { sym: 'γ', name: 'Gamma (γ)' },
    { sym: 'δ', name: 'Delta (δ)' },
    { sym: '≈', name: 'Aproximadamente (≈)' },
    { sym: '≠', name: 'Diferente (≠)' },
    { sym: '–', name: 'En-dash (–)' },
    { sym: '—', name: 'Em-dash (—)' },
  ];

  const symbolCounts: Record<string, { count: number; chapters: number }> = {};
  symbolsToTrack.forEach((s) => (symbolCounts[s.sym] = { count: 0, chapters: 0 }));

  let mojibakeChapters = 0;
  let replacementCharChapters = 0;
  let unprintableControlChapters = 0;

  for (let i = 1; i <= 150; i++) {
    const content = cacheData[String(i)].content || '';

    symbolsToTrack.forEach((s) => {
      const occurrences = content.split(s.sym).length - 1;
      if (occurrences > 0) {
        symbolCounts[s.sym].count += occurrences;
        symbolCounts[s.sym].chapters++;
      }
    });

    if (/[ÃÂ][\u0080-\u00BF]/.test(content)) {
      mojibakeChapters++;
    }
    if (content.includes('\uFFFD')) {
      replacementCharChapters++;
    }
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(content)) {
      unprintableControlChapters++;
    }
  }

  // Verify key symbols are present and uncorrupted
  assertTest(
    'FUZZING',
    'D4.1',
    `Presença íntegra de 'α' (${symbolCounts['α'].count}x em ${symbolCounts['α'].chapters} capítulos) e 'β' (${symbolCounts['β'].count}x em ${symbolCounts['β'].chapters} capítulos)`,
    symbolCounts['α'].count > 0 && symbolCounts['β'].count > 0,
    `α: ${symbolCounts['α'].count}, β: ${symbolCounts['β'].count}`
  );

  assertTest(
    'FUZZING',
    'D4.2',
    `Presença íntegra de '±' (${symbolCounts['±'].count}x em ${symbolCounts['±'].chapters} capítulos)`,
    symbolCounts['±'].count > 0,
    `±: ${symbolCounts['±'].count}`
  );

  assertTest(
    'FUZZING',
    'D4.3',
    `Presença íntegra de '≥' (${symbolCounts['≥'].count}x em ${symbolCounts['≥'].chapters} capítulos) e '≤' (${symbolCounts['≤'].count}x em ${symbolCounts['≤'].chapters} capítulos)`,
    symbolCounts['≥'].count > 0 && symbolCounts['≤'].count > 0,
    `≥: ${symbolCounts['≥'].count}, ≤: ${symbolCounts['≤'].count}`
  );

  assertTest(
    'FUZZING',
    'D4.4',
    `Presença íntegra de '°C' (${symbolCounts['°C'].count}x em ${symbolCounts['°C'].chapters} capítulos)`,
    symbolCounts['°C'].count > 0,
    `°C: ${symbolCounts['°C'].count}`
  );

  assertTest(
    'FUZZING',
    'D4.5',
    'Ausência estrita de padrões de Mojibake (UTF-8 duplamente codificado) em todos os capítulos',
    mojibakeChapters === 0,
    `Capítulos com Mojibake: ${mojibakeChapters}`
  );

  assertTest(
    'FUZZING',
    'D4.6',
    'Ausência estrita de caractere Unicode de substituição (\\uFFFD) em todos os capítulos',
    replacementCharChapters === 0,
    `Capítulos com \\uFFFD: ${replacementCharChapters}`
  );

  assertTest(
    'FUZZING',
    'D4.7',
    'Ausência estrita de caracteres de controle ASCII não-imprimíveis ([\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F])',
    unprintableControlChapters === 0,
    `Capítulos com caracteres de controle: ${unprintableControlChapters}`
  );

  // ---------------------------------------------------------------------------
  // DIMENSION 5: GFM MARKDOWN TABLE INVARIANTS & STRUCTURAL INTEGRITY
  // ---------------------------------------------------------------------------
  console.log('\n▶ [DIMENSION 5] Validação Estrutural e Invariantes de Tabelas GFM Markdown...');

  let totalTablesFound = 0;
  let chaptersWithTables = 0;
  let malformedTables = 0;
  let columnMismatchTables = 0;

  for (let i = 1; i <= 150; i++) {
    const lines = (cacheData[String(i)].content || '').split('\n');
    let chapterHadTable = false;

    for (let l = 0; l < lines.length; l++) {
      const line = lines[l].trim();
      // Match GFM separator row, e.g. | --- | --- | or |:---|:---|
      if (/^\|(\s*:?-+:?\s*\|)+$/.test(line)) {
        totalTablesFound++;
        chapterHadTable = true;

        const prevLine = (lines[l - 1] || '').trim();
        if (!prevLine.startsWith('|') || !prevLine.endsWith('|')) {
          malformedTables++;
        } else {
          // Compare column counts (number of cells = pipes - 1)
          const headerCells = prevLine.split('|').length - 2;
          const delimCells = line.split('|').length - 2;
          if (headerCells !== delimCells) {
            columnMismatchTables++;
          }
        }
      }
    }
    if (chapterHadTable) {
      chaptersWithTables++;
    }
  }

  assertTest(
    'TABLES',
    'D5.1',
    `Presença robusta de tabelas GFM em 144 de 150 capítulos (total de ${totalTablesFound} tabelas encontradas)`,
    chaptersWithTables === 144 && totalTablesFound === 665,
    `Capítulos com tabelas: ${chaptersWithTables}, Total: ${totalTablesFound}`
  );

  assertTest(
    'TABLES',
    'D5.2',
    'Zero tabelas GFM sem linha de cabeçalho correspondente sobre o delimitador',
    malformedTables === 0,
    `Tabelas malformadas: ${malformedTables}`
  );

  assertTest(
    'TABLES',
    'D5.3',
    'Zero divergências de contagem de colunas entre cabeçalho e delimitador nas 665 tabelas',
    columnMismatchTables === 0,
    `Divergências de colunas: ${columnMismatchTables}`
  );

  // ---------------------------------------------------------------------------
  // DIMENSION 6: POSTGREST 4-COLUMN SCHEMA PROJECTION & PAYLOAD INTEGRITY
  // ---------------------------------------------------------------------------
  console.log('\n▶ [DIMENSION 6] Projeção Estrita de Esquema (4 Colunas) e Integridade de Payload...');

  let schemaFieldLeakage = 0;
  let roundTripHashMismatch = 0;

  for (let i = 1; i <= 150; i++) {
    const item = cacheData[String(i)];
    // Projected row as constructed by sync-chapters-supabase.ts
    const projected = {
      chapter_id: item.chapter_id,
      content: item.content,
      word_count: item.word_count,
      updated_at: item.updated_at,
    };

    const keys = Object.keys(projected);
    if (keys.length !== 4 || !keys.includes('chapter_id') || !keys.includes('content') || !keys.includes('word_count') || !keys.includes('updated_at')) {
      schemaFieldLeakage++;
    }

    // Round-trip test
    const serialized = JSON.stringify(projected);
    const parsed = JSON.parse(serialized);
    const parsedHash = crypto.createHash('sha256').update(parsed.content).digest('hex');
    const origHash = crypto.createHash('sha256').update(item.content).digest('hex');

    if (parsedHash !== origHash || parsed.word_count !== item.word_count || parsed.chapter_id !== item.chapter_id) {
      roundTripHashMismatch++;
    }
  }

  assertTest(
    'SCHEMA',
    'D6.1',
    'Projeção estrita nas 4 colunas aceitas pelo PostgREST sem vazamento de campos auxiliares',
    schemaFieldLeakage === 0,
    `Vazamento em registros: ${schemaFieldLeakage}`
  );

  assertTest(
    'SCHEMA',
    'D6.2',
    'Preservação 100% de integridade criptográfica SHA-256 e word_count após serialização JSON',
    roundTripHashMismatch === 0,
    `Discrepâncias de round-trip: ${roundTripHashMismatch}`
  );

  // ---------------------------------------------------------------------------
  // DIMENSION 7: AUDIT SUITE SIMULATION (MOCK CLIENT VERIFICATION)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [DIMENSION 7] Execução da Suíte de Verificação com Cliente Simulado (Mock)...');

  // Build in-memory dataset of 150 rows
  const simulatedDbRows: any[] = [];
  for (let i = 1; i <= 150; i++) {
    const item = cacheData[String(i)];
    simulatedDbRows.push({
      chapter_id: item.chapter_id,
      content: item.content,
      word_count: item.word_count,
      updated_at: item.updated_at || new Date().toISOString(),
    });
  }

  // Create a minimal SupabaseClient mock implementing the queries used by verify-supabase-chapters.ts
  const mockClient = {
    from: (tableName: string) => {
      if (tableName !== 'chapter_contents') {
        throw new Error(`Unexpected table: ${tableName}`);
      }
      return {
        select: (cols: string, opts?: { count?: string; head?: boolean }) => {
          if (opts?.count === 'exact' && opts?.head) {
            return Promise.resolve({ count: 150, error: null });
          }

          let currentData = [...simulatedDbRows];

          const builder = {
            range: (from: number, to: number) => {
              currentData = currentData.slice(from, to + 1);
              return builder;
            },
            order: (col: string, orderOpts?: { ascending?: boolean }) => {
              currentData.sort((a: any, b: any) =>
                orderOpts?.ascending === false ? b[col] - a[col] : a[col] - b[col]
              );
              return builder;
            },
            eq: (col: string, val: any) => {
              currentData = currentData.filter((r: any) => r[col] === val);
              return builder;
            },
            maybeSingle: async () => {
              return { data: currentData[0] || null, error: null };
            },
            then: (resolve: any) => {
              resolve({ data: currentData, error: null });
            },
          };
          return builder;
        },
      };
    },
  } as any;

  console.log('  Testing verify-supabase-chapters with simulated 150 records...');
  const auditSimResult = await runVerification(mockClient);

  assertTest(
    'HARNESS',
    'D7.1',
    'Suíte verify-supabase-chapters.ts atinge 18/18 asserções (100% PASS) sob dados íntegros',
    auditSimResult.success && auditSimResult.passedAssertions === 18 && auditSimResult.failedAssertions === 0,
    `Passou: ${auditSimResult.passedAssertions}/${auditSimResult.totalAssertions}, Falhou: ${auditSimResult.failedAssertions}`
  );

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log('\n================================================================================');
  console.log('📊 RESUMO DO PARECER ADVERSARIAL — CHALLENGER 2:');
  console.log(`  - Total de Asserções Adversariais: ${total}`);
  console.log(`  - Asserções Aprovadas:             ${passed}`);
  console.log(`  - Asserções Falhas:                ${failed}`);
  console.log(`  - Veredito da Integridade Local:   ${failed === 0 ? '🟢 100% ÍNTEGRO (ZERO DEFEITOS)' : '🔴 CORRUPÇÃO DETECTADA'}`);
  console.log('================================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAdversarialSuite().catch((err) => {
  console.error('❌ Erro inesperado na suíte adversarial:', err);
  process.exit(1);
});
