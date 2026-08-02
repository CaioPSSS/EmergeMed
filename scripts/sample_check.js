import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const cachePath = path.join(projectRoot, 'scripts', 'index_cache.json');
const mapPath = path.join(projectRoot, 'scripts', 'pdf_bookmarks_map.json');

const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
const mapData = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
const mapByNum = {};
mapData.forEach(c => mapByNum[c.number] = c);

// Random sample of 10 chapters
const sampleNums = [7, 14, 25, 42, 53, 67, 84, 102, 111, 115];

console.log('=== VERIFICAÇÃO MANUAL DE AMOSTRA ALEATÓRIA DE CAPÍTULOS ===\n');

sampleNums.forEach(num => {
  const cap = cacheData[num] || cacheData[String(num)];
  const meta = mapByNum[num];
  const nextMeta = mapByNum[num + 1];

  if (!cap) {
    console.log(`❌ Cap ${num}: NÃO ENCONTRADO NO CACHE`);
    return;
  }

  const content = cap.content || '';
  const lines = content.trim().split('\n').filter(l => l.trim().length > 0);

  const startLines = lines.slice(0, 5).join('\n');
  const endLines = lines.slice(-5).join('\n');

  console.log(`--------------------------------------------------`);
  console.log(`📖 CAPÍTULO ${num}: ${meta ? meta.title : ''}`);
  console.log(`Páginas: ${meta ? `${meta.startPage} até ${meta.endPage}` : ''}`);
  console.log(`Tamanho: ${content.length} caracteres, ${cap.word_count} palavras`);
  console.log(`\n--- INÍCIO (primeiras 5 linhas) ---`);
  console.log(startLines);
  console.log(`\n--- FIM (últimas 5 linhas) ---`);
  console.log(endLines);

  if (nextMeta) {
    console.log(`\n(Próximo capítulo esperado: Cap ${nextMeta.number} - "${nextMeta.title}")`);
    const containsNext = endLines.toLowerCase().includes(nextMeta.title.toLowerCase().slice(0, 15));
    if (containsNext) {
      console.log(`❌ VAZAMENTO DETECTADO! O final contém o início do próximo capítulo.`);
    } else {
      console.log(`✅ FIM LIMPO: Sem vazamento do Capítulo ${nextMeta.number}.`);
    }
  }

  console.log(`--------------------------------------------------\n`);
});
