import fs from 'fs';

const pages = JSON.parse(fs.readFileSync('scripts/debug_cap1_raw.json', 'utf8'));

// Check font names of specific text snippets:
const searchSnippets = [
  'PONTOS IMPORTANTES',
  'INTRODUÇÃO',
  'ACOLHIMENTO E CLASSIFICAÇÃO DE RISCO',
  'TABELA 1',
  'MOV-ED',
  'Monitorização',
  'Oxigenioterapia suplementar',
  'Veia (acesso periférico)',
  'ABCDE',
  'A – Airway',
  'B – Breathing',
  'C – Circulação',
  'D – Disability',
  'E – Exposure',
  'FIGURA 1',
  'Escala de coma de Glasgow',
  'Escala de agitação e sedação de Richmond',
  'Behavioral Pain Scale',
  'Resposta motora',
  'Avaliação de pupilas',
  'Padrão respiratório',
  'Avaliação de pares cranianos',
  'Investigação etiológica',
  'LITERATURA RECOMENDADA'
];

pages.forEach(p => {
  p.items.forEach(it => {
    for (const snip of searchSnippets) {
      if (it.str.includes(snip)) {
        console.log(`P${p.pageNumber} [x=${it.x.toFixed(1)}, y=${it.y.toFixed(1)}] font=${it.font}, sz=${it.fontSize.toFixed(1)}: "${it.str}"`);
      }
    }
  });
});
