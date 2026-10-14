import fs from 'fs';
const outline = JSON.parse(fs.readFileSync('c:\\Users\\souza\\planejamento-UPA\\scripts\\outline_19ed.json', 'utf8'));
console.log('Searching in outline:');
outline.forEach(item => {
  if (/pericardio|sutura|imobiliza/i.test(item.title)) {
    console.log(item.section, '->', item.title, 'Page:', item.page);
  }
});
