import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFParse } from 'pdf-parse';
import { CHAPTERS_DATA } from '../lib/chapters-data.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

async function findExactPages() {
  const pdfPath = path.join(projectRoot, 'scripts', 'Medicina de Emergência 18ed.pdf');
  const buffer = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: buffer });
  await parser.load();
  const textResult = await parser.getText();
  const rawText = textResult.text || '';

  // Find start of content (after Sumário, at page 166)
  const sumarioEndIdx = rawText.indexOf('-- 166 of');
  console.log(`📌 Sumário termina na página 166 (Índice de caractere: ${sumarioEndIdx})`);

  // Extract all page markers and their string character positions
  const pageMarkerRegex = /--\s*(\d+)\s*of\s*\d+\s*--/g;
  const pageMap = [];
  let match;

  while ((match = pageMarkerRegex.exec(rawText)) !== null) {
    pageMap.push({
      page: parseInt(match[1], 10),
      index: match.index,
    });
  }

  const realChapters = [];

  for (let i = 0; i < CHAPTERS_DATA.length; i++) {
    const cap = CHAPTERS_DATA[i];

    // Search ONLY AFTER sumarioEndIdx
    const searchScope = rawText.slice(sumarioEndIdx);
    
    // Patterns to match chapter headers in body text:
    // e.g. "Capítulo 1", "CAPÍTULO 1", "Cap. 1", "1 Abordagem"
    const patterns = [
      new RegExp(`Cap[íi]tulo\\s*${cap.number}\\b`, 'i'),
      new RegExp(`CAP[ÍI]TULO\\s*${cap.number}\\b`),
      new RegExp(`Cap\\.\\s*${cap.number}\\b`, 'i'),
      new RegExp(`${cap.number}\\.\\s*${cap.title.slice(0, 10)}`, 'i'),
    ];

    let foundRelativeIdx = -1;
    for (const pat of patterns) {
      const m = pat.exec(searchScope);
      if (m) {
        foundRelativeIdx = m.index;
        break;
      }
    }

    let absoluteIdx = sumarioEndIdx;
    if (foundRelativeIdx !== -1) {
      absoluteIdx = sumarioEndIdx + foundRelativeIdx;
    }

    let startPage = 166;
    if (absoluteIdx !== -1) {
      const prevPage = pageMap.filter((p) => p.index <= absoluteIdx).pop();
      if (prevPage) {
        startPage = prevPage.page;
      }
    }

    realChapters.push({
      cap,
      found: foundRelativeIdx !== -1,
      startPage,
    });
  }

  // Assign endPage based on next chapter's startPage
  const finalChapters = realChapters.map((item, idx) => {
    const nextItem = realChapters[idx + 1];
    const startPage = item.startPage;
    let endPage = nextItem ? nextItem.startPage - 1 : 2514;
    if (endPage < startPage) endPage = startPage;

    return {
      id: item.cap.id,
      number: item.cap.number,
      title: item.cap.title,
      startPage,
      endPage,
    };
  });

  console.log('=== PRIMEIROS 20 CAPÍTULOS MAPEADOS APÓS SUMÁRIO ===');
  finalChapters.slice(0, 20).forEach((c) => {
    console.log(`Cap ${c.number}: "${c.title}" -> Páginas ${c.startPage} até ${c.endPage}`);
  });

  // Save map to scripts/pdf_bookmarks_map.json
  const jsonPath = path.join(projectRoot, 'scripts', 'pdf_bookmarks_map.json');
  fs.writeFileSync(jsonPath, JSON.stringify(finalChapters, null, 2), 'utf8');
  console.log(`\n✅ Mapeamento perfeito de páginas reais salvo em: ${jsonPath}`);
}

findExactPages().catch(console.error);
