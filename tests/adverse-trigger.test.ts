/**
 * Testes da regra de disparo da Evolução Adversa (lib/ai/adverse-trigger.ts).
 * Usage: npx tsx tests/adverse-trigger.test.ts
 */
import assert from 'assert';
import {
  evaluationTriggersDeterioration,
  collectDeteriorationErrors,
} from '../lib/ai/adverse-trigger';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`✅ ${name}`);
}

const bedQs = [
  { id: 1, type: 'multiple_choice', vignette: 'MCQ 1' },
  { id: 2, type: 'multiple_choice', vignette: 'MCQ 2' },
  { id: 3, type: 'prescription_immediate', vignette: 'Etapa 1', idealPrescription: 'ideal 1' },
  { id: 4, type: 'prescription_complete', vignette: 'Etapa 2', idealPrescription: 'ideal 2' },
];

test('"Requer Ajustes" sem deteriorationRisk.triggered NÃO dispara (caso do cálcio 30 mL)', () => {
  const evals = {
    3: {
      score: 6.0,
      userPrescription: 'Gluconato de cálcio 10% 30 mL EV em 10 min...',
      evaluation: {
        score: 6.0,
        verdict: 'Requer Ajustes',
        errorTags: [{ competency: 'farmacologia', severity: 'moderado', description: 'bicarbonato alto' }],
        deteriorationRisk: { triggered: false, mechanism: '', justification: 'Dentro de protocolo / sem dano que exija resgate' },
      },
    },
  };
  assert.deepStrictEqual(collectDeteriorationErrors(bedQs, evals), []);
});

test('Múltipla escolha errada NUNCA dispara, mesmo com objeto marcado', () => {
  const evals = {
    1: { score: 0, isCorrect: false, deteriorationRisk: { triggered: true } },
    2: { score: 0, isCorrect: false, deteriorationRisk: { triggered: true } },
  };
  assert.deepStrictEqual(collectDeteriorationErrors(bedQs, evals), []);
});

test('deteriorationRisk.triggered = true dispara e leva mecanismo + erros crítico/moderado', () => {
  const evals = {
    4: {
      score: 3.0,
      userPrescription: 'Insulina regular 100 UI EV bolus',
      evaluation: {
        score: 3.0,
        verdict: 'Inadequado',
        idealPrescription: 'Insulina 0,1 UI/kg/h',
        errorTags: [
          { competency: 'farmacologia', severity: 'critico', description: 'Sobredose de insulina' },
          { competency: 'prescricao_geral', severity: 'leve', description: 'Sem velocidade' },
        ],
        deteriorationRisk: { triggered: true, mechanism: 'Hipoglicemia grave', justification: 'SIM x3' },
      },
    },
  };
  const ctx = collectDeteriorationErrors(bedQs, evals);
  assert.strictEqual(ctx.length, 1);
  assert.strictEqual(ctx[0].userText, 'Insulina regular 100 UI EV bolus');
  assert.strictEqual(ctx[0].deteriorationMechanism, 'Hipoglicemia grave');
  assert.deepStrictEqual(ctx[0].errors, ['[critico] Sobredose de insulina']);
  assert.ok(!ctx[0].userText.includes('Veredito'), 'userText deve conter só a prescrição (fatos matemáticos limpos)');
});

test('Legado sem deteriorationRisk: só erro crítico estruturado dispara', () => {
  assert.strictEqual(
    evaluationTriggersDeterioration({ evaluation: { verdict: 'Requer Ajustes', score: 5, errorTags: [{ severity: 'moderado', description: 'x' }] } }),
    false
  );
  assert.strictEqual(
    evaluationTriggersDeterioration({ evaluation: { verdict: 'Inadequado', score: 2, errorTags: [{ severity: 'critico', description: 'x' }] } }),
    true
  );
});

test('Fallback de lote corrompido (errorTags como strings, 5.0) NÃO dispara', () => {
  assert.strictEqual(
    evaluationTriggersDeterioration({ score: 5.0, evaluation: { score: 5.0, verdict: 'Requer Ajustes', errorTags: ['reavaliacao_necessaria'] } }),
    false
  );
});

test('deteriorationRisk explícito false prevalece sobre erro crítico legado', () => {
  assert.strictEqual(
    evaluationTriggersDeterioration({ evaluation: { errorTags: [{ severity: 'critico', description: 'x' }], deteriorationRisk: { triggered: false } } }),
    false
  );
});

console.log(`\n${passed} testes passaram.`);
