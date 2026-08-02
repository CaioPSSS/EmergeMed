import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    lines: 12,
    ids: [],
    output: path.join(projectRoot, 'scripts', 'chapter_tails_report.md'),
  };

  for (const arg of args) {
    if (arg.startsWith('--lines=')) {
      const value = Number.parseInt(arg.split('=')[1], 10);
      if (Number.isFinite(value) && value > 0) {
        options.lines = value;
      }
    } else if (arg.startsWith('--ids=')) {
      options.ids = arg
        .split('=')[1]
        .split(',')
        .map((value) => Number.parseInt(value.trim(), 10))
        .filter((value) => Number.isFinite(value) && value > 0);
    } else if (arg.startsWith('--output=')) {
      options.output = path.isAbsolute(arg.split('=')[1])
        ? arg.split('=')[1]
        : path.join(projectRoot, arg.split('=')[1]);
    }
  }

  return options;
}

function getEndingLines(content, count) {
  const lines = String(content || '')
    .replace(/\r/g, '')
    .split('\n')
    .filter((line) => line.trim().length > 0);

  return lines.slice(Math.max(0, lines.length - count)).join('\n');
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function looksLikeReferenceTail(content) {
  const tail = String(content || '').slice(-2500);
  return /^(#{1,3}\s*)?(refer[eê]ncias|bibliografia|literatura recomendada)\b/im.test(tail)
    || /(refer[eê]ncias|bibliografia|literatura recomendada)/im.test(tail);
}

function main() {
  const options = parseArgs();
  const cachePath = path.join(projectRoot, 'scripts', 'index_cache.json');
  const mapPath = path.join(projectRoot, 'scripts', 'pdf_bookmarks_map.json');

  if (!fs.existsSync(cachePath)) {
    console.error('❌ index_cache.json não encontrado. Rode o indexador antes.');
    process.exit(1);
  }

  if (!fs.existsSync(mapPath)) {
    console.error('❌ pdf_bookmarks_map.json não encontrado.');
    process.exit(1);
  }

  const cacheData = readJsonFile(cachePath);
  const mapData = readJsonFile(mapPath);
  const mapByNum = Object.fromEntries(mapData.map((chapter) => [chapter.number, chapter]));

  const chapterNumbers = (options.ids.length > 0
    ? options.ids
    : Object.keys(cacheData).map((key) => Number.parseInt(key, 10)).filter((value) => Number.isFinite(value))
  ).sort((left, right) => left - right);

  const report = [];
  report.push('# Relatório dos finais dos capítulos');
  report.push('');
  report.push(`- Cache capítulos: ${chapterNumbers.length}`);
  report.push(`- Linhas finais por capítulo: ${options.lines}`);
  report.push(`- Gerado em: ${new Date().toISOString()}`);
  report.push('');

  for (const number of chapterNumbers) {
    const record = cacheData[number] || cacheData[String(number)];
    const meta = mapByNum[number];

    if (!record) {
      report.push(`## Capítulo ${number}`);
      report.push('');
      report.push('❌ Não encontrado no cache.');
      report.push('');
      continue;
    }

    const ending = getEndingLines(record.content, options.lines);
    const hasReferenceTail = looksLikeReferenceTail(record.content);
    const status = hasReferenceTail ? 'Provável final com referências' : 'Final sem marcador explícito de referências';

    report.push(`## Capítulo ${number}${meta ? ` - ${meta.title}` : ''}`);
    report.push('');
    report.push(`- Páginas: ${meta ? `${meta.startPage}-${meta.endPage}` : 'n/d'}`);
    report.push(`- Palavras: ${record.word_count ?? 'n/d'}`);
    report.push(`- Status: ${status}`);
    report.push('');
    report.push('```text');
    report.push(ending || '[sem conteúdo]');
    report.push('```');
    report.push('');
  }

  fs.writeFileSync(options.output, report.join('\n'), 'utf8');

  console.log(`✅ Relatório gerado em: ${options.output}`);
  console.log(`📚 Capítulos incluídos: ${chapterNumbers.length}`);
  console.log(`🧾 Linhas finais por capítulo: ${options.lines}`);
}

main();