import fs from 'fs';
import pdf from 'pdf-parse';

const pdfPath = 'C:\\Users\\souza\\Downloads\\Medicina de emergência abordagem prática 19ed 2025.pdf';
const dataBuffer = fs.readFileSync(pdfPath);

let tableCount = 0;
const sampleTables = [];

pdf(dataBuffer, {
  max: 200,
  pagerender: async function(pageData) {
    const tc = await pageData.getTextContent();
    for (const it of tc.items) {
      if (/^TABELA\s+\d+/i.test(it.str.trim())) {
        tableCount++;
        sampleTables.push({ page: pageData.pageNumber, table: it.str.trim() });
      }
    }
    return '';
  }
}).then(() => {
  console.log(`Found ${tableCount} tables in first 200 pages`);
  console.log(sampleTables.slice(0, 20));
}).catch(console.error);
