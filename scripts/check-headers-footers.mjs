import fs from 'fs';
import pdf from 'pdf-parse';

const pdfPath = 'C:\\Users\\souza\\Downloads\\Medicina de emergência abordagem prática 19ed 2025.pdf';
const dataBuffer = fs.readFileSync(pdfPath);

const samplePages = [78, 79, 80, 81, 82, 89, 90, 100, 200, 500, 1000, 1500, 1900];
const topBottomLines = {};

pdf(dataBuffer, {
  max: 1910,
  pagerender: async function(pageData) {
    if (samplePages.includes(pageData.pageNumber)) {
      const tc = await pageData.getTextContent();
      const items = tc.items
        .filter(it => it.str.trim())
        .sort((a,b) => {
          if (Math.abs(b.transform[5] - a.transform[5]) > 2) return b.transform[5] - a.transform[5];
          return a.transform[4] - b.transform[4];
        });
      
      const topItems = items.filter(it => it.transform[5] > 780);
      const bottomItems = items.filter(it => it.transform[5] < 60);
      topBottomLines[pageData.pageNumber] = {
        top: topItems.map(it => `[y=${it.transform[5].toFixed(1)}, x=${it.transform[4].toFixed(1)}] ${it.str}`),
        bottom: bottomItems.map(it => `[y=${it.transform[5].toFixed(1)}, x=${it.transform[4].toFixed(1)}] ${it.str}`)
      };
    }
    return '';
  }
}).then(() => {
  for (const p of samplePages) {
    console.log(`=== Page ${p} ===`);
    console.log('  TOP:', topBottomLines[p]?.top);
    console.log('  BOTTOM:', topBottomLines[p]?.bottom);
  }
}).catch(console.error);
