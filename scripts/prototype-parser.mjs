import fs from 'fs';
import pdf from 'pdf-parse';

const pdfPath = 'C:\\Users\\souza\\Downloads\\Medicina de emergência abordagem prática 19ed 2025.pdf';
const dataBuffer = fs.readFileSync(pdfPath);

// Helper to clean and normalize tokens
function normalizeLine(items) {
  // Sort by x
  items.sort((a, b) => a.x - b.x);

  let text = '';
  for (let i = 0; i < items.length; i++) {
    const cur = items[i];
    const prev = items[i - 1];

    if (!prev) {
      text += cur.str;
      continue;
    }

    const gap = cur.x - (prev.x + prev.w);

    // Subscript / superscript detection:
    // If small font, and follows closely, no space
    const isSubSup = (cur.fontSize < 8.0 && (prev.str.endsWith('O') || prev.str.endsWith('CO') || prev.str.endsWith('SatO') || prev.str.endsWith('PaO') || prev.str.endsWith('FiO') || prev.str.endsWith('PaCO') || prev.str.endsWith('a') || prev.str.endsWith('–') || prev.str.endsWith('(')));

    if (gap > 2.0 && !isSubSup) {
      // Check if prev already ends with space or cur starts with space
      if (!text.endsWith(' ') && !cur.str.startsWith(' ')) {
        text += ' ';
      }
    }
    text += cur.str;
  }

  return text.trim();
}

// Convert table lines into a markdown table
function formatTable(tableHeader, tableRows, footnote) {
  if (tableRows.length === 0) return `### ${tableHeader}\n\n`;

  // Find column centers across all rows
  const allX = [];
  tableRows.forEach(row => {
    row.items.forEach(it => {
      allX.push(it.x);
    });
  });

  allX.sort((a, b) => a - b);

  // Cluster X into column buckets (threshold ~30pt)
  const colCenters = [];
  for (const x of allX) {
    const matchCol = colCenters.find(c => Math.abs(c - x) < 35);
    if (!matchCol) {
      colCenters.push(x);
    }
  }
  colCenters.sort((a, b) => a - b);

  const numCols = Math.max(colCenters.length, 1);

  // Assign items in each row to columns
  const gridRows = [];
  for (const row of tableRows) {
    const rowCells = Array(numCols).fill('');
    for (const it of row.items) {
      // Find closest colCenter
      let bestCol = 0;
      let minDiff = 9999;
      colCenters.forEach((c, idx) => {
        const diff = Math.abs(c - it.x);
        if (diff < minDiff) {
          minDiff = diff;
          bestCol = idx;
        }
      });

      if (rowCells[bestCol]) {
        rowCells[bestCol] += ' ' + it.str.trim();
      } else {
        rowCells[bestCol] = it.str.trim();
      }
    }
    gridRows.push(rowCells);
  }

  // Header row is first row
  let headerCells = gridRows[0];
  let bodyRows = gridRows.slice(1);

  // If first row doesn't have all columns, synthesize or adjust
  if (headerCells.filter(Boolean).length === 1 && bodyRows.length > 0 && bodyRows[0].filter(Boolean).length > 1) {
    // First row was perhaps a category banner, next row is the header
    headerCells = bodyRows[0];
    bodyRows = [gridRows[0], ...bodyRows.slice(1)];
  }

  // Sanitize cells (replace pipes with \| and normalize spaces)
  const cleanCell = c => (c || '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

  let md = `\n### ${tableHeader}\n\n`;
  md += `| ${headerCells.map(cleanCell).join(' | ')} |\n`;
  md += `| ${headerCells.map(() => '---').join(' | ')} |\n`;

  for (const r of bodyRows) {
    // If entire row is empty, skip
    if (r.every(c => !c || !c.trim())) continue;
    md += `| ${r.map(cleanCell).join(' | ')} |\n`;
  }

  if (footnote && footnote.trim()) {
    md += `\n*${footnote.trim()}*\n`;
  }

  md += '\n';
  return md;
}

async function extractChapter(startPage, endPage, chapterNum, chapterTitle) {
  const pages = [];

  await pdf(dataBuffer, {
    max: endPage,
    pagerender: async function(pageData) {
      if (pageData.pageNumber >= startPage && pageData.pageNumber <= endPage) {
        const tc = await pageData.getTextContent();
        pages.push({
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
      }
      return '';
    }
  });

  // Process all pages sequentially
  let markdown = `# Capítulo ${chapterNum}: ${chapterTitle}\n\n`;

  let inTable = false;
  let curTableHeader = '';
  let curTableRows = [];
  let curTableFootnote = '';

  let inPoints = false;
  let authors = [];
  let isHeaderParsed = false;

  for (let pIdx = 0; pIdx < pages.length; pIdx++) {
    const page = pages[pIdx];
    const rawItems = page.items.filter(it => it.str.trim());

    // Group items into lines
    const lineBuckets = [];
    rawItems.sort((a, b) => {
      if (Math.abs(b.y - a.y) > 2.5) return b.y - a.y;
      return a.x - b.x;
    });

    let curLine = [];
    let curY = null;
    for (const it of rawItems) {
      if (curY === null || Math.abs(curY - it.y) <= 2.5) {
        curLine.push(it);
        if (curY === null) curY = it.y;
      } else {
        if (curLine.length > 0) lineBuckets.push({ y: curY, items: curLine });
        curLine = [it];
        curY = it.y;
      }
    }
    if (curLine.length > 0) lineBuckets.push({ y: curY, items: curLine });

    // Iterate lines
    for (let lIdx = 0; lIdx < lineBuckets.length; lIdx++) {
      const lineObj = lineBuckets[lIdx];
      const lineStr = normalizeLine(lineObj.items);

      // Check if starting chapter header
      if (pIdx === 0 && !isHeaderParsed) {
        // First few lines contain authors and chapter title
        if (lineObj.items[0].fontSize > 12.0 && lineStr.match(/^\d+\s+/)) {
          // Chapter title line, skip (we already put # Capítulo X)
          continue;
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
        // Authors before PONTOS IMPORTANTES
        if (lineObj.items[0].fontSize < 10.0 && !lineStr.startsWith('PONTOS')) {
          authors.push(lineStr);
          continue;
        }
      }

      // Check Table start
      const tabMatch = lineStr.match(/^TABELA\s+(\d+)[\s–—-]*(.*)/i);
      if (tabMatch && lineObj.items[0].x < 100) {
        // If we were already in a table, flush it
        if (inTable) {
          markdown += formatTable(curTableHeader, curTableRows, curTableFootnote);
          inTable = false;
          curTableRows = [];
          curTableFootnote = '';
        }
        inTable = true;
        curTableHeader = `TABELA ${tabMatch[1]} ${tabMatch[2]}`.trim();
        continue;
      }

      if (inTable) {
        // Check if table ends
        // Table ends if we see a footnote line, or section header, or regular full-width body line
        const isFootnote = lineStr.match(/^(Fonte:|DPOC:|CTAS:|ESI:|MTS:|INR:|SDRA:|IRpA:|\*|Classificação)/i);
        const isSectionHeader = (lineObj.items[0].fontSize > 11.0 && lineObj.items[0].x < 70) || lineStr.match(/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ\s]{4,}$/);

        if (isSectionHeader) {
          markdown += formatTable(curTableHeader, curTableRows, curTableFootnote);
          inTable = false;
          curTableRows = [];
          curTableFootnote = '';
          // proceed to process section header
        } else if (isFootnote) {
          curTableFootnote += (curTableFootnote ? ' ' : '') + lineStr;
          // Footnote is usually last line of table
          markdown += formatTable(curTableHeader, curTableRows, curTableFootnote);
          inTable = false;
          curTableRows = [];
          curTableFootnote = '';
          continue;
        } else {
          // Check if this line is regular body text (wide text, starts at x=44.8 or 68.5 with normal font)
          const firstIt = lineObj.items[0];
          const isBodyParagraph = (firstIt.fontSize >= 9.5 && firstIt.fontSize <= 10.5 && (Math.abs(firstIt.x - 44.8) < 2 || Math.abs(firstIt.x - 68.5) < 2) && lineStr.length > 70 && !lineStr.includes('|'));
          if (isBodyParagraph) {
            markdown += formatTable(curTableHeader, curTableRows, curTableFootnote);
            inTable = false;
            curTableRows = [];
            curTableFootnote = '';
          } else {
            // It's a table row!
            curTableRows.push(lineObj);
            continue;
          }
        }
      }

      // Check Figure
      const figMatch = lineStr.match(/^FIGURA\s+(\d+)[\s–—-]*(.*)/i);
      if (figMatch) {
        markdown += `\n**FIGURA ${figMatch[1]}** ${figMatch[2].trim()}\n\n`;
        continue;
      }

      // Check Section Headings
      const firstItem = lineObj.items[0];
      const isMajorHeading = (firstItem.fontSize > 11.5 && firstItem.x < 70);
      const isSubHeading = (firstItem.fontSize >= 10.0 && firstItem.fontSize <= 11.5 && lineObj.items.every(it => it.fontSize >= 10.0) && lineStr.length < 50 && !lineStr.endsWith('.'));

      if (isMajorHeading) {
        inPoints = false;
        markdown += `\n## ${lineStr.trim()}\n\n`;
        continue;
      }

      if (isSubHeading) {
        markdown += `\n### ${lineStr.trim()}\n\n`;
        continue;
      }

      // Check if Bullet list item
      if (inPoints || lineStr.startsWith('–') || lineStr.startsWith('-') || lineStr.startsWith('•')) {
        const cleanBullet = lineStr.replace(/^[–\-•]\s*/, '').trim();
        markdown += `- ${cleanBullet}\n`;
        continue;
      }

      // Regular text paragraph
      // Check if previous line ended with hyphen for rejoining
      if (markdown.endsWith('-\n')) {
        markdown = markdown.slice(0, -2) + lineStr + '\n';
      } else if (markdown.endsWith('\n') && !markdown.endsWith('\n\n')) {
        markdown += ' ' + lineStr;
      } else {
        markdown += lineStr + '\n';
      }
    }
  }

  if (inTable) {
    markdown += formatTable(curTableHeader, curTableRows, curTableFootnote);
  }

  return markdown;
}

extractChapter(78, 88, 1, 'Abordagem inicial do paciente grave na sala de emergência')
  .then(md => {
    fs.writeFileSync('scripts/cap1_test_output.md', md, 'utf8');
    console.log('Chapter 1 extracted! Length:', md.length, 'chars');
  })
  .catch(console.error);
