import fs from 'fs';

const pages = JSON.parse(fs.readFileSync('scripts/debug_cap1_raw.json', 'utf8'));

function parseTableWithHeaderCols(tableTitle, tableItems, footnote) {
  tableItems.sort((a,b) => (Math.abs(b.y - a.y) > 2.5 ? b.y - a.y : a.x - b.x));

  // group to lines
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

  // First line with multiple items is the header
  let headerLine = lines.find(l => l.items.length >= 2) || lines[0];

  // Group header line items into column headers (merge items with gap < 20)
  const headerCols = [];
  let curHCol = null;
  headerLine.items.sort((a,b) => a.x - b.x).forEach(it => {
    if (!curHCol || it.x - (curHCol.x + curHCol.w) > 20) {
      curHCol = { x: it.x, w: it.w, str: it.str.trim() };
      headerCols.push(curHCol);
    } else {
      curHCol.w = (it.x + it.w) - curHCol.x;
      curHCol.str += (curHCol.str.endsWith('O') && it.str === '2' ? '' : ' ') + it.str.trim();
    }
  });

  const numCols = headerCols.length;
  // Boundaries between columns
  const boundaries = [];
  for (let i = 0; i < numCols - 1; i++) {
    // boundary is midway between end of col i and start of col i+1
    const endI = headerCols[i].x + headerCols[i].w;
    const startNext = headerCols[i + 1].x;
    boundaries.push((endI + startNext) / 2);
  }

  function getCol(x) {
    for (let i = 0; i < boundaries.length; i++) {
      if (x < boundaries[i]) return i;
    }
    return boundaries.length;
  }

  // Now assign lines to rows
  const rows = [];
  let curRow = null;
  let lastRowY = null;

  for (const line of lines) {
    // Is this line the header line itself?
    if (line === headerLine) {
      rows.push(headerCols.map(c => c.str));
      continue;
    }

    const col0Items = line.items.filter(it => getCol(it.x) === 0);
    const hasCol0 = col0Items.length > 0;
    const isNewRow = (hasCol0 && lastRowY !== null && Math.abs(lastRowY - line.y) > 10)
      || (curRow === null);

    if (isNewRow) {
      if (curRow) rows.push(curRow);
      curRow = Array(numCols).fill('');
      lastRowY = line.y;
    }

    // Sort line items by x
    line.items.sort((a,b) => a.x - b.x);
    for (const it of line.items) {
      const c = getCol(it.x);
      let s = it.str.trim();
      const existing = curRow[c] || '';
      if (it.fontSize < 8.0 && (s === '2' || s === '3' || s === '+') && existing.length > 0 && !existing.endsWith(' ')) {
        curRow[c] = existing + s;
      } else {
        curRow[c] = (existing ? existing + ' ' : '') + s;
      }
    }
  }
  if (curRow) rows.push(curRow);

  const header = rows[0] || [];
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

const p80 = pages.find(p => p.pageNumber === 80);
const t2Items = p80.items.filter(it => it.y <= 630 && it.y >= 475 && it.str.trim());
console.log(parseTableWithHeaderCols('TABELA 2 Suplementação de oxigênio', t2Items, 'DPOC: doença pulmonar obstrutiva crônica; IRpA: insuficiência respiratória aguda; SDRA: síndrome do desconforto respiratório agudo.'));
