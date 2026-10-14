import fs from 'fs';
import pdf from 'pdf-parse';

const pdfPath = 'C:\\Users\\souza\\Downloads\\Medicina de emergência abordagem prática 19ed 2025.pdf';
const dataBuffer = fs.readFileSync(pdfPath);

pdf(dataBuffer, {
  max: 91,
  pagerender: async function(pageData) {
    if (pageData.pageNumber === 91) {
      const tc = await pageData.getTextContent();
      const items = tc.items
        .filter(it => it.str.trim())
        .sort((a,b) => {
          if (Math.abs(b.transform[5] - a.transform[5]) > 2) return b.transform[5] - a.transform[5];
          return a.transform[4] - b.transform[4];
        });
      console.log(`\n=== PAGE 91 (items: ${items.length}) ===`);
      for (const it of items) {
        console.log(`[y=${it.transform[5].toFixed(1)}, x=${it.transform[4].toFixed(1)}] ${it.str}`);
      }
    }
    return '';
  }
}).catch(console.error);
