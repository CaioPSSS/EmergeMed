import fs from 'fs';
import pdf from 'pdf-parse';

const pdfPath = 'C:\\Users\\souza\\Downloads\\Medicina de emergência abordagem prática 19ed 2025.pdf';
const dataBuffer = fs.readFileSync(pdfPath);

const testPages = [78, 80, 89, 90, 150, 460, 807, 1200, 1684];

pdf(dataBuffer, {
  max: 1700,
  pagerender: async function(pageData) {
    if (testPages.includes(pageData.pageNumber)) {
      const tc = await pageData.getTextContent();
      // Analyze x distributions
      const xCoords = tc.items.map(it => Math.round(it.transform[4]));
      const leftCol = xCoords.filter(x => x < 280).length;
      const rightCol = xCoords.filter(x => x >= 280).length;
      console.log(`Page ${pageData.pageNumber}: total items=${tc.items.length}, x < 280: ${leftCol}, x >= 280: ${rightCol}`);
    }
    return '';
  }
}).then(() => {
  console.log('Done testing page layouts.');
}).catch(console.error);
