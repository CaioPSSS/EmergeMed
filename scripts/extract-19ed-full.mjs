import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pdf from 'pdf-parse';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const pdfPath = 'C:\\Users\\souza\\Downloads\\Medicina de emergência abordagem prática 19ed 2025.pdf';
const chaptersMetaPath = path.join(projectRoot, 'scripts', 'chapters_19ed_pages.json');
const targetCachePath = path.join(projectRoot, 'scripts', 'index_cache.json');
const backupCachePath = path.join(projectRoot, 'scripts', 'index_cache_18ed.json.bak');

if (!fs.existsSync(pdfPath)) {
  console.error(`❌ PDF not found at: ${pdfPath}`);
  process.exit(1);
}

// Backup old 18th edition cache if not already backed up
if (fs.existsSync(targetCachePath) && !fs.existsSync(backupCachePath)) {
  console.log(`📦 Creating backup of 18th edition cache to: ${backupCachePath}`);
  fs.copyFileSync(targetCachePath, backupCachePath);
}

const chaptersMeta = JSON.parse(fs.readFileSync(chaptersMetaPath, 'utf8'));
console.log(`Loaded metadata for ${chaptersMeta.length} chapters.`);

// Text cleanup helper with full symbol and font sanitization
function cleanText(str) {
  if (!str) return '';
  return str
    // Byte offset digits 0x13..0x1c -> '0'..'9'
    .replace(/\u0013/g, '0')
    .replace(/\u0014/g, '1')
    .replace(/\u0015/g, '2')
    .replace(/\u0016/g, '3')
    .replace(/\u0017/g, '4')
    .replace(/\u0018/g, '5')
    .replace(/\u0019/g, '6')
    .replace(/\u001a/g, '7')
    .replace(/\u001b/g, '8')
    .replace(/\u001c|\u001d/g, '–')
    // Control characters to proper typographical symbols
    .replace(/\u0008/g, '%')
    .replace(/\u000b/g, '(')
    .replace(/\u000c/g, ')')
    .replace(/\u000e/g, '=')
    .replace(/\u000f/g, ', ')
    .replace(/\u0010/g, '-')
    .replace(/\u0011/g, '.')
    .replace(/\u0012/g, '/')
    .replace(/\u001e/g, '; ')
    .replace(/\u001f/g, '≤')
    .replace(/\u0000/g, '')
    .replace(/\r/g, '')
    // Mathematical symbols and formula fixes
    .replace(/î/g, '×')
    .replace(/4,0\s*±\s*albumina/g, '4,0 – albumina')
    .replace(/\+\s+pylori/g, 'H. pylori')
    // Specific font encoding corruptions
    .replace(/MANE-O/g, 'MANEJO')
    .replace(/TERAPÇUTICA/g, 'TERAPÊUTICA')
    .replace(/EVIDÇNCIAS/g, 'EVIDÊNCIAS')
    .replace(/HEMODINÆMICO/g, 'HEMODINÂMICO')
    .replace(/EMERGÇNCIA/g, 'EMERGÊNCIA')
    .replace(/ARSÇNICO/g, 'ARSÊNICO')
    .replace(/CUTÆNEOS/g, 'CUTÂNEOS')
    .replace(/sa~de/g, 'saúde')
    .replace(/inflXen]a/g, 'influenza')
    .replace(/influen]ae|inIluen]De/g, 'influenzae')
    .replace(/e\[ames/g, 'exames')
    .replace(/E\[ames/g, 'Exames')
    .replace(/fa\]er/g, 'fazer')
    .replace(/to\[inas/g, 'toxinas')
    .replace(/e\[cessiYa/g, 'excessiva')
    .replace(/comSXtadori\]ada/g, 'computadorizada')
    .replace(/HiSocoagXliYel/g, 'Hipocoagulável')
    .replace(/HiSercoagXlaEilidade/g, 'Hipercoagulabilidade')
    .replace(/FiErinólise/g, 'Fibrinólise')
    .replace(/HiSofiErinólise/g, 'Hipofibrinólise')
    .replace(/tendrncia/g, 'tendência')
    .replace(/tromEos/g, 'trombos')
    .replace(/tromEoelastografia/g, 'tromboelastografia')
    .replace(/tromEina/g, 'trombina')
    .replace(/TXeEra/g, 'quebra')
    .replace(/coigXlos/g, 'coágulos')
    .replace(/interrXSção/g, 'interrupção')
    .replace(/FXnção SlaTXetiria/g, 'Função plaquetária')
    .replace(/FiErinogrnio Slasmitico/g, 'Fibrinogênio plasmático')
    .replace(/CirXrgia cardioYascXlar/g, 'Cirurgia cardiovascular')
    .replace(/Cardiologia interYencionista/g, 'Cardiologia intervencionista')
    .replace(/TraXma/g, 'Trauma')
    .replace(/Sangramento Sós-Sarto|Sangramento Sós-parto/g, 'Sangramento pós-parto')
    .replace(/SÍNDROME DE STEVENS -OHNSON\s*SS-/g, 'SÍNDROME DE STEVENS-JOHNSON (SSJ)')
    .replace(/crknio/g, 'crânio')
    .replace(/ressonkncia magnptica/g, 'ressonância magnética')
    .replace(/encpfalo/g, 'encéfalo')
    .replace(/adXlto/g, 'adulto')
    .replace(/DilXição sXgerida/g, 'Diluição sugerida')
    .replace(/ASresentação dilXiçã/g, 'Apresentação/diluição')
    .replace(/cXidados/g, 'cuidados')
    .replace(/controYprsias/g, 'controvérsias')
    .replace(/MONITORI=AÇÃO/g, 'MONITORIZAÇÃO')
    .replace(/&anadian\s+&\s+SSine\s+5uOe/g, 'Canadian C-Spine Rule')
    .replace(/ECSTAS<\s*[\/\x12]\s*MDMA/g, 'ECSTASY / MDMA')
    .replace(/\u0003/g, '')
    .replace(/\u0004/g, '• ')
    .replace(/DFDQtose[\s\S]*?QiJUiFDQs/g, 'Acantose nigricans')
    .replace(/FruVh[\s\S]*?drRme/g, 'Crush Syndrome')
    .replace(/'eOirium[\s\S]*?WremenV/g, 'Delirium Tremens')
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
    .replace(/[ \t]+/g, ' ');
}

// Subscript / superscript detection
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

// Assemble line items into tokens
function assembleLineItems(rawItems) {
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

// Format a Table / Quadro into markdown
function renderMarkdownTable(tableTitle, tableRows, footnote) {
  if (tableRows.length === 0) return `\n### ${cleanText(tableTitle)}\n\n`;

  // Determine column boundaries
  let bestColStarts = [];
  for (const r of tableRows) {
    if (r.tokens.length >= 2) {
      const starts = [];
      for (const t of r.tokens) {
        if (!starts.some(s => Math.abs(s - t.x) < 25)) {
          starts.push(t.x);
        }
      }
      starts.sort((a, b) => a - b);
      if (starts.length > bestColStarts.length) {
        bestColStarts = starts;
      }
    }
  }

  if (bestColStarts.length < 2) {
    const cleanRows = tableRows.map(r => cleanText(r.lineStr)).filter(Boolean);
    let md = `\n### ${cleanText(tableTitle)}\n\n`;
    cleanRows.forEach(row => {
      md += `${row}  \n`;
    });
    if (footnote && footnote.trim()) {
      md += `\n*${cleanText(footnote.trim())}*\n`;
    }
    return md + '\n';
  }

  const colBoundaries = [];
  for (let i = 0; i < bestColStarts.length - 1; i++) {
    colBoundaries.push((bestColStarts[i] + bestColStarts[i + 1]) / 2);
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

  for (let i = 0; i < tableRows.length; i++) {
    const line = tableRows[i];
    const dy = lastRowY !== null ? Math.abs(lastRowY - line.y) : 999;

    // Filter out page-continuation repeated headers
    const isRepeatedHeader = i > 0 && line.tokens.length >= 2 &&
      gridRows.length > 0 &&
      line.tokens.every(t => {
        const c = getColIdx(t.x);
        return gridRows[0][c] && gridRows[0][c].toLowerCase().includes(cleanText(t.str).toLowerCase());
      });

    if (isRepeatedHeader) {
      continue;
    }

    // Row separation:
    // Spacing between different rows in the PDF is >= 13.5 pt.
    // Within the same row (multi-line wrapped cells), dy is <= 12.0 pt.
    const isNewRow = (curGridRow === null) || (dy >= 13.5);

    if (isNewRow) {
      if (curGridRow) gridRows.push(curGridRow);
      curGridRow = Array(numCols).fill('');
      lastRowY = line.y;
    }

    for (const t of line.tokens) {
      if (t.str.includes('    ')) {
        const parts = t.str.split(/\s{3,}/);
        let partX = t.x;
        const partW = t.w / parts.length;
        for (const part of parts) {
          const c = getColIdx(partX);
          const str = cleanText(part);
          if (curGridRow[c]) curGridRow[c] += ' ' + str;
          else curGridRow[c] = str;
          partX += partW;
        }
      } else {
        const c = getColIdx(t.x);
        const str = cleanText(t.str);
        if (curGridRow[c]) curGridRow[c] += ' ' + str;
        else curGridRow[c] = str;
      }
    }
  }
  if (curGridRow) gridRows.push(curGridRow);

  if (gridRows.length === 0) return `\n### ${cleanText(tableTitle)}\n\n`;

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

// Process single chapter from its raw page items
function processChapterFromPages(chapterInfo, chapterPages) {
  let markdown = `# Capítulo ${chapterInfo.chapterNumber}: ${cleanText(chapterInfo.title)}\n\n`;

  let inTable = false;
  let curTableHeader = '';
  let curTableRows = [];
  let curTableFootnote = '';

  let inFigure = false;
  let curFigureText = '';

  let inPoints = false;
  let lastBulletEnded = true;
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

  function flushFigure() {
    if (inFigure) {
      if (curFigureText.trim()) {
        markdown += curFigureText.trim() + '\n\n';
      }
      inFigure = false;
      curFigureText = '';
    }
  }

  for (let pIdx = 0; pIdx < chapterPages.length; pIdx++) {
    const page = chapterPages[pIdx];
    const rawItems = page.items.filter(it => it.str && it.str.trim());

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
          lastBulletEnded = true;
          continue;
        }
        if (firstToken.fontSize < 10.0 && !lineStr.startsWith('PONTOS')) {
          authors.push(lineStr);
          continue;
        }
      }

      // 1. Check Table or Quadro start
      const tabMatch = lineStr.match(/^(?:TABELA|Tabela)\s*([\d\w–—-]+|\bdo estudo\b.*)?[\s–—-]*(.*)/i);
      const isTableTitle = tabMatch && firstToken.x < 100 && (firstToken.fontSize < 9.5 || /^[A-Z\s\d]+$/.test(tabMatch[1] || ''));
      const quadMatch = lineStr.match(/^(?:QUADRO|Quadro)\s*([\d\w–—-]+)?[\s–—-]*(.*)/i);
      const isQuadroTitle = quadMatch && firstToken.x < 100 && (firstToken.fontSize < 9.5);

      if (isTableTitle || isQuadroTitle) {
        flushParagraph();
        flushTable();
        flushFigure();
        inTable = true;
        if (isTableTitle) {
          curTableHeader = `TABELA ${tabMatch[1] || ''} ${tabMatch[2] || ''}`.trim();
        } else {
          curTableHeader = `QUADRO ${quadMatch[1] || ''} ${quadMatch[2] || ''}`.trim();
        }
        continue;
      }

      // 2. Check Figure start
      const figMatch = lineStr.match(/^(?:FIGURA|Figura)\s*([\d\w–—-]+)[\s–—:]*(.*)/i);
      const isFigStart = figMatch && (firstToken.fontSize < 9.5) && (firstToken.x < 120);

      if (isFigStart) {
        flushParagraph();
        flushTable();
        flushFigure();
        inFigure = true;
        const figNum = figMatch[1].trim();
        const figDesc = cleanText(figMatch[2]).trim();
        curFigureText = `**FIGURA ${figNum}**: ${figDesc}`;
        continue;
      }

      // 3. Check Major Section Headings (fontSize > 11.5)
      const isMajorHeading = (firstToken.fontSize > 11.5 && firstToken.x < 70);
      if (isMajorHeading) {
        flushParagraph();
        flushTable();
        flushFigure();
        inPoints = false;
        markdown += `\n## ${lineStr}\n\n`;
        continue;
      }

      // 4. Check Subheadings (MUST start with capital letter, length < 80, no ending punctuation)
      const startsWithCap = /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(lineStr);
      const endsWithPeriod = /[.!?]$/.test(lineStr);
      const isSubHeading = startsWithCap && !endsWithPeriod && lineStr.length < 80 && (
        (firstToken.fontSize < 9.0 && Math.abs(firstToken.x - 44.8) < 3.0) ||
        (firstToken.fontSize >= 10.0 && firstToken.fontSize <= 11.5 && Math.abs(firstToken.x - 44.8) < 3.0 && lineStr.length < 55)
      );

      if (isSubHeading) {
        flushParagraph();
        flushTable();
        flushFigure();
        inPoints = false;
        markdown += `\n### ${lineStr}\n\n`;
        continue;
      }

      // 5. If inside Table: check footnote or body text exit
      if (inTable) {
        if (firstToken.fontSize >= 9.0) {
          flushTable();
          // Fall through to process as regular body text
        } else {
          const isFootnote = (firstToken.fontSize < 8.0) && (
            /^(Fonte:|DPOC:|CTAS:|ESI:|MTS:|INR:|SDRA:|IRpA:|BNM:|SRI:|ECMO:|IAM:|RCE:|AESP:|FV|TV|AVC:|FR:|FC:|PEEP:|VCV:|PCV:|Dados\s+adaptados|Adaptad[ao]|Modificad[ao]|\*|Classificação|\bObs:|\bNota:)/i.test(lineStr) ||
            /^[A-Z0-9/]{2,10}:\s+/.test(lineStr)
          );

          if (curTableFootnote) {
            if (firstToken.fontSize < 8.0) {
              curTableFootnote += ' ' + lineStr;
              continue;
            } else {
              flushTable();
              // Fall through to process line
            }
          } else if (isFootnote) {
            curTableFootnote += (curTableFootnote ? ' ' : '') + lineStr;
            continue;
          } else {
            curTableRows.push(lineData);
            continue;
          }
        }
      }

      // 6. If inside Figure: check continuation
      if (inFigure) {
        const isFigContinuation = (firstToken.fontSize < 9.5);
        if (isFigContinuation) {
          curFigureText += ' ' + lineStr;
          continue;
        } else {
          flushFigure();
        }
      }

      // 7. PONTOS IMPORTANTES bullets
      if (inPoints) {
        const startsWithBulletChar = lineStr.startsWith('–') || lineStr.startsWith('-') || lineStr.startsWith('•');
        const isNewBullet = startsWithBulletChar || (lastBulletEnded && (Math.abs(firstToken.x - 81.5) < 5.0 || Math.abs(firstToken.x - 76.4) < 5.0));

        if (isNewBullet) {
          flushParagraph();
          const cleanB = lineStr.replace(/^[–\-•]\s*/, '').trim();
          markdown += `- ${cleanB}\n`;
          lastBulletEnded = /[.!?]$/.test(cleanB);
        } else if (firstToken.x > 70.0) {
          markdown = markdown.trimEnd() + ' ' + lineStr + '\n';
          lastBulletEnded = /[.!?]$/.test(lineStr);
        } else {
          inPoints = false;
          flushParagraph();
          currentParagraph = lineStr;
        }
        continue;
      }

      // 8. Regular body bullet lists
      if (lineStr.startsWith('–') || lineStr.startsWith('•') || (lineStr.startsWith('-') && lineStr.length > 2)) {
        flushParagraph();
        const bulletText = lineStr.replace(/^[–\-•]\s*/, '').trim();
        markdown += `- ${bulletText}\n`;
        continue;
      }

      // 9. Numbered items: "1. LEMON", "2. ROMAN"
      if (/^\d+\.\s+[A-Z]/.test(lineStr) && firstToken.x < 70) {
        flushParagraph();
        markdown += `${lineStr}\n`;
        continue;
      }

      // 10. Paragraph boundary: indented first line
      const isNewParagraph = (Math.abs(firstToken.x - 68.5) < 4.0 && firstToken.fontSize >= 9.5);
      if (isNewParagraph) {
        flushParagraph();
        currentParagraph = lineStr;
        continue;
      }

      // Continuation of current paragraph
      if (currentParagraph) {
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
  flushFigure();

  return markdown.trim() + '\n';
}

async function extractAllChapters() {
  console.log('==================================================');
  console.log('🚀 EmergeMed 19ª Edição — Extrator Integral de Alta Fidelidade');
  console.log('==================================================');
  console.log(`Lendo arquivo PDF: ${pdfPath}`);

  const dataBuffer = fs.readFileSync(pdfPath);
  console.log(`Carregando PDF completo em memória (${(dataBuffer.length / (1024 * 1024)).toFixed(2)} MB)...`);

  const tStart = Date.now();
  const pagesMap = new Map();

  await pdf(dataBuffer, {
    max: 1973,
    pagerender: async function(pageData) {
      if (pageData.pageNumber >= 78 && pageData.pageNumber <= 1973) {
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
      }
      return '';
    }
  });

  const tLoad = Date.now();
  console.log(`✅ ${pagesMap.size} páginas carregadas em ${((tLoad - tStart) / 1000).toFixed(2)}s.`);

  console.log(`Iniciando extração e formatação dos ${chaptersMeta.length} capítulos...`);

  const outputCache = {};
  let totalChars = 0;
  let totalWords = 0;

  for (let i = 0; i < chaptersMeta.length; i++) {
    const cap = chaptersMeta[i];
    const cPages = [];
    for (let p = cap.startPage; p <= cap.endPage; p++) {
      if (pagesMap.has(p)) {
        cPages.push(pagesMap.get(p));
      }
    }

    const mdContent = processChapterFromPages(cap, cPages);
    const wordCount = mdContent.split(/\s+/).filter(Boolean).length;
    const charCount = mdContent.length;

    totalChars += charCount;
    totalWords += wordCount;

    const chapterId = cap.index;

    outputCache[String(chapterId)] = {
      chapter_id: chapterId,
      number: cap.chapterNumber,
      title: cap.title,
      section: cap.section,
      is_complementary: cap.isComplementary,
      startPage: cap.startPage,
      endPage: cap.endPage,
      pageCount: cap.pageCount,
      content: mdContent,
      word_count: wordCount,
      char_count: charCount,
      updated_at: new Date().toISOString(),
      cache_version: 3
    };

    if (chapterId % 10 === 0 || chapterId === 122 || chapterId === chaptersMeta.length) {
      console.log(`[${chapterId}/${chaptersMeta.length}] Cap ${cap.chapterNumber}: "${cap.title.slice(0, 35)}..." (${wordCount.toLocaleString()} palavras, ${charCount.toLocaleString()} chars)`);
    }
  }

  const tFinish = Date.now();
  console.log('\n==================================================');
  console.log(`🎉 EXTRAÇÃO COMPLETA FINALIZADA COM SUCESSO!`);
  console.log(`  - Total de Capítulos: ${Object.keys(outputCache).length}`);
  console.log(`  - Total de Palavras: ${totalWords.toLocaleString()}`);
  console.log(`  - Total de Caracteres: ${totalChars.toLocaleString()}`);
  console.log(`  - Tempo Total: ${((tFinish - tStart) / 1000).toFixed(2)}s`);
  console.log(`==================================================\n`);

  console.log(`Salvando em: ${targetCachePath}...`);
  fs.writeFileSync(targetCachePath, JSON.stringify(outputCache, null, 2), 'utf8');
  const stat = fs.statSync(targetCachePath);
  console.log(`✅ Salvo com sucesso! Tamanho do arquivo: ${(stat.size / (1024 * 1024)).toFixed(2)} MB`);
}

extractAllChapters().catch(console.error);
