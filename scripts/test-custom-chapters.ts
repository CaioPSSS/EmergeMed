import assert from 'assert';
import { CHAPTERS_DATA } from '../lib/chapters-data';
import { getNormalizedClinicalWeights, buildReadinessSnapshot } from '../lib/learning-engine';
import { formatCustomChapterToChapter, CustomChapterRow } from '../lib/chapters-service';

console.log('==================================================');
console.log('🧪 Validação da Integração de Capítulos Personalizados');
console.log('==================================================\n');

// 1. Test formatCustomChapterToChapter
const mockDbRow: CustomChapterRow = {
  id: 1001,
  user_id: '11111111-2222-3333-4444-555555555555',
  title: 'Cetoacidose Diabética e Estado Hiperosmolar',
  source_book: 'Harrison Medicina Interna 21ª Ed',
  section_title: 'Emergências Metabólicas',
  category: 'Metabólico',
  summary: '### Pérolas Clínicas\n- K+ < 3.3 contraindica insulina antes de repor.',
  content: '# Cetoacidose Diabética\n\nTexto médico formatado em Markdown...',
  raw_content: 'Texto bruto colado...',
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
assert.strictEqual(formatted.category, 'Metabólico', 'category deve coincidir');
console.log('✅ Teste 1: formatCustomChapterToChapter converteu corretamente para formato Chapter');

// 2. Test getNormalizedClinicalWeights with custom chapters
const customChaptersList = [...CHAPTERS_DATA, formatted];
const customWeights = {
  1001: {
    chapterId: 1001,
    frequencyScore: 8.5,
    importanceScore: 9.5,
    category: 'Metabólico',
  },
};

const weightsMap = getNormalizedClinicalWeights(customChaptersList, customWeights);
assert.strictEqual(weightsMap.size, 123, 'weightsMap deve conter 123 capítulos (122 + 1 custom)');
assert.ok(weightsMap.has(1001), 'weightsMap deve conter a entrada 1001');
const customWeightNorm = weightsMap.get(1001)!;
assert.ok(customWeightNorm.clinicalWeight > 0, 'clinicalWeight custom deve ser > 0');

// Verify clinical weights sum to ~1.0
let sumWeights = 0;
weightsMap.forEach((w) => {
  sumWeights += w.clinicalWeight;
});
assert.ok(Math.abs(sumWeights - 1.0) < 0.0001, `A soma dos pesos clínicos deve ser 1.0 (obtido: ${sumWeights})`);
console.log(`✅ Teste 2: getNormalizedClinicalWeights calculou pesos normalizados (soma = ${sumWeights.toFixed(4)})`);

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
assert.ok(snapshot.recommendations && snapshot.recommendations.length > 0, 'Deve gerar recomendações');
console.log('✅ Teste 3: buildReadinessSnapshot gerou snapshot com métricas FSRS para o capítulo 1001');

// 4. Test simulated test performance on custom chapter
const now = new Date();
const snapshotWithReadAndTest = buildReadinessSnapshot({
  progressList: [
    {
      chapter_id: 1001,
      is_read: true,
      read_count: 1,
      read_at: now.toISOString(),
      last_read_at: now.toISOString(),
    },
  ],
  reviewStatsList: [
    {
      chapter_id: 1001,
      times_reviewed: 1,
      times_correct: 1,
      times_incorrect: 0,
      last_reviewed_at: now.toISOString(),
      next_review_at: new Date(now.getTime() + 86400000).toISOString(),
      ease_factor: 2.5,
      interval_days: 1,
      stability: 3.0,
      difficulty: 5.0,
    },
  ],
  testsList: [
    {
      id: 'test-custom-1',
      chapter_ids: [1001],
      mode: 'standard',
      score: 9.0,
      completed: true,
      completed_at: now.toISOString(),
    },
  ],
  chaptersList: customChaptersList,
  customWeights,
});

const customMetric = snapshotWithReadAndTest.chapterMetrics[1001];
assert.strictEqual(customMetric.isRead, true, 'Capítulo deve constar como lido');
assert.strictEqual(customMetric.evidenceCount, 1, 'Deve registrar 1 evidência de teste');
assert.ok(customMetric.topicReadiness > 0, 'topicReadiness deve ser positivo');
console.log(`✅ Teste 4: FSRS e evidência de avaliação integrados (topicReadiness: ${customMetric.topicReadiness}%, retention: ${customMetric.retention}%)`);

console.log('\n==================================================');
console.log('🎉 TODOS OS TESTES PASSARAM COM 100% DE SUCESSO!');
console.log('==================================================\n');
