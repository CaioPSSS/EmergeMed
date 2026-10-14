import fs from 'fs';
import pdf from 'pdf-parse';

const pdfPath = 'C:\\Users\\souza\\Downloads\\Medicina de emergência abordagem prática 19ed 2025.pdf';
const dataBuffer = fs.readFileSync(pdfPath);

let foundFigures = [];

pdf(dataBuffer, {
  max: 95, // Chapters 1 and 2
  pagerender: async function(pageData) {
    const tc = await pageData.getTextContent();
    for (const it of tc.items) {
      if (it.str.includes('FIGURA') || it.str.includes('Fluxograma') || it.str.includes('FLUXOGRAMA')) {
        foundFigures.push({ page: pageData.pageNumber, text: it.str });
      }
    }
    return '';
  }
}).then(() => {
  console.log('Figures found in first ~95 pages:');
  console.log(JSON.stringify(foundFigures, null, 2));
}).catch(console.error);
