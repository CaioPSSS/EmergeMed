import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFParse } from 'pdf-parse';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

async function inspectToc() {
  const sumarioPath = path.join(projectRoot, 'scripts', 'Sumário.pdf');
  const mainPdfPath = path.join(projectRoot, 'scripts', 'Medicina de Emergência 18ed.pdf');

  console.log('--- 1. Lendo Sumário.pdf ---');
  if (fs.existsSync(sumarioPath)) {
    const buf = fs.readFileSync(sumarioPath);
    const parser = new PDFParse({ data: buf });
    await parser.load();
    const text = await parser.getText();
    console.log('=== Texto de Sumário.pdf (Primeiros 4000 chars) ===');
    console.log(text.text.slice(0, 4000));

    // Save full extracted text of Sumário.pdf for complete parsing
    fs.writeFileSync(path.join(projectRoot, 'scripts', 'extracted_sumario.txt'), text.text, 'utf8');
    console.log('\n✅ Salvo texto completo em scripts/extracted_sumario.txt');
  }

  console.log('\n--- 2. Lendo Marcadores/Outline do Livro Principal ---');
  if (fs.existsSync(mainPdfPath)) {
    const buf = fs.readFileSync(mainPdfPath);
    const parser = new PDFParse({ data: buf });
    await parser.load();
    // Check if bookmarks / outline exists in parser
    try {
      const outline = await parser.getOutline();
      console.log('=== Outline do Livro Principal ===');
      console.log(JSON.stringify(outline, null, 2).slice(0, 2000));
    } catch (e) {
      console.log('Note on getOutline:', e.message);
    }
  }
}

inspectToc().catch(console.error);
