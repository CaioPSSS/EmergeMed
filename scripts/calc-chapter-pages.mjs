import fs from 'fs';
import path from 'path';

const outline = JSON.parse(fs.readFileSync('c:\\Users\\souza\\planejamento-UPA\\scripts\\outline_19ed.json', 'utf8'));

// Find all chapters
const mainItems = outline.filter(o => o.section.startsWith('Seção') || o.section === 'Conteúdo complementar');

console.log('Total items in outline for chapters:', mainItems.length);

const chapters = [];
let capCounter = 0;

for (let i = 0; i < mainItems.length; i++) {
  const item = mainItems[i];
  const nextItem = mainItems[i + 1];
  
  const matchNum = item.title.match(/^(\d+)[\.\s–-]\s*(.+)/);
  let num = 0;
  let title = item.title;
  let isComplementary = item.section === 'Conteúdo complementar';

  if (matchNum) {
    num = parseInt(matchNum[1], 10);
    title = matchNum[2].trim();
  }

  const startPage = item.page;
  // End page is next item startPage - 1, or 1973 for the last one
  let endPage = nextItem ? nextItem.page - 1 : 1973;
  if (endPage < startPage) endPage = startPage;

  chapters.push({
    index: i + 1,
    chapterNumber: num,
    title,
    section: item.section,
    isComplementary,
    startPage,
    endPage,
    pageCount: endPage - startPage + 1
  });
}

console.log('Chapters extracted:');
console.log('Main chapters:', chapters.filter(c => !c.isComplementary).length);
console.log('Complementary chapters:', chapters.filter(c => c.isComplementary).length);
console.log('\nFirst 5 chapters:');
chapters.slice(0, 5).forEach(c => console.log(`Cap ${c.chapterNumber}: ${c.title} (pp. ${c.startPage}-${c.endPage}, ${c.pageCount} pgs)`));
console.log('\nChapters 118-122:');
chapters.filter(c => !c.isComplementary).slice(-5).forEach(c => console.log(`Cap ${c.chapterNumber}: ${c.title} (pp. ${c.startPage}-${c.endPage}, ${c.pageCount} pgs)`));
console.log('\nComplementary 1-5:');
chapters.filter(c => c.isComplementary).slice(0, 5).forEach(c => console.log(`Compl Cap ${c.chapterNumber}: ${c.title} (pp. ${c.startPage}-${c.endPage}, ${c.pageCount} pgs)`));

fs.writeFileSync('c:\\Users\\souza\\planejamento-UPA\\scripts\\chapters_19ed_pages.json', JSON.stringify(chapters, null, 2), 'utf8');
