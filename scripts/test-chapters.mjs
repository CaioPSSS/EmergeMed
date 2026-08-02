import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFParse } from 'pdf-parse';
import { CHAPTERS_DATA } from '../lib/chapters-data.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

async function testSegmentation() {
  const pdfPath = path.join(projectRoot, 'scripts', 'Medicina de Emergência 18ed.pdf');
  const buffer = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: buffer });
  await parser.load();
  const textResult = await parser.getText();
  const rawText = textResult.text || '';

  const pageMarker = `-- 166 of`;
  let startIdx = rawText.indexOf(pageMarker);
  if (startIdx === -1) startIdx = 0;
  const targetText = rawText.slice(startIdx);

  console.log(`Total target text length: ${targetText.length} characters.`);

  // Find exact position for each chapter
  const matches = [];
  for (const cap of CHAPTERS_DATA) {
    // Try multiple regex patterns: "Capítulo 3", "CAPÍTULO 3", "Cap. 3", "CAP. 3"
    const patterns = [
      new RegExp(`Cap[íi]tulo\\s*${cap.number}\\b`, 'i'),
      new RegExp(`CAP[ÍI]TULO\\s*${cap.number}\\b`),
      new RegExp(`Cap\\.\\s*${cap.number}\\b`, 'i'),
    ];

    let foundIdx = -1;
    let matchedStr = '';

    for (const pat of patterns) {
      const m = pat.exec(targetText);
      if (m) {
        foundIdx = m.index;
        matchedStr = m[0];
        break;
      }
    }

    matches.push({ cap, index: foundIdx, matchedStr });
  }

  // Calculate slice lengths
  for (let i = 0; i < matches.length; i++) {
    const curr = matches[i];
    const next = matches[i + 1];

    let start = curr.index;
    let end = targetText.length;

    if (next && next.index > start && next.index !== -1) {
      end = next.index;
    }

    let len = 0;
    if (start !== -1) {
      len = end - start;
    } else {
      len = Math.floor(targetText.length / CHAPTERS_DATA.length);
    }

    console.log(`Cap ${curr.cap.number} (${curr.cap.title}): Start=${curr.index}, End=${end}, Len=${len} chars (${Math.round(len/6)} words)`);
  }
}

testSegmentation();
