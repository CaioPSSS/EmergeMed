import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

async function testPageOffset() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfPath = path.join(projectRoot, 'scripts', 'Medicina de Emergência 18ed.pdf');

  const loadingTask = pdfjs.getDocument(pdfPath);
  const pdf = await loadingTask.promise;
  const outline = await pdf.getOutline();

  console.log('--- Checking outline item for Chapter 1 and Chapter 2 ---');
  async function resolvePage(item) {
    if (!item || !item.dest) return null;
    try {
      let destRef = item.dest;
      if (typeof destRef === 'string') {
        destRef = await pdf.getDestination(destRef);
      }
      if (Array.isArray(destRef) && destRef[0]) {
        const pageIdx = await pdf.getPageIndex(destRef[0]);
        return pageIdx + 1; // 1-based page
      }
    } catch (e) {}
    return null;
  }

  // Find item for "Abordagem" or "1."
  for (const section of outline) {
    console.log('Section:', section.title);
    if (section.items) {
      for (const ch of section.items.slice(0, 5)) {
        const p = await resolvePage(ch);
        console.log(`   Sub-Item: "${ch.title}" -> pdfjs Page ${p}`);
        if (p) {
          const pageObj = await pdf.getPage(p);
          const text = await pageObj.getTextContent();
          const str = text.items.map((i) => i.str).join(' ');
          console.log(`      Snippet at page ${p}:`, str.slice(0, 150));
        }
      }
    }
  }
}

testPageOffset().catch(console.error);
