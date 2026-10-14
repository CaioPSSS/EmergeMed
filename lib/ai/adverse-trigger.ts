/**
 * Regras de disparo da Evolução Adversa (Q5 bônus) do Modo Plantão.
 *
 * Módulo puro (sem dependências de servidor) — usado tanto no cliente (testes/[id]/page.tsx)
 * quanto nas rotas de API (check-batch-status), para que o critério seja ÚNICO em todo o app.
 *
 * Princípios:
 * - Questões de múltipla escolha NUNCA disparam complicação (são teóricas e não fazem parte
 *   da conduta aplicada ao paciente).
 * - Veredito ("Requer Ajustes") e nota NÃO disparam complicação por si só.
 * - O gatilho é o julgamento clínico explícito do avaliador: `deteriorationRisk.triggered`,
 *   que exige SIM às 3 perguntas (fora de prática reconhecida / mecanismo plausível no horizonte
 *   do plantão / dano que exige nova intervenção de resgate).
 */

export interface AdverseErrorContext {
  questionType: string;
  vignette: string;
  /** Conduta/prescrição do médico (texto puro, usado também nos fatos matemáticos). */
  userText: string;
  idealText?: string;
  /** Erros classificados como crítico/moderado pelo avaliador. */
  errors?: string[];
  /** Mecanismo fisiopatológico de deterioração declarado pelo avaliador. */
  deteriorationMechanism?: string;
  deteriorationJustification?: string;
}

function unwrapEvaluation(entry: any): any {
  if (!entry || typeof entry !== 'object') return null;
  // Os resultados persistidos têm o formato { score, userPrescription, evaluation: {...} }
  return entry.evaluation && typeof entry.evaluation === 'object' ? entry.evaluation : entry;
}

/**
 * Retorna true quando a avaliação de UMA prescrição justifica gerar uma complicação.
 */
export function evaluationTriggersDeterioration(entry: any): boolean {
  const ev = unwrapEvaluation(entry);
  if (!ev) return false;

  const risk = ev.deteriorationRisk;
  if (risk && typeof risk === 'object' && typeof risk.triggered === 'boolean') {
    return risk.triggered;
  }

  // Avaliações legadas (sem deteriorationRisk): só um erro CRÍTICO estruturado dispara.
  // Fallbacks de lote corrompido usam errorTags como strings e, por isso, nunca disparam.
  return (
    Array.isArray(ev.errorTags) &&
    ev.errorTags.some((t: any) => t && typeof t === 'object' && t.severity === 'critico')
  );
}

/**
 * Monta o contexto de erro enviado ao gerador de evolução adversa.
 */
export function buildAdverseErrorContext(
  question: { type: string; vignette: string; idealPrescription?: string },
  entry: any
): AdverseErrorContext {
  const ev = unwrapEvaluation(entry) || {};
  const risk = ev.deteriorationRisk || {};
  const errors: string[] = Array.isArray(ev.errorTags)
    ? ev.errorTags
        .filter((t: any) => t && typeof t === 'object' && (t.severity === 'critico' || t.severity === 'moderado'))
        .map((t: any) => `[${t.severity}] ${t.description}`)
    : [];

  return {
    questionType: question.type,
    vignette: question.vignette,
    userText: entry?.userPrescription || 'Prescrição enviada',
    idealText: ev.idealPrescription || question.idealPrescription || 'Conduta de referência',
    errors,
    deteriorationMechanism: typeof risk.mechanism === 'string' ? risk.mechanism : undefined,
    deteriorationJustification: typeof risk.justification === 'string' ? risk.justification : undefined,
  };
}

/**
 * Seleciona, entre as questões de um leito, as prescrições cuja avaliação dispara deterioração
 * e devolve o contexto de erro pronto para o gerador. Lista vazia = não gerar complicação.
 */
export function collectDeteriorationErrors(
  bedQuestions: Array<{ id: number; type: string; vignette: string; idealPrescription?: string }>,
  evaluations: Record<number, any>
): AdverseErrorContext[] {
  return bedQuestions
    .filter((q) => q.type !== 'multiple_choice')
    .filter((q) => evaluationTriggersDeterioration(evaluations[q.id]))
    .map((q) => buildAdverseErrorContext(q, evaluations[q.id]));
}
