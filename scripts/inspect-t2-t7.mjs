import fs from 'fs';

const pages = JSON.parse(fs.readFileSync('scripts/debug_cap1_raw.json', 'utf8'));

// Inspect items around TABELA 2 on page 80
const p80 = pages.find(p => p.pageNumber === 80);
const t2Items = p80.items.filter(it => it.y <= 645 && it.y >= 350 && it.str.trim());
console.log('--- TABELA 2 (Page 80) items ---');
t2Items.sort((a,b) => (Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.x - b.x));
t2Items.forEach(it => console.log(`[y=${it.y.toFixed(1)}, x=${it.x.toFixed(1)}] "${it.str}"`));

// Inspect items around TABELA 7 on page 87
const p87 = pages.find(p => p.pageNumber === 87);
const t7Items = p87.items.filter(it => it.y <= 535 && it.y >= 370 && it.str.trim());
console.log('\n--- TABELA 7 (Page 87) items ---');
t7Items.sort((a,b) => (Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.x - b.x));
t7Items.forEach(it => console.log(`[y=${it.y.toFixed(1)}, x=${it.x.toFixed(1)}] "${it.str}"`));
