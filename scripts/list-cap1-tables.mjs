import fs from 'fs';

const pages = JSON.parse(fs.readFileSync('scripts/debug_cap1_raw.json', 'utf8'));

console.log('--- TABLES IN CHAPTER 1 ---');
pages.forEach(p => {
  p.items.forEach(it => {
    if (/^TABELA\s+\d+/i.test(it.str.trim())) {
      console.log(`Page ${p.pageNumber} at y=${it.y.toFixed(1)}, x=${it.x.toFixed(1)}: "${it.str}"`);
    }
  });
});
