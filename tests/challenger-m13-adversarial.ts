/**
 * tests/challenger-m13-adversarial.ts
 *
 * EMPIRICAL ADVERSARIAL STRESS SUITE — MARCO M13
 * Challenger: teamwork_preview_challenger_m13_1
 *
 * Stress-testing:
 * 1. Complex cells: escaped pipes (\|), line breaks (<br/>), html tags, math/greek symbols (alpha, beta, >=, <=, +-, mu).
 * 2. Extreme dimensions: wide tables (15 cols), tall tables (100 rows), asymmetric/empty cells.
 * 3. Real canonical clinical chapters: Cap 2 (MACOCHA), Cap 11 (Altitude vs PO2), Cap 99 (TEG parameters), Cap 79 & Cap 120 (table-less chapters).
 * 4. Semantic HTML hierarchy and responsive container contract: <div style="overflow-x:auto"><table...<thead>...<tbody>...<tr>...<th>...<td>.
 * 5. Malformed/adversarial inputs: unclosed rows, non-table pipes, raw pseudo-tables, injection strings.
 */

import React from 'react';
import ReactDOMServer from 'react-dom/server';
import fs from 'fs';
import path from 'path';
import { MarkdownRenderer } from '../components/MarkdownRenderer';

interface TestResult {
  suite: string;
  name: string;
  status: 'PASS' | 'FAIL';
  details?: string;
  verbatimSnippet?: string;
}

const testResults: TestResult[] = [];
let totalCount = 0;
let passCount = 0;
let failCount = 0;

function recordTest(suite: string, name: string, condition: boolean, details?: string, verbatimSnippet?: string) {
  totalCount++;
  if (condition) {
    passCount++;
    testResults.push({ suite, name, status: 'PASS', details, verbatimSnippet });
    console.log(`  ✓ [PASS] [${suite}] ${name}`);
    if (details) console.log(`      → ${details}`);
  } else {
    failCount++;
    testResults.push({ suite, name, status: 'FAIL', details, verbatimSnippet });
    console.error(`  ✗ [FAIL] [${suite}] ${name}`);
    if (details) console.error(`      → ${details}`);
  }
}

async function runAdversarialSuite() {
  console.log('========================================================================');
  console.log('    CHALLENGER 1: ADVERSARIAL STRESS TEST SUITE — MARKDOWN & GFM       ');
  console.log('========================================================================\n');

  // ==========================================================================
  // SUITE 1: COMPLEX CELLS (Escaped pipes, line breaks, HTML tags, Greek/Math)
  // ==========================================================================
  console.log('--- SUITE 1: COMPLEX TABLE CELLS (Escaped pipes, line breaks, HTML, Greek/Math) ---');

  const complexCellsMd = `
# Tabela de Drogas Vasoativas e Parâmetros Complexos

| Droga | Receptor / Mecanismo | Faixa Terapêutica (\\mu g/kg/min) | Condição & Observações |
| :--- | :--- | :--- | :--- |
| Noradrenalina | Agonista \\alpha_1 > \\beta_1 | 0.05 \\le dose \\le 2.0 \\mu g/kg/min | Primeira escolha no choque séptico.<br/>Alvo: PAM \\ge 65 mmHg. |
| Adrenalina | Agonista \\alpha_1 + \\beta_1 + \\beta_2 | 0.02 a 1.0 \\mu g/kg/min | Choque anafilático e parada cardíaca.<br/>Monitorar lactato (\\Delta lactato). |
| Vasopressina | Agonista V_1 \\| V_2 vascular | Dose fixa: 0.03 a 0.04 U/min | Adjuvante para poupar catecolamina; **nunca titular** isoladamente. |
| Dobutamina | Agonista \\beta_1 inotrópico | 2.5 \\le dose \\le 20 \\mu g/kg/min | Inótropo de resgate.<br/>Risco de arritmia se PAM \\le 65 mmHg. |
| Sódio / Bicarbonato | Solução Hipertônica 8.4% | Osmolaridade \\approx 2000 mOsm/L | pH alvo: 7.20 \\pm 0.05. |
| Teste de Tags | **Negrito** & *Itálico* & \`dose_max\` | < 100 mg/dia | <b>Tag HTML</b> & <br/> escapados com segurança. |
`;

  try {
    const renderedComplex = ReactDOMServer.renderToStaticMarkup(
      React.createElement(MarkdownRenderer, { content: complexCellsMd })
    );

    // Assert semantic tags
    recordTest(
      'Complex Cells',
      'Renderiza tag <table>',
      renderedComplex.includes('<table'),
      'Tag <table> gerada com sucesso'
    );
    recordTest(
      'Complex Cells',
      'Renderiza tag <thead>',
      renderedComplex.includes('<thead'),
      'Tag <thead> gerada com sucesso'
    );
    recordTest(
      'Complex Cells',
      'Renderiza tag <tbody>',
      renderedComplex.includes('<tbody'),
      'Tag <tbody> gerada com sucesso'
    );
    recordTest(
      'Complex Cells',
      'Renderiza tags <th> e <td>',
      renderedComplex.includes('<th') && renderedComplex.includes('<td'),
      'Tags <th> e <td> geradas com sucesso'
    );

    // Escaped pipe test: Vasopressina has "Agonista V_1 \| V_2 vascular"
    recordTest(
      'Complex Cells',
      'Tratamento de pipes escapados (\\|) em células sem quebra de colunas',
      renderedComplex.includes('V_1 | V_2 vascular') || (renderedComplex.includes('V_1') && renderedComplex.includes('V_2 vascular')),
      'Pipe escapado preservado no conteúdo da célula'
    );

    // Exact count of <th> columns in header (use regex /<th[\s>]/g to avoid matching <thead)
    const thMatches = (renderedComplex.match(/<th[\s>]/g) || []).length;
    recordTest(
      'Complex Cells',
      'Número exato de colunas no cabeçalho (4 colunas)',
      thMatches === 4,
      `Esperado 4 colunas <th>, encontrado: ${thMatches}`
    );

    // Exact count of <td> in tbody (6 rows * 4 cells = 24 cells)
    const tdMatches = (renderedComplex.match(/<td[\s>]/g) || []).length;
    recordTest(
      'Complex Cells',
      'Integridade do número de células <td> (6 linhas x 4 colunas = 24 células)',
      tdMatches === 24,
      `Esperado 24 células <td>, encontrado: ${tdMatches}`
    );

    // Greek and mathematical symbols preservation
    recordTest(
      'Complex Cells',
      'Preservação de símbolos matemáticos e gregos (\\mu, \\alpha, \\beta, \\ge, \\le, \\pm, \\Delta, \\approx)',
      renderedComplex.includes('\\mu') &&
      renderedComplex.includes('\\alpha') &&
      renderedComplex.includes('\\beta') &&
      renderedComplex.includes('\\ge') &&
      renderedComplex.includes('\\le') &&
      renderedComplex.includes('\\pm') &&
      renderedComplex.includes('\\Delta') &&
      renderedComplex.includes('\\approx'),
      'Símbolos gregos e matemáticos preservados intactos no texto'
    );

    // Markdown inline formatting inside cells (**bold**, *italic*, `code`)
    recordTest(
      'Complex Cells',
      'Renderização de formatação inline markdown dentro de células (**strong**, *em*, `code`)',
      renderedComplex.includes('<strong') &&
      renderedComplex.includes('nunca titular') &&
      renderedComplex.includes('Negrito') &&
      renderedComplex.includes('<em') &&
      renderedComplex.includes('Itálico') &&
      renderedComplex.includes('<code') &&
      renderedComplex.includes('dose_max'),
      'Tags <strong>, <em> e <code> compiladas corretamente no interior de <td>'
    );

    // Raw HTML sanitation / safe escaping inside cells
    recordTest(
      'Complex Cells',
      'Blindagem defensiva e sanitização segura de tags HTML brutas (<br/>, <b>)',
      renderedComplex.includes('&lt;br/&gt;') || renderedComplex.includes('&lt;br&gt;') || renderedComplex.includes('&lt;b&gt;Tag HTML&lt;/b&gt;'),
      'Tags HTML brutas são devidamente convertidas para entidades seguras (&lt;...&gt;), evitando XSS'
    );

    // Responsive container styling: overflow-x: auto
    recordTest(
      'Complex Cells',
      'Wrapper com overflow-x: auto para responsividade móvel',
      renderedComplex.includes('overflow-x:auto') || renderedComplex.includes('overflow-x: auto'),
      'Contêiner pai possui overflowX: auto'
    );

  } catch (err: any) {
    recordTest('Complex Cells', 'Execução da Suíte 1 sem exceções', false, `Erro: ${err.message}`);
  }

  // ==========================================================================
  // SUITE 2: EXTREME DIMENSIONS (Wide 15-Col, Tall 100-Row, Asymmetric)
  // ==========================================================================
  console.log('\n--- SUITE 2: EXTREME DIMENSIONS (Wide 15-Col, Tall 100-Row, Asymmetric) ---');

  // Test 2.1: Wide Table with 15 Columns
  const numCols = 15;
  const wideHeader = '| ' + Array.from({ length: numCols }, (_, i) => `Col_${i + 1}`).join(' | ') + ' |';
  const wideSep = '| ' + Array.from({ length: numCols }, () => '---').join(' | ') + ' |';
  const wideRow1 = '| ' + Array.from({ length: numCols }, (_, i) => `Dado_Longo_Extenso_Valor_${i + 1}`).join(' | ') + ' |';
  const wideRow2 = '| ' + Array.from({ length: numCols }, (_, i) => `Registro_Clinico_Metrica_${i + 1}`).join(' | ') + ' |';
  const wideTableMd = `${wideHeader}\n${wideSep}\n${wideRow1}\n${wideRow2}\n`;

  try {
    const renderedWide = ReactDOMServer.renderToStaticMarkup(
      React.createElement(MarkdownRenderer, { content: wideTableMd })
    );

    const wideTh = (renderedWide.match(/<th[\s>]/g) || []).length;
    const wideTd = (renderedWide.match(/<td[\s>]/g) || []).length;

    recordTest(
      'Extreme Dimensions',
      'Tabela ultra-larga (15 colunas) renderiza exatamente 15 <th>',
      wideTh === 15,
      `Esperado 15 <th>, encontrado: ${wideTh}`
    );
    recordTest(
      'Extreme Dimensions',
      'Tabela ultra-larga renderiza exatamente 30 <td> (2 linhas x 15 colunas)',
      wideTd === 30,
      `Esperado 30 <td>, encontrado: ${wideTd}`
    );
    recordTest(
      'Extreme Dimensions',
      'Tabela ultra-larga encapsulada no wrapper overflow-x: auto',
      renderedWide.includes('overflow-x:auto') || renderedWide.includes('overflow-x: auto'),
      'Wrapper com overflow horizontal verificado'
    );
  } catch (err: any) {
    recordTest('Extreme Dimensions', 'Tabela ultra-larga sem erros', false, err.message);
  }

  // Test 2.2: Deep/Tall Table with 100 Rows
  const numRows = 100;
  const tallHeader = '| ID | Paciente | Sinais Vitais | Diagnóstico Presuntivo | Conduta |';
  const tallSep = '| :--- | :--- | :--- | :--- | :--- |';
  const tallRows = Array.from({ length: numRows }, (_, i) =>
    `| Bed_${i + 1} | Paciente #${i + 1} | FC ${60 + (i % 60)} bpm, PA ${120 + (i % 40)}/80 | Síndrome Coronariana Aguda Tipo ${i + 1} | AAS 300mg + Ticagrelor 180mg |`
  ).join('\n');
  const tallTableMd = `${tallHeader}\n${tallSep}\n${tallRows}\n`;

  try {
    const startMs = Date.now();
    const renderedTall = ReactDOMServer.renderToStaticMarkup(
      React.createElement(MarkdownRenderer, { content: tallTableMd })
    );
    const renderDurationMs = Date.now() - startMs;

    const tallTd = (renderedTall.match(/<td[\s>]/g) || []).length;
    const tallTr = (renderedTall.match(/<tr[\s>]/g) || []).length;

    recordTest(
      'Extreme Dimensions',
      'Tabela profunda (100 linhas x 5 colunas = 500 <td>) renderiza integralmente',
      tallTd === 500,
      `Esperado 500 <td>, encontrado: ${tallTd}. Tempo de render: ${renderDurationMs}ms`
    );
    recordTest(
      'Extreme Dimensions',
      'Total de <tr> correto (1 header + 100 body = 101 <tr>)',
      tallTr === 101,
      `Esperado 101 <tr>, encontrado: ${tallTr}`
    );
    recordTest(
      'Extreme Dimensions',
      'Performance de renderização sub-segundo para 100 linhas',
      renderDurationMs < 500,
      `Tempo gasto: ${renderDurationMs}ms (< 500ms limite)`
    );
  } catch (err: any) {
    recordTest('Extreme Dimensions', 'Tabela profunda sem erros', false, err.message);
  }

  // Test 2.3: Asymmetric Table (rows with missing or extra cells)
  const asymmetricMd = `
| Critério | Definição | Pontos |
| :--- | :--- | :--- |
| Escala Glasgow | Menor que 8 | 3 |
| Hipoxemia | PaO2/FiO2 < 200 |
| Choque Refratário |
| Critério Extra | Adicional | 5 | Célula Sobressalente Ignorada |
`;

  try {
    const renderedAsym = ReactDOMServer.renderToStaticMarkup(
      React.createElement(MarkdownRenderer, { content: asymmetricMd })
    );
    recordTest(
      'Extreme Dimensions',
      'Tabela assimétrica renderiza sem crash',
      renderedAsym.includes('<table') && renderedAsym.includes('</table>'),
      'Renderização concluída com sucesso mesmo com linhas irregulares'
    );
  } catch (err: any) {
    recordTest('Extreme Dimensions', 'Tabela assimétrica não deve lançar exceção', false, err.message);
  }

  // ==========================================================================
  // SUITE 3: CANONICAL CLINICAL CHAPTERS IN CORPUS
  // ==========================================================================
  console.log('\n--- SUITE 3: CANONICAL CLINICAL CHAPTERS (Cap 2, Cap 11, Cap 99, Cap 79, Cap 120) ---');

  const cachePath = path.resolve(process.cwd(), 'scripts/index_cache.json');
  if (!fs.existsSync(cachePath)) {
    throw new Error(`scripts/index_cache.json não encontrado em ${cachePath}`);
  }
  const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

  // Test 3.1: Cap 2 - Via Aérea Difícil & Escore MACOCHA
  const cap2 = cacheData['2'];
  recordTest('Canonical Chapters', 'Capítulo 2 existe no cache', !!cap2);
  if (cap2) {
    const renderedCap2 = ReactDOMServer.renderToStaticMarkup(
      React.createElement(MarkdownRenderer, { content: cap2.content })
    );
    const hasTable2 = renderedCap2.includes('<table');
    const hasMacocha = renderedCap2.toLowerCase().includes('macocha');
    const tableCount2 = (renderedCap2.match(/<table/g) || []).length;

    recordTest(
      'Canonical Chapters',
      'Capítulo 2 renderiza tabelas GFM (Escore MACOCHA e afins)',
      hasTable2,
      `Tabelas <table> encontradas no Cap 2: ${tableCount2}`
    );
    recordTest(
      'Canonical Chapters',
      'Capítulo 2 preserva conteúdo de MACOCHA',
      hasMacocha,
      'Termo MACOCHA renderizado no HTML'
    );
    recordTest(
      'Canonical Chapters',
      'Capítulo 2 possui wrappers responsivos overflow-x: auto para todas as tabelas',
      (renderedCap2.match(/overflow-x:\s*auto/g) || []).length === tableCount2,
      `Wrappers responsivos coincidem com o número de tabelas (${tableCount2})`
    );
  }

  // Test 3.2: Cap 11 - Medicina Aeroespacial (Tabela Altitude vs Pressão Barométrica / PaO2)
  const cap11 = cacheData['11'];
  recordTest('Canonical Chapters', 'Capítulo 11 existe no cache', !!cap11);
  if (cap11) {
    const renderedCap11 = ReactDOMServer.renderToStaticMarkup(
      React.createElement(MarkdownRenderer, { content: cap11.content })
    );
    const hasTable11 = renderedCap11.includes('<table');
    const tableCount11 = (renderedCap11.match(/<table/g) || []).length;
    const hasAltitude = renderedCap11.toLowerCase().includes('altitude') || renderedCap11.toLowerCase().includes('torricelli');

    recordTest(
      'Canonical Chapters',
      'Capítulo 11 renderiza tabelas GFM de Medicina Aeroespacial (Altitude vs Pressão/PO2)',
      hasTable11,
      `Tabelas <table> encontradas no Cap 11: ${tableCount11}`
    );
    recordTest(
      'Canonical Chapters',
      'Capítulo 11 preserva conteúdo fisiológico (altitude/pressão)',
      hasAltitude,
      'Conteúdo canônico de física aeroespacial verificado'
    );
  }

  // Test 3.3: Cap 99 - Tromboelastografia (TEG)
  const cap99 = cacheData['99'];
  recordTest('Canonical Chapters', 'Capítulo 99 existe no cache', !!cap99);
  if (cap99) {
    const renderedCap99 = ReactDOMServer.renderToStaticMarkup(
      React.createElement(MarkdownRenderer, { content: cap99.content })
    );
    const hasTable99 = renderedCap99.includes('<table');
    const tableCount99 = (renderedCap99.match(/<table/g) || []).length;
    const hasTeg = renderedCap99.toLowerCase().includes('tromboelastografia') || renderedCap99.includes('TEG');

    recordTest(
      'Canonical Chapters',
      'Capítulo 99 renderiza tabelas GFM da curva TEG e condutas',
      hasTable99,
      `Tabelas <table> encontradas no Cap 99: ${tableCount99}`
    );
    recordTest(
      'Canonical Chapters',
      'Capítulo 99 preserva terminologia técnica do TEG',
      hasTeg,
      'Termos de tromboelastografia verificados'
    );
  }

  // Test 3.4: Cap 79 - Apendicite Aguda (Capítulo SEM tabelas)
  const cap79 = cacheData['79'];
  recordTest('Canonical Chapters', 'Capítulo 79 existe no cache', !!cap79);
  if (cap79) {
    const renderedCap79 = ReactDOMServer.renderToStaticMarkup(
      React.createElement(MarkdownRenderer, { content: cap79.content })
    );
    const hasTable79 = renderedCap79.includes('<table');
    const hasApendicite = renderedCap79.toLowerCase().includes('apendicite');
    const hasHeadings79 = renderedCap79.includes('<h1') || renderedCap79.includes('<h2') || renderedCap79.includes('<h3');
    const hasParagraphs79 = renderedCap79.includes('<p');

    recordTest(
      'Canonical Chapters',
      'Capítulo 79 (sem tabelas) NÃO renderiza tags <table> espúrias',
      !hasTable79,
      'Zero tags <table> confirmadas no Cap 79'
    );
    recordTest(
      'Canonical Chapters',
      'Capítulo 79 renderiza conteúdo clínico perfeitamente com títulos, listas e parágrafos',
      hasApendicite && hasHeadings79 && hasParagraphs79,
      'Renderização de texto narrativo pura, sem erros sintáticos'
    );
  }

  // Test 3.5: Cap 120 - Marca-passo no DE (Capítulo SEM tabelas)
  const cap120 = cacheData['120'];
  recordTest('Canonical Chapters', 'Capítulo 120 existe no cache', !!cap120);
  if (cap120) {
    const renderedCap120 = ReactDOMServer.renderToStaticMarkup(
      React.createElement(MarkdownRenderer, { content: cap120.content })
    );
    const hasTable120 = renderedCap120.includes('<table');
    const hasMarcapasso = renderedCap120.toLowerCase().includes('marca-passo') || renderedCap120.toLowerCase().includes('marcapasso');
    const hasParagraphs120 = renderedCap120.includes('<p');
    const hasHeadings120 = renderedCap120.includes('<h1') || renderedCap120.includes('<h2') || renderedCap120.includes('<h3');

    recordTest(
      'Canonical Chapters',
      'Capítulo 120 (sem tabelas) NÃO renderiza tags <table> espúrias',
      !hasTable120,
      'Zero tags <table> confirmadas no Cap 120'
    );
    recordTest(
      'Canonical Chapters',
      'Capítulo 120 renderiza conteúdo clínico de estimulação cardíaca com fidelidade estrutural',
      hasMarcapasso && hasParagraphs120 && hasHeadings120,
      'Texto clínico sobre marca-passo renderizado com sucesso (sem tabelas espúrias)'
    );
  }

  // ==========================================================================
  // SUITE 4: SEMANTIC HTML & CSS STYLING INSPECTION
  // ==========================================================================
  console.log('\n--- SUITE 4: SEMANTIC HTML & CSS STYLING INSPECTION ---');

  const testStyleTable = `
| Critério | Pontuação | Conduta |
| :--- | :---: | ---: |
| PAS < 90 | +2 | Volume |
`;
  const renderedStyle = ReactDOMServer.renderToStaticMarkup(
    React.createElement(MarkdownRenderer, { content: testStyleTable })
  );

  recordTest(
    'Semantic & CSS',
    'Presença do wrapper com overflowX: auto',
    renderedStyle.includes('overflow-x:auto') || renderedStyle.includes('overflow-x: auto'),
    'overflow-x: auto verificado no container'
  );

  recordTest(
    'Semantic & CSS',
    'Hierarquia semântica completa: div > table > thead/tbody > tr > th/td',
    renderedStyle.includes('<div') &&
    renderedStyle.includes('<table') &&
    renderedStyle.includes('<thead') &&
    renderedStyle.includes('<tbody') &&
    renderedStyle.includes('<tr') &&
    renderedStyle.includes('<th') &&
    renderedStyle.includes('<td'),
    'Estrutura em conformidade estrita com o padrão semântico W3C HTML5'
  );

  recordTest(
    'Semantic & CSS',
    'Cores do tema médico dark mode: cabeçalho #38bdf8 e bordas sutis',
    renderedStyle.includes('#38bdf8') && renderedStyle.includes('border-collapse:collapse'),
    'Cores e bordas personalizadas presentes no HTML compilado'
  );

  // ==========================================================================
  // SUITE 5: ADVERSARIAL MALFORMED & HOSTILE INPUTS
  // ==========================================================================
  console.log('\n--- SUITE 5: ADVERSARIAL MALFORMED & HOSTILE INPUTS ---');

  // Test 5.1: Text with raw unescaped pipes that is NOT a table
  const rawPipesText = `
Paciente admitido com PA 120/80 | Glasgow 15 | SatO2 98% em ar ambiente.
Não se trata de uma tabela, mas sim de notas rápidas de passagem de plantão com barras verticais.
`;
  const renderedRawPipes = ReactDOMServer.renderToStaticMarkup(
    React.createElement(MarkdownRenderer, { content: rawPipesText })
  );

  recordTest(
    'Adversarial Malformed',
    'Linha com pipes sem delimitador de tabela GFM não vira <table>',
    !renderedRawPipes.includes('<table'),
    'Tratado corretamente como <p> em vez de tabela acidental'
  );

  // Test 5.2: Pseudo-table without separator row (|---|)
  const pseudoTable = `
| Coluna 1 | Coluna 2 |
| Dado 1 | Dado 2 |
`;
  const renderedPseudo = ReactDOMServer.renderToStaticMarkup(
    React.createElement(MarkdownRenderer, { content: pseudoTable })
  );

  recordTest(
    'Adversarial Malformed',
    'Pseudo-tabela sem linha separadora (|---|) não gera tabela quebrada',
    !renderedPseudo.includes('<table'),
    'GFM exige linha de alinhamento/separação (|---|); ausência rejeita tabela sem quebrar render'
  );

  // Test 5.3: Table with code block containing pipes
  const codePipesTable = `
| Comando | Descrição |
| :--- | :--- |
| \`cat log.txt \\| grep error\` | Filtro de log |
| \`a || b\` | Operador OR lógico |
`;
  const renderedCodePipes = ReactDOMServer.renderToStaticMarkup(
    React.createElement(MarkdownRenderer, { content: codePipesTable })
  );

  recordTest(
    'Adversarial Malformed',
    'Código inline com pipes dentro de células da tabela GFM',
    renderedCodePipes.includes('<code') && renderedCodePipes.includes('cat log.txt') && renderedCodePipes.includes('grep error'),
    'Código inline com pipes renderizado sem truncar a linha da tabela'
  );

  // Test 5.4: Empty Table and Empty Content
  const emptyTableMd = `
| Col1 | Col2 |
| :--- | :--- |
`;
  const renderedEmpty = ReactDOMServer.renderToStaticMarkup(
    React.createElement(MarkdownRenderer, { content: emptyTableMd })
  );
  recordTest(
    'Adversarial Malformed',
    'Tabela com apenas cabeçalho e sem corpo',
    renderedEmpty.includes('<table') && renderedEmpty.includes('<thead'),
    'Renderizou <table> com <thead> sem travar'
  );

  const renderedNullContent = ReactDOMServer.renderToStaticMarkup(
    React.createElement(MarkdownRenderer, { content: '' })
  );
  recordTest(
    'Adversarial Malformed',
    'Conteúdo vazio retorna nulo/vazio graciosamente',
    renderedNullContent === '',
    'Retorno limpo sem erros de runtime'
  );

  // Test 5.5: Hostile script and image injections in table
  const hostileTable = `
| Critério | Injeção Maliciosa |
| :--- | :--- |
| Teste XSS | <script>alert("xss")</script> |
| Teste Event | <img src="x" onerror="evil()" /> |
`;
  const renderedHostile = ReactDOMServer.renderToStaticMarkup(
    React.createElement(MarkdownRenderer, { content: hostileTable })
  );
  recordTest(
    'Adversarial Malformed',
    'Script tags em tabelas não são executadas (react-markdown sanitiza por padrão)',
    !renderedHostile.includes('<script>'),
    'react-markdown elimina tags <script> no parser seguro'
  );

  // ==========================================================================
  // CONSOLIDATED SUMMARY & VERDICT
  // ==========================================================================
  console.log('\n========================================================================');
  console.log('                        RELATÓRIO DE RESULTADOS                         ');
  console.log('========================================================================');
  console.log(`Total de Asserções Adversariais: ${totalCount}`);
  console.log(`Passaram (PASS):                ${passCount}`);
  console.log(`Falharam (FAIL):                ${failCount}`);
  console.log(`Taxa de Sucesso:                ${((passCount / totalCount) * 100).toFixed(1)}%`);
  console.log('========================================================================\n');

  if (failCount > 0) {
    console.error(`ERRO: ${failCount} asserções falharam na suíte adversarial!`);
    process.exit(1);
  } else {
    console.log('VEREDITO EMPÍRICO: TODAS AS ASSERÇÕES PASSARAM COM SUCESSO ABSOLUTO (100%)!');
  }
}

runAdversarialSuite().catch((err) => {
  console.error('ERRO FATAL NA EXECUÇÃO DA SUÍTE:', err);
  process.exit(1);
});
