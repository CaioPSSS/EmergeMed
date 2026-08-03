import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function fixMojibake(text) {
  if (!text) return text;
  try {
    if (text.includes('Ã') || text.includes('Â')) {
      return Buffer.from(text, 'latin1').toString('utf8');
    }
  } catch (e) {}
  return text;
}

const cachePath = path.join(projectRoot, 'scripts', 'index_cache.json');
const rawCache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

let countFixed = 0;
const fixedCache = {};

for (const [key, item] of Object.entries(rawCache)) {
  const oldContent = item.content || '';
  const newContent = fixMojibake(oldContent);
  if (oldContent !== newContent) {
    countFixed++;
  }
  fixedCache[key] = {
    ...item,
    content: newContent,
  };
}

fs.writeFileSync(cachePath, JSON.stringify(fixedCache, null, 2), 'utf8');
console.log(`✅ Corrigidos caracteres de acentuação (Mojibake UTF-8) em ${countFixed} de ${Object.keys(rawCache).length} capítulos!`);

// Print sample from Chapter 58
const cap58 = fixedCache['58'] || fixedCache['cap-58'] || Object.values(fixedCache).find((c) => c.chapter_id === 58);
if (cap58) {
  console.log('\n=== AMOSTRA CAPÍTULO 58 APÓS CORREÇÃO ===');
  console.log(cap58.content.slice(0, 600));
}
