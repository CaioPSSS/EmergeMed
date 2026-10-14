import fs from 'fs';
import pdf from 'pdf-parse';

const pdfPath = 'C:\\Users\\souza\\Downloads\\Medicina de emergência abordagem prática 19ed 2025.pdf';
const dataBuffer = fs.readFileSync(pdfPath);

pdf(dataBuffer, {
  max: 88,
  pagerender: async function(pageData) {
    if ([83, 84, 85, 86, 88].includes(pageData.pageNumber)) {
      const tc = await pageData.getTextContent();
      const items = tc.items
        .filter(it => it.str.trim())
        .sort((a,b) => {
          if (Math.abs(b.transform[5] - a.transform[5]) > 2) return b.transform[5] - a.transform[5];
          return a.transform[4] - b.transform[4];
        });
      console.log(`\n=== PAGE ${pageData.pageNumber} ===`);
      for (const it of items) {
        if (it.str.includes('FIGURA') || it.transform[5] < 300) {
          console.log(`[y=${it.transform[5].toFixed(1)}, x=${it.transform[4].toFixed(1)}] ${it.str}`);
        }
      }
    }
    return '';
  }
}).catch(console.error);
