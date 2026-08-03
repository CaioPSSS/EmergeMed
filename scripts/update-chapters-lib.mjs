import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const SECTION_DEFINITIONS = [
  { number: 1, title: 'Abordagem Inicial do Paciente Grave', startCap: 1, endCap: 17 },
  { number: 2, title: 'Sinais e Sintomas Sintomáticos na Emergência', startCap: 18, endCap: 28 },
  { number: 3, title: 'Emergências Cardiovasculares', startCap: 29, endCap: 40 },
  { number: 4, title: 'Emergências Pulmonares', startCap: 41, endCap: 47 },
  { number: 5, title: 'Doenças Infecciosas na Emergência', startCap: 48, endCap: 52 },
  { number: 6, title: 'Emergências Neurológicas', startCap: 53, endCap: 61 },
  { number: 7, title: 'Abordagem do Paciente Vítima de Trauma', startCap: 62, endCap: 69 },
  { number: 8, title: 'Emergências Gastrointestinais e Hepáticas', startCap: 70, endCap: 77 },
  { number: 9, title: 'Emergências Renais e Distúrbios Hidroeletrolíticos e Acidobásicos', startCap: 78, endCap: 87 },
  { number: 10, title: 'Emergências Endocrinológicas e Metabólicas', startCap: 88, endCap: 91 },
  { number: 11, title: 'Emergências Hematológicas e Oncológicas', startCap: 92, endCap: 97 },
  { number: 12, title: 'Emergências Reumatológicas', startCap: 98, endCap: 98 },
  { number: 13, title: 'Intoxicações Exógenas e Acidentes por Animais Peçonhentos', startCap: 99, endCap: 105 },
  { number: 14, title: 'Emergências Dermatológicas', startCap: 106, endCap: 107 },
  { number: 15, title: 'Emergências Oftalmológicas', startCap: 108, endCap: 108 },
  { number: 16, title: 'Emergências Otorrinolaringológicas', startCap: 109, endCap: 109 },
  { number: 17, title: 'Ginecologia, Obstetrícia e Grupos Especiais', startCap: 110, endCap: 112 },
  { number: 18, title: 'Cuidados Paliativos na Emergência', startCap: 113, endCap: 113 },
  { number: 19, title: 'Ultrassonografia à Beira do Leito (POCUS)', startCap: 114, endCap: 116 },
  { number: 20, title: 'Procedimentos no Departamento de Emergência', startCap: 117, endCap: 119 },
];

const rawChapters = JSON.parse(fs.readFileSync(path.join(projectRoot, 'scripts', 'pdf_bookmarks_map.json'), 'utf8'));

const CHAPTERS_DATA = rawChapters.map((cap) => {
  const capNum = cap.number;
  const sec = SECTION_DEFINITIONS.find((s) => capNum >= s.startCap && capNum <= s.endCap) || {
    number: 1,
    title: 'Abordagem Inicial do Paciente Grave',
  };

  return {
    id: capNum,
    number: capNum,
    title: cap.title,
    sectionNumber: sec.number,
    sectionTitle: sec.title,
    startPage: cap.startPage,
    endPage: cap.endPage,
  };
});

const SECTIONS = SECTION_DEFINITIONS.map((sec) => {
  const chapters = CHAPTERS_DATA.filter((c) => c.sectionNumber === sec.number);
  return {
    number: sec.number,
    title: sec.title,
    chapters,
  };
});

const tsCode = `export interface Chapter {
  id: number;
  number: number;
  title: string;
  sectionNumber: number;
  sectionTitle: string;
  startPage?: number;
  endPage?: number;
}

export interface Section {
  number: number;
  title: string;
  chapters: Chapter[];
}

export const CHAPTERS_DATA: Chapter[] = ${JSON.stringify(CHAPTERS_DATA, null, 2)};

export const SECTIONS: Section[] = ${JSON.stringify(SECTIONS, null, 2)};
`;

const outputPath = path.join(projectRoot, 'lib', 'chapters-data.ts');
fs.writeFileSync(outputPath, tsCode, 'utf8');
console.log(`✅ Atualizado lib/chapters-data.ts com ${CHAPTERS_DATA.length} capítulos e ${SECTIONS.length} seções!`);
