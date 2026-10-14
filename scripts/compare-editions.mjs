import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const outline = JSON.parse(fs.readFileSync(path.join(projectRoot, 'scripts', 'outline_19ed.json'), 'utf8'));
const mainCaps = outline.filter(o => o.section.startsWith('Seção'));

// Read chapters-data.ts directly as text and extract title/number
const tsContent = fs.readFileSync(path.join(projectRoot, 'lib', 'chapters-data.ts'), 'utf8');
const oldCaps = [];
const capRegex = /"id":\s*(\d+),\s*"number":\s*(\d+),\s*"title":\s*"([^"]+)"/g;
let m;
while ((m = capRegex.exec(tsContent)) !== null) {
  oldCaps.push({ id: parseInt(m[1]), number: parseInt(m[2]), title: m[3] });
}

console.log('Old caps count:', oldCaps.length);
console.log('New caps count:', mainCaps.length);

let diffs = 0;
for (let i = 1; i <= 122; i++) {
  const newCap = mainCaps.find(c => c.title.startsWith(i + '.'));
  const oldCap = oldCaps.find(c => c.id === i);
  const newTitle = newCap ? newCap.title.replace(/^\d+\.\s*/, '').trim() : 'MISSING';
  const oldTitle = oldCap ? oldCap.title.trim() : 'MISSING';
  if (newTitle.toLowerCase() !== oldTitle.toLowerCase()) {
    diffs++;
    console.log(`Cap ${i}:\n  OLD: "${oldTitle}"\n  NEW: "${newTitle}"\n  PAGE: ${newCap?.page}\n`);
  }
}
console.log(`Total title differences: ${diffs}`);
