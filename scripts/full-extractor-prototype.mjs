import fs from 'fs';
import pdf from 'pdf-parse';

const pdfPath = 'C:\\Users\\souza\\Downloads\\Medicina de emergência abordagem prática 19ed 2025.pdf';
const dataBuffer = fs.readFileSync(pdfPath);
const chaptersMeta = JSON.parse(fs.readFileSync('scripts/chapters_19ed_pages.json', 'utf8'));

// Clean character encoding artifacts
function cleanText(str) {
  if (!str) return '';
  return str
    .replace(/\u001c|\u001d/g, '–')
    .replace(/\u0014/g, '×')
    .replace(/\u0000/g, '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ');
}

// Check if a token is a subscript/superscript
function isSubSup(prevStr, curStr, curFontSize) {
  if (curFontSize > 7.8) return false;
  const s = curStr.trim();
  if (!/^[0-9+\-abc]$/i.test(s)) return false;
  const p = prevStr.trim();
  if (/^(O|CO|SatO|PaO|PaCO|FiO|SpO|EtCO|SaO|PvO|HCO|NO|SO|H|Ca|K|Na|Mg|Cl|PO|mL|cm|mm|m|\d+)$/i.test(p)) {
    return true;
  }
  return false;
}

// Assemble line items into clean tokens
function assembleLineItems(rawItems) {
  // Sort by X asc
  const items = [...rawItems].sort((a, b) => a.x - b.x);
  const tokens = [];

  for (let i = 0; i < items.length; i++) {
    const cur = items[i];
    const prev = tokens[tokens.length - 1];

    if (!prev) {
      tokens.push({
        str: cur.str,
        x: cur.x,
        w: cur.w,
        fontSize: cur.fontSize,
        font: cur.font
      });
      continue;
    }

    const gap = cur.x - (prev.x + prev.w);

    if (isSubSup(prev.str, cur.str, cur.fontSize) || (gap < 2.0 && cur.fontSize < 8.0)) {
      prev.str += cur.str;
      prev.w = (cur.x + cur.w) - prev.x;
    } else if (gap < 1.5) {
      prev.str += cur.str;
      prev.w = (cur.x + cur.w) - prev.x;
    } else {
      tokens.push({
        str: cur.str,
        x: cur.x,
        w: cur.w,
        fontSize: cur.fontSize,
        font: cur.font
      });
    }
  }

  return tokens;
}

// Build string from tokens
function lineToString(tokens) {
  let s = '';
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (i === 0) {
      s += t.str;
    } else {
      const prev = tokens[i - 1];
      const needsSpace = !s.endsWith(' ') && !t.str.startsWith(' ') && (t.x - (prev.x + prev.w) > 1.8);
      s += (needsSpace ? ' ' : '') + t.str;
    }
  }
  return cleanText(s).trim();
}

// Format a Table into markdown
function renderMarkdownTable(tableTitle, tableRows, footnote) {
  if (tableRows.length === 0) return `\n### ${tableTitle}\n\n`;

  // Find column boundaries from header or clustering
  const allTokens = [];
  tableRows.forEach(r => allTokens.push(...r.tokens));

  // Find header line (first line with >= 2 distinct tokens separated by >= 25pt)
  let headerLine = null;
  for (const r of tableRows) {
    if (r.tokens.length >= 2) {
      const gaps = [];
      for (let i = 1; i < r.tokens.length; i++) {
        gaps.push(r.tokens[i].x - (r.tokens[i-1].x + r.tokens[i-1].w));
      }
      if (gaps.some(g => g > 25)) {
        headerLine = r;
        break;
      }
    }
  }

  let colBoundaries = [];

  if (headerLine && headerLine.tokens.length >= 2) {
    // Cluster header tokens into column titles
    const colStarts = [];
    headerLine.tokens.forEach(t => {
      const existing = colStarts.find(cs => Math.abs(cs - t.x) < 25);
      if (!existing) colStarts.push(t.x);
    });
    colStarts.sort((a, b) => a - b);
    for (let i = 0; i < colStarts.length - 1; i++) {
      colBoundaries.push((colStarts[i] + colStarts[i + 1]) / 2);
    }
  }

  if (colBoundaries.length === 0) {
    // Fallback: cluster all X
    const xs = allTokens.map(t => t.x).sort((a, b) => a - b);
    const clusters = [];
    xs.forEach(x => {
      const found = clusters.find(c => Math.abs(c.mean - x) < 30);
      if (found) {
        found.count++;
        found.mean = (found.mean * (found.count - 1) + x) / found.count;
      } else {
        clusters.push({ mean: x, count: 1 });
      }
    });
    const significant = clusters.filter(c => c.count >= 2).map(c => c.mean).sort((a, b) => a - b);
    for (let i = 0; i < significant.length - 1; i++) {
      colBoundaries.push((significant[i] + significant[i + 1]) / 2);
    }
  }

  const numCols = colBoundaries.length + 1;

  function getColIdx(x) {
    for (let i = 0; i < colBoundaries.length; i++) {
      if (x < colBoundaries[i]) return i;
    }
    return colBoundaries.length;
  }

  const gridRows = [];
  let curGridRow = null;
  let lastRowY = null;

  for (const line of tableRows) {
    const col0Tokens = line.tokens.filter(t => getColIdx(t.x) === 0);
    const hasCol0 = col0Tokens.length > 0;
    const isNewRow = (hasCol0 && lastRowY !== null && Math.abs(lastRowY - line.y) > 9)
      || (curGridRow === null);

    if (isNewRow) {
      if (curGridRow) gridRows.push(curGridRow);
      curGridRow = Array(numCols).fill('');
      lastRowY = line.y;
    }

    for (const t of line.tokens) {
      const c = getColIdx(t.x);
      const str = cleanText(t.str);
      if (curGridRow[c]) {
        curGridRow[c] += ' ' + str;
      } else {
        curGridRow[c] = str;
      }
    }
  }
  if (curGridRow) gridRows.push(curGridRow);

  if (gridRows.length === 0) return `\n### ${tableTitle}\n\n`;

  // Header row
  let headerCells = gridRows[0];
  let bodyRows = gridRows.slice(1);

  if (headerCells.filter(Boolean).length === 1 && bodyRows.length > 0 && bodyRows[0].filter(Boolean).length > 1) {
    headerCells = bodyRows[0];
    bodyRows = [gridRows[0], ...bodyRows.slice(1)];
  }

  const cleanCell = c => (c || '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

  let md = `\n### ${cleanText(tableTitle)}\n\n`;
  md += `| ${headerCells.map(c => cleanCell(c) || '-').join(' | ')} |\n`;
  md += `| ${headerCells.map(() => '---').join(' | ')} |\n`;

  for (const r of bodyRows) {
    if (r.every(c => !c || !c.trim())) continue;
    md += `| ${r.map(cleanCell).join(' | ')} |\n`;
  }

  if (footnote && footnote.trim()) {
    md += `\n*${cleanText(footnote.trim())}*\n`;
  }

  return md + '\n';
}

// Extract a single chapter given its pages
export function processChapterFromPages(chapterInfo, chapterPages) {
  let markdown = `# Capítulo ${chapterInfo.chapterNumber}: ${cleanText(chapterInfo.title)}\n\n`;

  let inTable = false;
  let curTableHeader = '';
  let curTableRows = [];
  let curTableFootnote = '';

  let inPoints = false;
  let authors = [];
  let isHeaderParsed = false;
  let currentParagraph = '';

  function flushParagraph() {
    if (currentParagraph && currentParagraph.trim()) {
      markdown += currentParagraph.trim() + '\n\n';
      currentParagraph = '';
    }
  }

  function flushTable() {
    if (inTable) {
      markdown += renderMarkdownTable(curTableHeader, curTableRows, curTableFootnote);
      inTable = false;
      curTableHeader = '';
      curTableRows = [];
      curTableFootnote = '';
    }
  }

  for (let pIdx = 0; pIdx < chapterPages.length; pIdx++) {
    const page = chapterPages[pIdx];
    const rawItems = page.items.filter(it => it.str && it.str.trim());

    // Sort into line buckets by Y desc, X asc
    rawItems.sort((a, b) => {
      if (Math.abs(b.y - a.y) > 2.5) return b.y - a.y;
      return a.x - b.x;
    });

    const lines = [];
    let curLine = [];
    let curY = null;
    for (const it of rawItems) {
      if (curY === null || Math.abs(curY - it.y) <= 2.5) {
        curLine.push(it);
        if (curY === null) curY = it.y;
      } else {
        lines.push({ y: curY, rawItems: curLine });
        curLine = [it];
        curY = it.y;
      }
    }
    if (curLine.length > 0) lines.push({ y: curY, rawItems: curLine });

    // Process lines
    for (let lIdx = 0; lIdx < lines.length; lIdx++) {
      const lineObj = lines[lIdx];
      const tokens = assembleLineItems(lineObj.rawItems);
      const lineStr = lineToString(tokens);
      if (!lineStr) continue;

      const firstToken = tokens[0];
      const lineData = { y: lineObj.y, tokens, lineStr };

      // Header parsing at first page
      if (pIdx === 0 && !isHeaderParsed) {
        if (firstToken.fontSize > 12.0 && lineStr.match(/^\d+\s+/)) {
          continue; // Chapter title line
        }
        if (lineStr === 'PONTOS IMPORTANTES') {
          isHeaderParsed = true;
          if (authors.length > 0) {
            markdown += authors.map(a => `**${a}**`).join('  \n') + '\n\n';
          }
          markdown += `## PONTOS IMPORTANTES\n\n`;
          inPoints = true;
          continue;
        }
        if (firstToken.fontSize < 10.0 && !lineStr.startsWith('PONTOS')) {
          authors.push(lineStr);
          continue;
        }
      }

      // Check Table start
      const tabMatch = lineStr.match(/^TABELA\s+(\d+)[\s–—-]*(.*)/i);
      if (tabMatch && firstToken.x < 100) {
        flushParagraph();
        flushTable();
        inTable = true;
        curTableHeader = `TABELA ${tabMatch[1]} ${tabMatch[2]}`.trim();
        continue;
      }

      if (inTable) {
        const isFootnote = lineStr.match(/^(Fonte:|DPOC:|CTAS:|ESI:|MTS:|INR:|SDRA:|IRpA:|\*|Classificação)/i);
        const isMajorSec = (firstToken.fontSize > 11.5 && firstToken.x < 70) || /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ\s]{4,}$/.test(lineStr);
        const isBodyParagraph = (firstToken.fontSize >= 9.5 && firstToken.fontSize <= 10.5 && (Math.abs(firstToken.x - 44.8) < 3 || Math.abs(firstToken.x - 68.5) < 3) && lineStr.length > 60 && !lineStr.includes('|'));

        if (isMajorSec || isBodyParagraph) {
          flushTable();
          // proceed to handle this line below
        } else if (isFootnote) {
          curTableFootnote += (curTableFootnote ? ' ' : '') + lineStr;
          flushTable();
          continue;
        } else {
          curTableRows.push(lineData);
          continue;
        }
      }

      // Check Figure / Flowchart
      const figMatch = lineStr.match(/^FIGURA\s+(\d+)[\s–—-]*(.*)/i);
      if (figMatch) {
        flushParagraph();
        flushTable();
        markdown += `\n**FIGURA ${figMatch[1]}**: ${cleanText(figMatch[2]).trim()}\n\n`;
        continue;
      }

      // Check Major Section Headings
      const isMajorHeading = (firstToken.fontSize > 11.5 && firstToken.x < 70);
      if (isMajorHeading) {
        flushParagraph();
        flushTable();
        inPoints = false;
        markdown += `\n## ${lineStr}\n\n`;
        continue;
      }

      // Check Subheadings (H3 / H4)
      const isSubHeading = (firstToken.fontSize < 9.0 && Math.abs(firstToken.x - 44.8) < 3.0 && lineStr.length < 75 && !lineStr.endsWith('.'))
        || (firstToken.fontSize >= 10.0 && firstToken.fontSize <= 11.5 && Math.abs(firstToken.x - 44.8) < 3.0 && lineStr.length < 50 && !lineStr.endsWith('.'));

      if (isSubHeading) {
        flushParagraph();
        flushTable();
        inPoints = false;
        markdown += `\n### ${lineStr}\n\n`;
        continue;
      }

      // Check Bullet Points
      if (inPoints) {
        const isNewBullet = Math.abs(firstToken.x - 81.5) < 4.0 || Math.abs(firstToken.x - 76.4) < 4.0 || lineStr.startsWith('–') || lineStr.startsWith('-');
        if (isNewBullet) {
          flushParagraph();
          const bulletContent = lineStr.replace(/^[–\-•]\s*/, '').trim();
          markdown += `- ${bulletContent}\n`;
        } else if (Math.abs(firstToken.x - 100.7) < 5.0 || firstToken.x > 85.0) {
          // Continuation of previous bullet
          // Strip last \n, append space and lineStr
          markdown = markdown.trimEnd() + ' ' + lineStr + '\n';
        } else {
          // If points section ends
          inPoints = false;
          flushParagraph();
          currentParagraph = lineStr;
        }
        continue;
      }

      // Regular body bullet
      if (lineStr.startsWith('–') || lineStr.startsWith('•') || (lineStr.startsWith('-') && lineStr.length > 2)) {
        flushParagraph();
        const bulletText = lineStr.replace(/^[–\-•]\s*/, '').trim();
        markdown += `- ${bulletText}\n`;
        continue;
      }

      // Numbered items: "1. LEMON", "2. ROMAN"
      if (/^\d+\.\s+[A-Z]/.test(lineStr) && firstToken.x < 70) {
        flushParagraph();
        markdown += `${lineStr}\n`;
        continue;
      }

      // Check Paragraph boundaries
      const isNewParagraph = (Math.abs(firstToken.x - 68.5) < 4.0 && firstToken.fontSize >= 9.5);
      if (isNewParagraph) {
        flushParagraph();
        currentParagraph = lineStr;
        continue;
      }

      // Continuation of current paragraph
      if (currentParagraph) {
        // Check hyphenation at end of currentParagraph
        if (currentParagraph.endsWith('-')) {
          currentParagraph = currentParagraph.slice(0, -1) + lineStr;
        } else {
          currentParagraph += ' ' + lineStr;
        }
      } else {
        currentParagraph = lineStr;
      }
    }
  }

  flushParagraph();
  flushTable();

  return markdown.trim() + '\n';
}

// Test extracting first 3 chapters
async function test() {
  const testCaps = chaptersMeta.slice(0, 3);
  const maxPage = testCaps[testCaps.length - 1].endPage;

  console.log(`Loading pages up to ${maxPage}...`);
  const pagesMap = new Map();

  await pdf(dataBuffer, {
    max: maxPage,
    pagerender: async function(pageData) {
      const tc = await pageData.getTextContent();
      pagesMap.set(pageData.pageNumber, {
        pageNumber: pageData.pageNumber,
        items: tc.items.map(it => ({
          str: it.str,
          x: it.transform[4],
          y: it.transform[5],
          w: it.width || 0,
          h: it.height || 0,
          font: it.fontName,
          fontSize: it.transform[0] || it.height || 10
        }))
      });
      return '';
    }
  });

  for (const cap of testCaps) {
    const cPages = [];
    for (let p = cap.startPage; p <= cap.endPage; p++) {
      if (pagesMap.has(p)) cPages.push(pagesMap.get(p));
    }
    const md = processChapterFromPages(cap, cPages);
    const wc = md.split(/\s+/).filter(Boolean).length;
    console.log(`✅ Cap ${cap.chapterNumber}: ${cap.title} -> ${md.length} chars, ${wc} words (pp. ${cap.startPage}-${cap.endPage})`);
    fs.writeFileSync(`scripts/debug_cap${cap.chapterNumber}.md`, md, 'utf8');
  }
}

test().catch(console.error);
