import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

async function fixChaptersData() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfPath = path.join(projectRoot, 'scripts', 'Medicina de Emergência 18ed.pdf');

  console.log('⏳ Extraindo marcadores CORRETOS da 18ª edição do livro (Capítulos 1 a 119)...');
  const loadingTask = pdfjs.getDocument(pdfPath);
  const pdf = await loadingTask.promise;
  const outline = await pdf.getOutline();

  const chaptersList = [];

  async function resolvePage(item) {
    if (!item || !item.dest) return null;
    try {
      let destRef = item.dest;
      if (typeof destRef === 'string') {
        destRef = await pdf.getDestination(destRef);
      }
      if (Array.isArray(destRef) && destRef[0]) {
        const pageIdx = await pdf.getPageIndex(destRef[0]);
        return pageIdx + 1; // 1-based page index
      }
    } catch (e) {}
    return null;
  }

  // Iterate top-level sections (Seção I to XX)
  for (const section of outline) {
    // Only process items inside main book sections (ignore end-of-book supplemental chapters)
    if (section.title && section.title.toLowerCase().includes('seção') && section.items) {
      for (const item of section.items) {
        const title = item.title ? item.title.trim() : '';
        const matchNum = title.match(/^(\d+)[\.\s–-]\s*(.+)/);
        if (matchNum) {
          const num = parseInt(matchNum[1], 10);
          const pageNum = await resolvePage(item);
          if (pageNum) {
            chaptersList.push({
              number: num,
              title: matchNum[2].trim(),
              fullTitle: title,
              startPage: pageNum,
            });
          }
        }
      }
    }
  }

  // Sort strictly by chapter number
  chaptersList.sort((a, b) => a.number - b.number);

  // Deduplicate by chapter number
  const uniqueMap = new Map();
  chaptersList.forEach((c) => {
    if (!uniqueMap.has(c.number)) {
      uniqueMap.set(c.number, c);
    }
  });

  const sortedChapters = Array.from(uniqueMap.values()).sort((a, b) => a.number - b.number);

  console.log(`✅ Extraídos com sucesso ${sortedChapters.length} capítulos principais (1 a ${sortedChapters[sortedChapters.length - 1].number})!`);

  const finalMap = sortedChapters.map((item, idx) => {
    const nextItem = sortedChapters[idx + 1];
    const startPage = item.startPage;
    let endPage = nextItem ? nextItem.startPage - 1 : 2236; // Before Section XVIII supplemental
    if (endPage < startPage) endPage = startPage;

    return {
      id: `cap-${item.number}`,
      number: item.number,
      title: item.title,
      startPage,
      endPage,
    };
  });

  console.log('\n=== VERIFICAÇÃO DOS PRIMEIROS 10 CAPÍTULOS ===');
  for (let i = 0; i < 10; i++) {
    const c = finalMap[i];
    const pageObj = await pdf.getPage(c.startPage);
    const textContent = await pageObj.getTextContent();
    const snippet = textContent.items.map((it) => it.str).join(' ').slice(0, 120);
    console.log(`Cap ${c.number}: "${c.title}" (Págs ${c.startPage}-${c.endPage}) -> Snippet: "${snippet}"`);
  }

  // Write pdf_bookmarks_map.json
  const jsonPath = path.join(projectRoot, 'scripts', 'pdf_bookmarks_map.json');
  fs.writeFileSync(jsonPath, JSON.stringify(finalMap, null, 2), 'utf8');
  console.log(`\n💾 Mapeamento perfeito salvo em: ${jsonPath}`);

  // Write lib/chapters-data.ts
  const tsContent = `export interface Chapter {
  id: string;
  number: number;
  title: string;
  startPage?: number;
  endPage?: number;
}

export const CHAPTERS_DATA: Chapter[] = ${JSON.stringify(finalMap, null, 2)};
`;

  const tsPath = path.join(projectRoot, 'lib', 'chapters-data.ts');
  fs.writeFileSync(tsPath, tsContent, 'utf8');
  console.log(`💾 lib/chapters-data.ts atualizado!`);
}

fixChaptersData().catch(console.error);
