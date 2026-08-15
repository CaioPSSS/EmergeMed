import assert from 'assert';
import { CHAPTERS_DATA } from '../dist/chapters-data.js';
import { getNormalizedClinicalWeights, buildReadinessSnapshot } from '../dist/learning-engine.js';
import { formatCustomChapterToChapter } from '../dist/chapters-service.js';

console.log('🧪 Iniciando testes do módulo de Capítulos Personalizados...');

// 1. Test formatCustomChapterToChapter
const mockDbRow = {
  id: 1001,
  user_id: '11111111-2222-3333-4444-555555555555',
  title: 'Cetoacidose Diabética e Estado Hiperosmolar',
  source_book: 'Harrison Medicina Interna 21ª Ed',
  section_title: 'Emergências Metabólicas',
  category: 'Metabólico',
  summary: '### Pérolas Clínicas\n- K+ < 3.3 contraindica insulina',
  content: '# Cetoacidose Diabética\n\nTexto completo...',
  raw_content: 'Texto bruto...',
  frequency_score: 8.5,
  importance_score: 9.5,
  word_count: 1500,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const formatted = formatCustomChapterToChapter(mockDbRow);
assert.strictEqual(formatted.id, 1001, 'ID do capítulo customizado deve ser 1001');
assert.strictEqual(formatted.isCustom, true, 'isCustom deve ser true');
assert.strictEqual(formatted.sourceBook, 'Harrison Medicina Interna 21ª Ed', 'sourceBook deve coincidir');
console.log('✅ Teste 1: formatCustomChapterToChapter executado com sucesso');

// 2. Test getNormalizedClinicalWeights with custom chapters
const customChaptersList = [...CHAPTERS_DATA, formatted];
const customWeights = {
  1001: {
    frequencyScore: 8.5,
    importanceScore: 9.5,
    category: 'Metabólico',
  },
};

const weightsMap = getNormalizedClinicalWeights(customChaptersList, customWeights);
assert.strictEqual(weightsMap.size, 123, 'weightsMap deve conter 123 capítulos (122 + 1 custom)');
assert.ok(weightsMap.has(1001), 'weightsMap deve conter a entrada 1001');
const customWeightNorm = weightsMap.get(1001);
assert.ok(customWeightNorm.clinicalWeight > 0, 'clinicalWeight custom deve ser > 0');
console.log('✅ Teste 2: getNormalizedClinicalWeights com capítulos customizados executado com sucesso');

// 3. Test buildReadinessSnapshot with custom chapters in recommendations
const snapshot = buildReadinessSnapshot({
  progressList: [],
  reviewStatsList: [],
  testsList: [],
  chaptersList: customChaptersList,
  customWeights,
});

assert.ok(snapshot.chapterMetrics[1001], 'snapshot deve conter métricas para o capítulo 1001');
assert.strictEqual(snapshot.chapterMetrics[1001].isRead, false, 'Capítulo não lido deve ter isRead: false');
assert.ok(snapshot.chapterMetrics[1001].expansionScore > 0, 'expansionScore deve ser > 0');
console.log('✅ Teste 3: buildReadinessSnapshot com capítulos customizados executado com sucesso');

console.log('\n🎉 TODOS OS TESTES PASSARAM COM SUCESSO!');
