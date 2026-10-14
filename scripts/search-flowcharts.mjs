import fs from 'fs';
import pdf from 'pdf-parse';

const pdfPath = 'C:\\Users\\souza\\Downloads\\Medicina de emergência abordagem prática 19ed 2025.pdf';
const dataBuffer = fs.readFileSync(pdfPath);

const results = [];

pdf(dataBuffer, {
  max: 300,
  pagerender: async function(pageData) {
    const tc = await pageData.getTextContent();
    for (const it of tc.items) {
      if (/fluxograma|algoritmo/i.test(it.str)) {
        results.push({ page: pageData.pageNumber, text: it.str });
      }
    }
    return '';
  }
}).then(() => {
  console.log('Sample mentions in first 300 pages:', results.slice(0, 30));
}).catch(console.error);
