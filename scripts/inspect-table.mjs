import fs from 'fs';
import pdf from 'pdf-parse';

const pdfPath = 'C:\\Users\\souza\\Downloads\\Medicina de emergência abordagem prática 19ed 2025.pdf';
const dataBuffer = fs.readFileSync(pdfPath);

pdf(dataBuffer, {
  max: 78,
  pagerender: async function(pageData) {
    if (pageData.pageNumber === 78) {
      const tc = await pageData.getTextContent();
      const tabItems = tc.items
        .filter(it => it.str.trim())
        .sort((a,b) => {
          if (Math.abs(b.transform[5] - a.transform[5]) > 2) return b.transform[5] - a.transform[5];
          return a.transform[4] - b.transform[4];
        });
      let tabIdx = tabItems.findIndex(it => it.str.includes('TABELA 1'));
      console.log('Tabela 1 index:', tabIdx, 'Total items:', tabItems.length);
      if (tabIdx >= 0) {
        for (let i = tabIdx; i < Math.min(tabIdx + 50, tabItems.length); i++) {
          const item = tabItems[i];
          console.log(`y=${item.transform[5].toFixed(1)}, x=${item.transform[4].toFixed(1)}: "${item.str}"`);
        }
      }
    }
    return '';
  }
}).catch(console.error);
