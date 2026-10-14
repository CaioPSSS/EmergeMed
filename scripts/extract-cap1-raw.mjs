import fs from 'fs';
import pdf from 'pdf-parse';

const pdfPath = 'C:\\Users\\souza\\Downloads\\Medicina de emergência abordagem prática 19ed 2025.pdf';
const dataBuffer = fs.readFileSync(pdfPath);

async function parseChapter1() {
  const pagesData = [];

  await pdf(dataBuffer, {
    max: 88,
    pagerender: async function(pageData) {
      if (pageData.pageNumber >= 78 && pageData.pageNumber <= 88) {
        const tc = await pageData.getTextContent();
        pagesData.push({
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

  console.log(`Loaded ${pagesData.length} pages for Chapter 1`);
  fs.writeFileSync('scripts/debug_cap1_raw.json', JSON.stringify(pagesData, null, 2), 'utf8');
}

parseChapter1().catch(console.error);
