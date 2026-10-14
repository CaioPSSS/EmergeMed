import fs from 'fs';

const pages = JSON.parse(fs.readFileSync('scripts/debug_cap1_raw.json', 'utf8'));
const fontStats = {};

for (const p of pages) {
  for (const it of p.items) {
    if (!it.str.trim()) continue;
    const key = `${it.font} (sz ${it.fontSize.toFixed(1)})`;
    if (!fontStats[key]) {
      fontStats[key] = { count: 0, samples: [] };
    }
    fontStats[key].count++;
    if (fontStats[key].samples.length < 3) {
      fontStats[key].samples.push(it.str);
    }
  }
}

console.log('Font stats in Chapter 1:');
for (const [k, v] of Object.entries(fontStats)) {
  console.log(`- ${k}: ${v.count} occurrences. Samples:`, v.samples);
}
