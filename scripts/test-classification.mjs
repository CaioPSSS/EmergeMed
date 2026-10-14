import fs from 'fs';

const pages = JSON.parse(fs.readFileSync('scripts/debug_cap1_raw.json', 'utf8'));

// Test paragraph and heading classification
for (let pIdx = 0; pIdx < Math.min(3, pages.length); pIdx++) {
  const p = pages[pIdx];
  const items = p.items.filter(it => it.str.trim());
  items.sort((a,b) => (Math.abs(b.y - a.y) > 2.5 ? b.y - a.y : a.x - b.x));

  // group to lines
  const lines = [];
  let cur = [];
  let curY = null;
  for (const it of items) {
    if (curY === null || Math.abs(curY - it.y) <= 2.5) {
      cur.push(it);
      if (curY === null) curY = it.y;
    } else {
      lines.push({ y: curY, items: cur });
      cur = [it];
      curY = it.y;
    }
  }
  if (cur.length > 0) lines.push({ y: curY, items: cur });

  console.log(`\n=== PAGE ${p.pageNumber} CLASSIFICATION ===`);
  for (const l of lines) {
    const it0 = l.items[0];
    const text = l.items.map(it => it.str).join(' ').trim();
    let type = 'UNKNOWN';
    if (it0.fontSize > 12.0) type = 'H2_HEADING';
    else if (it0.fontSize > 9.5 && Math.abs(it0.x - 68.5) < 3.0) type = 'NEW_PARAGRAPH';
    else if (it0.fontSize > 9.5 && Math.abs(it0.x - 44.8) < 3.0) type = 'CONT_PARAGRAPH';
    else if (Math.abs(it0.x - 81.5) < 3.0 || Math.abs(it0.x - 76.4) < 3.0) type = 'NEW_BULLET';
    else if (Math.abs(it0.x - 100.7) < 3.0) type = 'CONT_BULLET';
    else if (it0.fontSize < 9.0 && Math.abs(it0.x - 44.8) < 3.0) type = 'SUBHEADING';
    else if (it0.fontSize < 9.0 && text.startsWith('TABELA')) type = 'TABLE_START';

    console.log(`[x=${it0.x.toFixed(1)}, sz=${it0.fontSize.toFixed(1)}, type=${type}] ${text.slice(0, 70)}`);
  }
}
