import fs from 'fs';
import pdf from 'pdf-parse';

const pdfPath = 'C:\\Users\\souza\\Downloads\\Medicina de emergência abordagem prática 19ed 2025.pdf';
const dataBuffer = fs.readFileSync(pdfPath);
const chaptersMeta = JSON.parse(fs.readFileSync('scripts/chapters_19ed_pages.json', 'utf8'));

console.log('Testing extraction for chapters 1 to 5...');
const t0 = Date.now();

// Test extracting pages 78 to 150 (covering chapters 1 to 5)
const pagesData = new Map();

await pdf(dataBuffer, {
  max: 150,
  pagerender: async function(pageData) {
    if (pageData.pageNumber >= 78 && pageData.pageNumber <= 150) {
      const tc = await pageData.getTextContent();
      pagesData.set(pageData.pageNumber, {
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

const t1 = Date.now();
console.log(`Loaded ${pagesData.size} pages in ${((t1 - t0) / 1000).toFixed(2)} seconds`);
