import fs from 'fs';
import path from 'path';

const cachePath = 'scripts/index_cache.json';
const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
const keys = Object.keys(cache);

console.log('==================================================');
console.log('🔍 RELATÓRIO DE AUDITORIA E VALIDAÇÃO DA 19ª EDIÇÃO');
console.log('==================================================\n');

console.log(`1. Total de chaves no JSON: ${keys.length}`);
if (keys.length !== 150) {
  console.error(`❌ Esperado 150 capítulos, encontrado: ${keys.length}`);
} else {
  console.log(`✅ Todos os 150 capítulos (122 principais + 28 complementares) estão presentes!`);
}

let emptyChapters = 0;
let shortChapters = 0;
let totalWords = 0;
let totalChars = 0;
let totalTables = 0;
let totalQuadros = 0;
let totalFigures = 0;
let mojibakeCount = 0;
let controlCharCount = 0;
let swallowedFiguresCount = 0;
let footnoteRowsCount = 0;

const mojibakePatterns = [
  /!ÒO/,
  /\u001c/,
  /\u001d/,
  /\u0014/,
  /\uFFFD/,
  /Cap\?tulo/i,
  /introdu\?o/i,
  /MANE-O/,
  /TERAPÇUTICA/,
  /EVIDÇNCIAS/,
  /HEMODINÆMICO/,
  /EMERGÇNCIA/,
  /HiSocoagXliYel/,
  /HiSercoagXlaEilidade/,
  /FiErinólise/,
  /HiSofiErinólise/,
  /FXnção SlaTXetiria/,
  /FiErinogrnio/,
  /comSXtadori\]ada/,
  /&anadian & SSine/
];

keys.forEach(k => {
  const cap = cache[k];
  if (!cap.content || cap.content.trim().length === 0) {
    console.error(`❌ Capítulo ${k} está vazio!`);
    emptyChapters++;
  }
  if (cap.word_count < 500) {
    console.warn(`⚠️ Capítulo ${k} tem poucas palavras: ${cap.word_count}`);
    shortChapters++;
  }
  totalWords += cap.word_count;
  totalChars += cap.char_count || cap.content.length;

  // Count tables
  const tables = (cap.content.match(/### TABELA/g) || []).length;
  totalTables += tables;

  // Count quadros
  const quadros = (cap.content.match(/### QUADRO/g) || []).length;
  totalQuadros += quadros;

  // Count figures
  const figs = (cap.content.match(/\*\*FIGURA/g) || []).length;
  totalFigures += figs;

  // Check mojibake
  for (const pat of mojibakePatterns) {
    if (pat.test(cap.content)) {
      console.warn(`⚠️ Possível mojibake no Cap ${k} com padrão ${pat}`);
      mojibakeCount++;
    }
  }

  // Check unprintable control characters
  for (let i = 0; i < cap.content.length; i++) {
    const code = cap.content.charCodeAt(i);
    if (code < 32 && code !== 10 && code !== 13 && code !== 9) {
      controlCharCount++;
    }
  }

  // Check swallowed figures in tables
  const lines = cap.content.split('\n');
  for (const l of lines) {
    if (l.startsWith('|') && /FIGURA\s+\d+/i.test(l)) {
      swallowedFiguresCount++;
    }
    if (l.startsWith('|') && !l.includes('---')) {
      const clean = l.replace(/^\|\s*/, '');
      if (/^(Adaptad[ao] de|Fonte:|Modificad[ao] de)/i.test(clean)) {
        footnoteRowsCount++;
      }
    }
  }
});

console.log(`\n2. Métricas de Integridade:`);
console.log(`   - Capítulos vazios: ${emptyChapters}`);
console.log(`   - Capítulos curtos (< 500 palavras): ${shortChapters}`);
console.log(`   - Total de palavras: ${totalWords.toLocaleString()}`);
console.log(`   - Total de caracteres: ${totalChars.toLocaleString()}`);
console.log(`   - Média de palavras por capítulo: ${Math.round(totalWords / keys.length).toLocaleString()}`);
console.log(`   - Total de TABELAS Markdown identificadas: ${totalTables}`);
console.log(`   - Total de QUADROS clínicos identificados: ${totalQuadros}`);
console.log(`   - Total de FIGURAS/FLUXOGRAMAS identificados: ${totalFigures}`);
console.log(`   - Caracteres de controle não imprimíveis restantes: ${controlCharCount}`);
console.log(`   - Figuras engolidas por tabelas: ${swallowedFiguresCount}`);
console.log(`   - Linhas de citação/fonte presas em tabelas: ${footnoteRowsCount}`);
console.log(`   - Ocorrências de mojibake detectadas: ${mojibakeCount}`);

console.log('\n3. Amostra de Capítulos Estratégicos:');
const sampleIds = ['1', '2', '11', '20', '31', '43', '79', '99', '120', '121', '122', '123', '150'];
sampleIds.forEach(id => {
  const c = cache[id];
  if (!c) {
    console.error(`❌ Cap ${id} ausente!`);
    return;
  }
  const lines = c.content.split('\n').filter(Boolean);
  const snippet = lines.slice(0, 3).join(' | ');
  const capTables = (c.content.match(/### TABELA/g) || []).length;
  const capQuadros = (c.content.match(/### QUADRO/g) || []).length;
  const capFigs = (c.content.match(/\*\*FIGURA/g) || []).length;
  console.log(`   [ID ${c.chapter_id}] Cap ${c.number}: "${c.title}"`);
  console.log(`      Págs: ${c.startPage}-${c.endPage} (${c.pageCount} pgs) | Palavras: ${c.word_count.toLocaleString()} | Tabelas: ${capTables} | Quadros: ${capQuadros} | Figuras: ${capFigs}`);
  console.log(`      Início: "${snippet.slice(0, 90)}..."\n`);
});

console.log('==================================================');
