import fs from 'fs';
import pdf from 'pdf-parse';

const pdfPath = 'C:\\Users\\souza\\Downloads\\Medicina de emergência abordagem prática 19ed 2025.pdf';
const dataBuffer = fs.readFileSync(pdfPath);

pdf(dataBuffer, {
  max: 79,
  pagerender: async function(pageData) {
    if (pageData.pageNumber === 79) {
      const tc = await pageData.getTextContent();
      console.log('--- Page 79 items with y > 700 (sorted descending by y, then x) ---');
      const topItems = tc.items
        .filter(item => item.str.trim() && item.transform[5] > 700)
        .sort((a, b) => {
          if (Math.abs(b.transform[5] - a.transform[5]) > 3) {
            return b.transform[5] - a.transform[5];
          }
          return a.transform[4] - b.transform[4];
        });
      for (const item of topItems) {
        console.log(`y=${item.transform[5].toFixed(1)}, x=${item.transform[4].toFixed(1)}, w=${item.width?.toFixed(1)}: "${item.str}"`);
      }
    }
    return '';
  }
}).catch(console.error);
