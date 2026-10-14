/**
 * tests/verify-m13-frontend-reader-llm.ts
 *
 * Verificação Automatizada do Marco M13:
 * 1. Renderização de MarkdownRenderer com remark-gfm em tabelas GFM autênticas (<table>, <thead>, <tbody>, <tr>, <th>, <td>)
 * 2. Validação dos capítulos estratégicos (1, 2, 11, 99, 120, 123, 150)
 * 3. Validação de links externos (target="_blank", rel="noopener noreferrer") e imagens
 * 4. Validação de ausência de mojibake e conformidade de pipeline LLM
 */

import React from 'react';
import ReactDOMServer from 'react-dom/server';
import fs from 'fs';
import path from 'path';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { CHAPTERS_DATA } from '../lib/chapters-data';
import { fixMojibake } from '../lib/text-sanitizer';

let totalAssertions = 0;
let passedAssertions = 0;

function assert(condition: boolean, message: string) {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
    console.log(`  ✓ [PASS] ${message}`);
  } else {
    console.error(`  ✗ [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runM13Verification() {
  console.log('================================================================');
  console.log('🚀 INICIANDO VERIFICAÇÃO AUTOMATIZADA DO MARCO M13');
  console.log('================================================================\n');

  // 1. CARREGAMENTO DO CORPUS CANÔNICO
  const cachePath = path.resolve(process.cwd(), 'scripts/index_cache.json');
  assert(fs.existsSync(cachePath), 'Arquivo scripts/index_cache.json deve existir');
  const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

  assert(Object.keys(cacheData).length === 150, 'index_cache.json deve conter exatamente 150 capítulos');
  assert(CHAPTERS_DATA.length === 150, 'lib/chapters-data.ts deve exportar exatamente 150 capítulos');

  console.log('\n--- SUÍTE 1: VALIDAÇÃO DE TABELAS GFM & MARKDOWN RENDERER ---');

  // Teste 1.1: Tabela GFM Sintética
  const syntheticTableMd = `
| Parâmetro | Valor de Referência | Ação Clínica |
| :--- | :---: | ---: |
| SatO2 | < 90% | Iniciar O2 suplementar |
| PA Sistólica | < 90 mmHg | Alíquota de cristaloide 500ml |
| Lactato | > 4.0 mmol/L | Protocolo de Choque Séptico |
`;

  const renderedSynthetic = ReactDOMServer.renderToStaticMarkup(
    React.createElement(MarkdownRenderer, { content: syntheticTableMd })
  );

  assert(renderedSynthetic.includes('<table'), 'Tabela sintética deve renderizar tag <table>');
  assert(renderedSynthetic.includes('<thead'), 'Tabela sintética deve renderizar tag <thead>');
  assert(renderedSynthetic.includes('<tbody'), 'Tabela sintética deve renderizar tag <tbody>');
  assert(renderedSynthetic.includes('<tr'), 'Tabela sintética deve renderizar tag <tr>');
  assert(renderedSynthetic.includes('<th'), 'Tabela sintética deve renderizar tag <th>');
  assert(renderedSynthetic.includes('<td'), 'Tabela sintética deve renderizar tag <td>');
  assert(
    renderedSynthetic.includes('overflow-x:auto') || renderedSynthetic.includes('overflow-x: auto'),
    'Tabela sintética deve ter wrapper responsivo com overflow-x: auto'
  );
  assert(renderedSynthetic.includes('color:#38bdf8'), 'Cabeçalho da tabela deve conter cor de destaque #38bdf8');
  assert(renderedSynthetic.includes('Protocolo de Choque Séptico'), 'Conteúdo das células da tabela deve estar preservado');

  // Teste 1.2: Links e Imagens
  const linksAndImgMd = `
Consulte as diretrizes em [Diretriz SBC](https://sbc.org.br/diretriz).

![Fluxograma da Sala Vermelha](https://emergemed.app/img/red-room.png)
`;

  const renderedLinksAndImg = ReactDOMServer.renderToStaticMarkup(
    React.createElement(MarkdownRenderer, { content: linksAndImgMd })
  );

  assert(renderedLinksAndImg.includes('target="_blank"'), 'Links devem renderizar com target="_blank"');
  assert(renderedLinksAndImg.includes('rel="noopener noreferrer"'), 'Links devem renderizar com rel="noopener noreferrer"');
  assert(renderedLinksAndImg.includes('<img'), 'Imagens devem renderizar tag <img>');
  assert(renderedLinksAndImg.includes('max-width:100%') || renderedLinksAndImg.includes('max-width: 100%'), 'Imagens devem ser responsivas com max-width: 100%');

  console.log('\n--- SUÍTE 2: CAPÍTULOS ESTRATÉGICOS DA 19ª EDIÇÃO NO RENDERER ---');

  const strategicChapters = [
    { id: 1, name: 'Triagem / Paciente Grave', expectedTable: true, sampleText: 'Abordagem inicial do paciente grave' },
    { id: 2, name: 'Via Aérea / MACOCHA', expectedTable: true, sampleText: 'MACOCHA' },
    { id: 11, name: 'Medicina Aeroespacial', expectedTable: true, sampleText: 'Torricelli' },
    { id: 99, name: 'Tromboelastografia (TEG)', expectedTable: true, sampleText: 'Tromboelastografia' },
    { id: 120, name: 'Marca-passo no DE', expectedTable: false, sampleText: 'marca-passo' },
    { id: 123, name: 'Cuidados Pós-PCR', expectedTable: true, sampleText: 'pós-parada' },
    { id: 150, name: 'Nutrição Enteral / Realimentação', expectedTable: true, sampleText: 'realimentação' },
  ];

  for (const item of strategicChapters) {
    const rawChapter = cacheData[String(item.id)];
    assert(!!rawChapter, `Capítulo ${item.id} (${item.name}) deve existir no cache`);
    assert(rawChapter.content.length > 500, `Capítulo ${item.id} deve ter conteúdo substancial (> 500 chars)`);
    assert(
      rawChapter.content.toLowerCase().includes(item.sampleText.toLowerCase()),
      `Capítulo ${item.id} deve conter texto esperado "${item.sampleText}"`
    );

    // Renderizar via MarkdownRenderer
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(MarkdownRenderer, { content: rawChapter.content })
    );

    assert(html.length > 1000, `Renderização HTML do Cap ${item.id} deve ser rica (> 1000 chars)`);

    if (item.expectedTable) {
      assert(html.includes('<table'), `Capítulo ${item.id} (${item.name}) deve renderizar elemento <table> autêntico`);
      assert(html.includes('<thead'), `Capítulo ${item.id} deve renderizar <thead>`);
      assert(html.includes('<tbody'), `Capítulo ${item.id} deve renderizar <tbody>`);
      assert(html.includes('<th style="padding:10px 14px;color:#38bdf8'), `Capítulo ${item.id} deve ter cabeçalho <th> estilizado com #38bdf8`);
    }

    // Se o capítulo contiver subtítulos H1, H2 ou H3, validar tags semânticas
    if (rawChapter.content.includes('# ')) {
      assert(html.includes('<h1') || html.includes('<h2') || html.includes('<h3'), `Capítulo ${item.id} deve renderizar cabeçalhos estilizados`);
    }
  }

  console.log('\n--- SUÍTE 3: AUDITORIA DE TODAS AS TABELAS GFM NO CORPUS (150 CAPÍTULOS) ---');

  let chaptersWithTables = 0;
  let totalHtmlTablesRendered = 0;

  for (let id = 1; id <= 150; id++) {
    const chapter = cacheData[String(id)];
    if (!chapter) continue;

    const hasGfmTableSyntax = /\|[\s-:]+\|/.test(chapter.content);
    if (hasGfmTableSyntax) {
      chaptersWithTables++;
      const html = ReactDOMServer.renderToStaticMarkup(
        React.createElement(MarkdownRenderer, { content: chapter.content })
      );
      assert(
        html.includes('<table'),
        `Capítulo ${id} contendo sintaxe GFM deve renderizar tag <table>`
      );
      const tableCount = (html.match(/<table/g) || []).length;
      totalHtmlTablesRendered += tableCount;
    }
  }

  assert(chaptersWithTables >= 140, `Pelo menos 140 capítulos devem conter tabelas GFM (Encontrados: ${chaptersWithTables})`);
  assert(totalHtmlTablesRendered >= 400, `Total de tabelas HTML renderizadas deve ser >= 400 (Encontradas: ${totalHtmlTablesRendered})`);
  console.log(`  ℹ Total de capítulos com tabelas GFM validadas: ${chaptersWithTables}/150`);
  console.log(`  ℹ Total de elementos <table> renderizados com sucesso: ${totalHtmlTablesRendered}`);

  console.log('\n--- SUÍTE 4: FIDELIDADE DE TEXTO E HIGIENIZAÇÃO LLM ---');

  let totalMojibakeFound = 0;
  let totalReplacementChars = 0;

  for (let id = 1; id <= 150; id++) {
    const chapter = cacheData[String(id)];
    if (!chapter) continue;

    // Verificar se há mojibake padrão
    if (/[ÃÂ][\u0080-\u00BF]/.test(chapter.content)) {
      totalMojibakeFound++;
    }
    // Verificar caractere de substituição unicode
    if (chapter.content.includes('\uFFFD')) {
      totalReplacementChars++;
    }

    // Verificar idempotência do sanitizer
    const sanitized = fixMojibake(chapter.content);
    assert(
      sanitized === chapter.content,
      `Capítulo ${id} já deve estar em UTF-8 canônico e não sofrer mutação por fixMojibake`
    );
  }

  assert(totalMojibakeFound === 0, 'Zero ocorrências de mojibake em todos os 150 capítulos');
  assert(totalReplacementChars === 0, 'Zero ocorrências de \\uFFFD em todos os 150 capítulos');

  console.log('\n================================================================');
  console.log(`🎉 TODAS AS ${passedAssertions}/${totalAssertions} ASSERÇÕES PASSARAM COM 100% DE SUCESSO!`);
  console.log('================================================================\n');
}

runM13Verification().catch((err) => {
  console.error('\n❌ ERRO NA VERIFICAÇÃO DO MARCO M13:', err);
  process.exit(1);
});
