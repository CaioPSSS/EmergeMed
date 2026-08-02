import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

async function extractAllBookmarks() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfPath = path.join(projectRoot, 'scripts', 'Medicina de Emergência 18ed.pdf');

  const loadingTask = pdfjs.getDocument(pdfPath);
  const pdf = await loadingTask.promise;
  const outline = await pdf.getOutline();

  const allItems = [];

  async function traverse(items) {
    if (!items) return;
    for (const item of items) {
      let pageNum = null;
      if (item.dest) {
        try {
          let destRef = item.dest;
          if (typeof destRef === 'string') {
            destRef = await pdf.getDestination(destRef);
          }
          if (Array.isArray(destRef) && destRef[0]) {
            const pageIdx = await pdf.getPageIndex(destRef[0]);
            pageNum = pageIdx + 1;
          }
        } catch (e) {}
      }

      const title = item.title ? item.title.trim() : '';
      
      // Match chapter pattern: "1.", "122.", "Capítulo 1", "Cap. 1", "1 Abordagem..."
      const matchNum = title.match(/^(\d+)[\.\s–-]\s*(.+)/);
      if (matchNum && pageNum) {
        allItems.push({
          number: parseInt(matchNum[1], 10),
          title: matchNum[2].trim(),
          fullTitle: title,
          page: pageNum,
        });
      }

      if (item.items && item.items.length > 0) {
        await traverse(item.items);
      }
    }
  }

  await traverse(outline);

  // Deduplicate by chapter number
  const mapByNum = new Map();
  allItems.forEach((c) => {
    if (!mapByNum.has(c.number) || c.page) {
      mapByNum.set(c.number, c);
    }
  });

  const sorted = Array.from(mapByNum.values()).sort((a, b) => a.number - b.number);

  console.log(`✅ Total de capítulos extraídos com páginas exatas do PDF: ${sorted.length}`);
  sorted.forEach((c) => {
    console.log(`Cap ${c.number}: "${c.title}" -> Pág ${c.page}`);
  });

  fs.writeFileSync(
    path.join(projectRoot, 'scripts', 'pdf_bookmarks_map.json'),
    JSON.stringify(sorted, null, 2),
    'utf8'
  );
}

extractAllBookmarks().catch(console.error);
