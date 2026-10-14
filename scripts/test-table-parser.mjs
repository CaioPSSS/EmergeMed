import fs from 'fs';

const pages = JSON.parse(fs.readFileSync('scripts/debug_cap1_raw.json', 'utf8'));

function parseTableFromItems(tableTitle, tableItems, footnote) {
  // Sort items by Y desc, X asc
  tableItems.sort((a,b) => (Math.abs(b.y - a.y) > 2.5 ? b.y - a.y : a.x - b.x));

  // Find header line items: usually the topmost line(s)
  // Group into lines by Y
  const lines = [];
  let cur = [];
  let curY = null;
  for (const it of tableItems) {
    if (curY === null || Math.abs(curY - it.y) <= 3.0) {
      cur.push(it);
      if (curY === null) curY = it.y;
    } else {
      lines.push({ y: curY, items: cur });
      cur = [it];
      curY = it.y;
    }
  }
  if (cur.length > 0) lines.push({ y: curY, items: cur });

  if (lines.length === 0) return '';

  // Determine columns from the first line or two lines that have multiple items
  let headerLine = lines[0];
  if (headerLine.items.length === 1 && lines.length > 1 && lines[1].items.length > 1) {
    headerLine = lines[1];
  }

  // Find distinct column starts from all items with significant horizontal spacing
  const xPositions = [];
  tableItems.forEach(it => {
    // Only consider starts of text
    xPositions.push(Math.round(it.x));
  });

  // Cluster X positions
  const clusters = [];
  xPositions.sort((a,b) => a - b);
  for (const x of xPositions) {
    const found = clusters.find(c => Math.abs(c.mean - x) < 30);
    if (found) {
      found.count++;
      found.mean = (found.mean * (found.count - 1) + x) / found.count;
    } else {
      clusters.push({ mean: x, count: 1 });
    }
  }

  // Filter significant clusters (at least 2 items or in header)
  const validCols = clusters.filter(c => c.count >= 2).map(c => Math.round(c.mean)).sort((a,b) => a - b);
  if (validCols.length === 0) validCols.push(50);

  // Column assigner
  function getCol(x) {
    for (let i = 0; i < validCols.length - 1; i++) {
      const mid = (validCols[i] + validCols[i + 1]) / 2;
      if (x < mid) return i;
    }
    return validCols.length - 1;
  }

  // Build rows
  const rows = [];
  let curRow = null;
  let lastRowY = null;

  for (const line of lines) {
    const col0Items = line.items.filter(it => getCol(it.x) === 0);
    const otherItems = line.items.filter(it => getCol(it.x) > 0);

    const isNewRow = (col0Items.length > 0 && lastRowY !== null && Math.abs(lastRowY - line.y) > 10)
      || (curRow === null)
      || (otherItems.length > 0 && col0Items.length > 0)
      || (otherItems.length > 1 && col0Items.length === 0 && lastRowY !== null && Math.abs(lastRowY - line.y) > 12);

    if (isNewRow) {
      if (curRow) rows.push(curRow);
      curRow = Array(validCols.length).fill('');
      lastRowY = line.y;
    }

    for (const it of line.items) {
      const c = getCol(it.x);
      let s = it.str.trim();
      // Handle sub/super
      if (it.fontSize < 8.0 && (s === '2' || s === '3' || s === '+')) {
        curRow[c] = (curRow[c] || '').trimEnd() + s;
      } else {
        curRow[c] = (curRow[c] ? curRow[c] + ' ' : '') + s;
      }
    }
  }
  if (curRow) rows.push(curRow);

  if (rows.length === 0) return '';

  const header = rows[0];
  const body = rows.slice(1);

  let md = `\n### ${tableTitle}\n\n`;
  md += `| ${header.map(c => (c || '-').replace(/\|/g, '\\|')).join(' | ')} |\n`;
  md += `| ${header.map(() => '---').join(' | ')} |\n`;
  for (const r of body) {
    if (r.every(c => !c || !c.trim())) continue;
    md += `| ${r.map(c => (c || '').replace(/\|/g, '\\|')).join(' | ')} |\n`;
  }
  if (footnote) {
    md += `\n*${footnote}*\n`;
  }
  return md + '\n';
}

// Test on Page 80 Tabela 2
const p80 = pages.find(p => p.pageNumber === 80);
const t2Items = p80.items.filter(it => it.y <= 630 && it.y >= 475 && it.str.trim());
console.log(parseTableFromItems('TABELA 2 Suplementação de oxigênio', t2Items, 'DPOC: doença pulmonar obstrutiva crônica; IRpA: insuficiência respiratória aguda; SDRA: síndrome do desconforto respiratório agudo.'));

// Test on Page 83 Tabela 6
const p83 = pages.find(p => p.pageNumber === 83);
const t6Items = p83.items.filter(it => it.y <= 125 && it.y >= 45 && it.str.trim());
console.log(parseTableFromItems('TABELA 6 Behavioral Pain Scale', t6Items, ''));
