import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const cachePath = path.join(projectRoot, 'scripts', 'index_cache.json');
const mapPath = path.join(projectRoot, 'scripts', 'pdf_bookmarks_map.json');

let chaptersMap = [];
if (fs.existsSync(mapPath)) {
  try {
    chaptersMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  } catch (e) {}
}

const mapByNum = new Map(chaptersMap.map((c) => [c.number, c]));

let cacheData = {};
if (fs.existsSync(cachePath)) {
  try {
    cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  } catch (e) {
    cacheData = {};
  }
}

function saveCache() {
  fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2), 'utf8');
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log('\n==================================================');
console.log('✏️  EmergeMed — Inserção Manual de Conteúdo de Capítulos');
console.log('==================================================\n');
console.log('Como usar:');
console.log('1. Digite o número do capítulo (ex: 7) e pressione Enter.');
console.log('2. Cole o conteúdo Markdown do capítulo no terminal.');
console.log('3. Na última linha, digite "FIM" e pressione Enter.');
console.log('4. Digite "sair" a qualquer momento para finalizar.\n');

function promptChapterNumber() {
  rl.question('📌 Digite o NÚMERO do capítulo (ex: 7) ou "sair": ', (answer) => {
    const input = answer.trim().toLowerCase();
    if (input === 'sair' || input === 'exit' || input === 'q') {
      console.log('\n👋 Encerrado com sucesso! Todo o cache local está salvo.\n');
      rl.close();
      process.exit(0);
    }

    const capNum = parseInt(input, 10);
    if (isNaN(capNum) || capNum < 1 || capNum > 119) {
      console.log('❌ Número inválido. Digite um número de 1 a 119.\n');
      promptChapterNumber();
      return;
    }

    const mapItem = mapByNum.get(capNum);
    const title = mapItem ? mapItem.title : `Capítulo ${capNum}`;

    console.log(`\n--------------------------------------------------`);
    console.log(`📖 Capítulo ${capNum}: "${title}"`);
    console.log(`--------------------------------------------------`);
    console.log(`Cole o texto Markdown abaixo. Quando terminar, digite "FIM" em uma nova linha e aperte Enter:\n`);

    const lines = [];

    const onLine = (line) => {
      if (line.trim() === 'FIM') {
        rl.off('line', onLine);
        const fullContent = lines.join('\n').trim();

        if (fullContent.length === 0) {
          console.log('\n⚠️ Nenhum texto foi colado. Operação cancelada para este capítulo.\n');
        } else {
          const wordCount = fullContent.split(/\s+/).filter(Boolean).length;
          cacheData[capNum] = {
            chapter_id: capNum,
            content: fullContent,
            word_count: wordCount,
            updated_at: new Date().toISOString(),
            cache_version: 2,
          };
          saveCache();
          console.log(`\n✅ SUCESSO! Capítulo ${capNum} ("${title}") salvo no cache!`);
          console.log(`   - ${fullContent.length.toLocaleString()} caracteres`);
          console.log(`   - ${wordCount.toLocaleString()} palavras\n`);
        }

        promptChapterNumber();
      } else {
        lines.push(line);
      }
    };

    rl.on('line', onLine);
  });
}

promptChapterNumber();
