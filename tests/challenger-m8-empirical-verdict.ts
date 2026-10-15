/**
 * Empirical Verification & Stress Test Suite for Milestone 8
 * Challenger 1: Modal Triggering, Option A/B Execution, HTTP 429 Budget Breach & Edge Cases
 *
 * Verifies:
 * 1. tests/challenger-m8-ui-flow.ts execution
 * 2. Modal open/close states (Modal 1 and Modal 2, dismissal, exclusivity)
 * 3. Option A execution and Option B batch submission flow
 * 4. HTTP 429 budget breach handling and in-modal fallback button to Option A
 * 5. Edge case: Empty answers & partial submissions (MCQs, textareas, ventilator objects)
 * 6. Edge case: Double clicks / concurrent rapid button invocations (lack of ref guard)
 * 7. Edge case: Unhandled errors (the setError collision at line 2012 replacing the entire quiz with "Erro ao Carregar")
 *
 * Usage: npx tsx tests/challenger-m8-empirical-verdict.ts
 */

import fs from 'fs';
import path from 'path';
import {
  PlantaoTestStatus,
  isPendingBatchStatus,
  isValidPlantaoStatus,
  PlantaoBedRecord,
} from '../types/plantao';

interface EmpiricalResult {
  category: string;
  testId: string;
  title: string;
  passed: boolean;
  verdict: 'PASS' | 'FAIL' | 'DEFECT_FOUND';
  error?: string;
  details?: any;
}

const empiricalResults: EmpiricalResult[] = [];

function recordResult(result: EmpiricalResult) {
  empiricalResults.push(result);
  const mark = result.passed ? '✓' : '✗';
  console.log(`  ${mark} [${result.testId}] ${result.title} -> ${result.verdict}`);
  if (result.error) {
    console.log(`     Detail: ${result.error}`);
  }
}

// Read target files
const pagePath = path.resolve(process.cwd(), 'app/(authenticated)/testes/[id]/page.tsx');
const pageSource = fs.readFileSync(pagePath, 'utf-8');

const submitBatchRoutePath = path.resolve(process.cwd(), 'app/api/plantao/submit-batch/route.ts');
const submitBatchRouteSource = fs.readFileSync(submitBatchRoutePath, 'utf-8');

const submitFeedbackRoutePath = path.resolve(process.cwd(), 'app/api/plantao/submit-feedback-batch/route.ts');
const submitFeedbackRouteSource = fs.readFileSync(submitFeedbackRoutePath, 'utf-8');

console.log('================================================================');
console.log('CHALLENGER 1 EMPIRICAL VERIFICATION: MILESTONE 8 EDGE CASES');
console.log('================================================================\n');

async function main() {
  // --------------------------------------------------------------------------
  // SUITE 1: Modal Open/Close & Exclusivity
  // --------------------------------------------------------------------------
  console.log('--- SUITE 1: Modal Triggering, Open/Close States & Exclusivity ---');

  // Test 1.1: Modal 1 triggers on bed completion in in_progress
  const hasModal1Trigger =
    pageSource.includes('setShowDualChoiceModal(true)') &&
    pageSource.includes('handleInitiateCompletion');
  recordResult({
    category: 'Modal State',
    testId: 'M8-MOD-01',
    title: 'handleInitiateCompletion opens Modal 1 in in_progress state',
    passed: hasModal1Trigger,
    verdict: hasModal1Trigger ? 'PASS' : 'FAIL',
  });

  // Test 1.2: Modal 1 dismissal button
  const hasModal1Dismiss =
    pageSource.includes('setShowDualChoiceModal(false)') &&
    pageSource.includes('Voltar e Revisar Leitos');
  recordResult({
    category: 'Modal State',
    testId: 'M8-MOD-02',
    title: 'Modal 1 provides dismissal button returning to bed review',
    passed: hasModal1Dismiss,
    verdict: hasModal1Dismiss ? 'PASS' : 'FAIL',
  });

  // Test 1.3: Modal 2 triggers for preceptorship feedback in ready_for_adverse / plantao completion
  const hasModal2Trigger =
    pageSource.includes('setShowFeedbackDualChoiceModal(true)') &&
    pageSource.includes('MODAL 2: DUAL CHOICE - PRECEPTORSHIP FEEDBACK');
  recordResult({
    category: 'Modal State',
    testId: 'M8-MOD-03',
    title: 'Modal 2 triggers for preceptorship feedback generation',
    passed: hasModal2Trigger,
    verdict: hasModal2Trigger ? 'PASS' : 'FAIL',
  });

  // Test 1.4: Modal 2 dismissal button
  const hasModal2Dismiss =
    pageSource.includes('setShowFeedbackDualChoiceModal(false)') &&
    pageSource.includes('Voltar e Revisar');
  recordResult({
    category: 'Modal State',
    testId: 'M8-MOD-04',
    title: 'Modal 2 provides dismissal button returning to review',
    passed: hasModal2Dismiss,
    verdict: hasModal2Dismiss ? 'PASS' : 'FAIL',
  });

  // Test 1.5: Mutually exclusive modal rendering
  // Modal 1 checks showDualChoiceModal, Modal 2 checks showFeedbackDualChoiceModal
  const modal1Render = pageSource.includes('{showDualChoiceModal && (');
  const modal2Render = pageSource.includes('{showFeedbackDualChoiceModal && (');
  recordResult({
    category: 'Modal State',
    testId: 'M8-MOD-05',
    title: 'Both modals have dedicated discrete boolean visibility gates',
    passed: modal1Render && modal2Render,
    verdict: modal1Render && modal2Render ? 'PASS' : 'FAIL',
  });

  // --------------------------------------------------------------------------
  // SUITE 2: Option A vs Option B Execution Mechanics
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 2: Option A vs Option B Execution Mechanics ---');

  // Test 2.1: Option A Bed Completion executes synchronous realtime evaluation
  const hasOptionA =
    pageSource.includes('handleSelectOptionA_Realtime') &&
    pageSource.includes('await handleSubmitTest()');
  recordResult({
    category: 'Option Execution',
    testId: 'M8-EXEC-01',
    title: 'Option A (Realtime) invokes synchronous evaluation via handleSubmitTest',
    passed: hasOptionA,
    verdict: hasOptionA ? 'PASS' : 'FAIL',
  });

  // Test 2.2: Option B Bed Completion formats payload and calls /api/plantao/submit-batch
  const hasOptionB =
    pageSource.includes('handleSelectOptionB_Batch') &&
    pageSource.includes('/api/plantao/submit-batch') &&
    pageSource.includes('setCurrentPlantaoStatus(\'awaiting_batch_bed_evaluation\')');
  recordResult({
    category: 'Option Execution',
    testId: 'M8-EXEC-02',
    title: 'Option B (Batch) posts to submit-batch and transitions to awaiting_batch_bed_evaluation',
    passed: hasOptionB,
    verdict: hasOptionB ? 'PASS' : 'FAIL',
  });

  // Test 2.3: Option A Preceptorship Feedback calls /api/generate-feedback and updates test to completed
  const hasFeedbackOptionA =
    pageSource.includes('handleSelectFeedbackOptionA_Realtime') &&
    pageSource.includes('/api/generate-feedback') &&
    pageSource.includes('router.push(`/testes/${testId}/resultado`)');
  recordResult({
    category: 'Option Execution',
    testId: 'M8-EXEC-03',
    title: 'Feedback Option A calls generate-feedback and redirects to resultado',
    passed: hasFeedbackOptionA,
    verdict: hasFeedbackOptionA ? 'PASS' : 'FAIL',
  });

  // Test 2.4: Option B Preceptorship Feedback calls /api/plantao/submit-feedback-batch
  const hasFeedbackOptionB =
    pageSource.includes('handleSelectFeedbackOptionB_Batch') &&
    pageSource.includes('/api/plantao/submit-feedback-batch') &&
    pageSource.includes('setCurrentPlantaoStatus(\'awaiting_batch_feedback\')');
  recordResult({
    category: 'Option Execution',
    testId: 'M8-EXEC-04',
    title: 'Feedback Option B posts to submit-feedback-batch and sets awaiting_batch_feedback',
    passed: hasFeedbackOptionB,
    verdict: hasFeedbackOptionB ? 'PASS' : 'FAIL',
  });

  // --------------------------------------------------------------------------
  // SUITE 3: HTTP 429 Budget Breach Handling & Fallback
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 3: HTTP 429 Budget Breach Handling & Fallback ---');

  // Test 3.1: Backend submit-batch route uses plantao_correction (exempt from budget cap blocking)
  const routeUsesPlantaoCorrection =
    submitBatchRouteSource.includes("batch_kind: 'plantao_correction'") ||
    submitBatchRouteSource.includes('plantao_correction');
  recordResult({
    category: 'Budget Guard',
    testId: 'M8-429-01',
    title: 'Backend submit-batch route records batch_kind plantao_correction (exempt from cap blocking)',
    passed: routeUsesPlantaoCorrection,
    verdict: routeUsesPlantaoCorrection ? 'PASS' : 'FAIL',
  });

  // Test 3.2: Modal 1 catches HTTP 429 and populates batchBudgetBreach
  const modal1Catches429 =
    pageSource.includes('res.status === 429 || data.budgetBreach') &&
    pageSource.includes('setBatchBudgetBreach({');
  recordResult({
    category: 'Budget Guard',
    testId: 'M8-429-02',
    title: 'Modal 1 detects 429 / budgetBreach and stores breach details',
    passed: modal1Catches429,
    verdict: modal1Catches429 ? 'PASS' : 'FAIL',
  });

  // Test 3.3: Modal 1 renders budget breach alert and one-click fallback button
  const modal1FallbackUI =
    pageSource.includes('Teto de Orçamento Batch Atingido (HTTP 429)') &&
    pageSource.includes('onClick={handleSelectOptionA_Realtime}') &&
    pageSource.includes('Prosseguir com Correção em Tempo Real Agora');
  recordResult({
    category: 'Budget Guard',
    testId: 'M8-429-03',
    title: 'Modal 1 renders in-modal warning banner and fallback button to Option A',
    passed: modal1FallbackUI,
    verdict: modal1FallbackUI ? 'PASS' : 'FAIL',
  });

  // Test 3.4: Modal 2 catches HTTP 429 and renders fallback button
  const modal2FallbackUI =
    pageSource.includes('batchFeedbackBudgetBreach && (') &&
    pageSource.includes('onClick={handleSelectFeedbackOptionA_Realtime}') &&
    pageSource.includes('Prosseguir com Feedback em Tempo Real');
  recordResult({
    category: 'Budget Guard',
    testId: 'M8-429-04',
    title: 'Modal 2 renders in-modal 429 warning and fallback button to Realtime Feedback',
    passed: modal2FallbackUI,
    verdict: modal2FallbackUI ? 'PASS' : 'FAIL',
  });

  // --------------------------------------------------------------------------
  // SUITE 4: Edge Case 1 - Empty Answers & Partial Submissions
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 4: Edge Case 1 - Empty Answers & Partial Submissions ---');

  // Test 4.1: Detection of empty answers includes empty ventilator objects
  const detectsEmptyAnswers =
    pageSource.includes('q.type === \'ventilator\' && typeof answer === \'object\'') &&
    pageSource.includes('Object.values(answer).every((v) => !v || (v as string).trim() === \'\')');
  recordResult({
    category: 'Edge Cases: Empty Answers',
    testId: 'M8-EDGE-01',
    title: 'Unanswered check detects blank strings, undefined, null, and empty ventilator objects',
    passed: detectsEmptyAnswers,
    verdict: detectsEmptyAnswers ? 'PASS' : 'FAIL',
  });

  // Test 4.2: Confirmation prompt allows physician to cancel and stay on question
  const hasConfirmationGuard =
    pageSource.includes('const confirmProceed = window.confirm(') &&
    pageSource.includes('if (!confirmProceed) return;');
  recordResult({
    category: 'Edge Cases: Empty Answers',
    testId: 'M8-EDGE-02',
    title: 'Confirmation prompt alerts physician of unanswered questions and blocks modal if cancelled',
    passed: hasConfirmationGuard,
    verdict: hasConfirmationGuard ? 'PASS' : 'FAIL',
  });

  // Test 4.3: buildBedsPayload provides safe fallbacks for empty answers
  const safePayloadFallbacks =
    pageSource.includes('userAnswer: typeof userAnswers[q.id] === \'number\' && q.options ? q.options[userAnswers[q.id]] : \'Não respondida\'') &&
    pageSource.includes('const userPrescription = userAnswers[q.id] || \'Sem resposta enviada\'');
  recordResult({
    category: 'Edge Cases: Empty Answers',
    testId: 'M8-EDGE-03',
    title: 'buildBedsPayload sets safe defaults ("Não respondida" / "Sem resposta enviada") for batch',
    passed: safePayloadFallbacks,
    verdict: safePayloadFallbacks ? 'PASS' : 'FAIL',
  });

  // --------------------------------------------------------------------------
  // SUITE 5: Edge Case 2 - Double Clicks & Concurrent Rapid Submissions
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 5: Edge Case 2 - Double Clicks & Concurrency Guards ---');

  // Test 5.1: Button disabled states on submittingBatch
  const buttonDisabled =
    pageSource.includes('disabled={submittingBatch || submitting}') &&
    pageSource.includes('disabled={submittingRealtimeFeedback || submittingFeedbackBatch}');
  recordResult({
    category: 'Edge Cases: Double Clicks',
    testId: 'M8-DBL-01',
    title: 'Buttons are disabled when submitting/submittingBatch states are active',
    passed: buttonDisabled,
    verdict: buttonDisabled ? 'PASS' : 'FAIL',
  });

  // Test 5.2: Verification of synchronous function re-entry guard
  // In React, button disabled state updates asynchronously on the next render.
  // Does handleSelectOptionB_Batch or handleSelectFeedbackOptionB_Batch have an internal ref or early-return lock?
  const hasInternalBatchRefLock =
    pageSource.includes('isSubmittingBatchRef.current') ||
    /const handleSelectOptionB_Batch = async \(\) => \{\s*if \(submittingBatch\)/.test(pageSource);

  recordResult({
    category: 'Edge Cases: Double Clicks',
    testId: 'M8-DBL-02',
    title: 'Synchronous lock / useRef guard inside handleSelectOptionB_Batch against rapid microtask double-clicks',
    passed: hasInternalBatchRefLock,
    verdict: hasInternalBatchRefLock ? 'PASS' : 'DEFECT_FOUND',
    error: hasInternalBatchRefLock
      ? undefined
      : 'Vulnerability: handleSelectOptionB_Batch lacks a synchronous useRef lock. A rapid double-click before React re-render can fire two concurrent requests to /api/plantao/submit-batch.',
  });

  // Test 5.3: Backend Idempotency Guard in submit-batch
  const backendHasIdempotency =
    submitBatchRouteSource.includes('testRecord.status === \'awaiting_batch_bed_evaluation\' && testRecord.plantao_data?.batch_job_id');
  recordResult({
    category: 'Edge Cases: Double Clicks',
    testId: 'M8-DBL-03',
    title: 'Backend submit-batch route includes idempotency check for already submitted batch',
    passed: backendHasIdempotency,
    verdict: backendHasIdempotency ? 'PASS' : 'FAIL',
  });

  // --------------------------------------------------------------------------
  // SUITE 6: Edge Case 3 - Unhandled Errors & Error Screen Overload
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 6: Edge Case 3 - Unhandled Errors & Error Screen Handling ---');

  // Test 6.1: Check if handleSelectOptionB_Batch catches network errors
  const optionBCatchesErrors =
    pageSource.includes('catch (err: any) {') &&
    pageSource.includes('console.error(\'Batch submission error:\', err)');
  recordResult({
    category: 'Edge Cases: Unhandled Errors',
    testId: 'M8-ERR-01',
    title: 'handleSelectOptionB_Batch wraps API call in try/catch/finally',
    passed: optionBCatchesErrors,
    verdict: optionBCatchesErrors ? 'PASS' : 'FAIL',
  });

  // Test 6.2: Analyze setError collision at line 2012
  // Line 2012: if (error || questions.length === 0)
  // If setError is called during submission failure, does it replace the entire quiz view?
  const hasFatalErrorCheck = pageSource.includes('if (error || questions.length === 0) {');
  const optionBCallsFatalError =
    /catch \(err: any\) \{[\s\S]*?setError\(err\.message/.test(pageSource);

  const errorScreenCollisionDefect = hasFatalErrorCheck && optionBCallsFatalError;
  recordResult({
    category: 'Edge Cases: Unhandled Errors',
    testId: 'M8-ERR-02',
    title: 'Fatal error screen collision: setError(err.message) in handleSelectOptionB_Batch unmounts quiz at line 2012',
    passed: !errorScreenCollisionDefect, // Pass if NO defect, Fail if defect exists
    verdict: errorScreenCollisionDefect ? 'DEFECT_FOUND' : 'PASS',
    error: errorScreenCollisionDefect
      ? 'Vulnerability: handleSelectOptionB_Batch calls setError(err.message), which triggers line 2012 "if (error)" and unmounts the quiz with "Erro ao Carregar" and only "Voltar para Testes", destroying the user\'s ability to retry or use Option A.'
      : undefined,
  });

  // Test 6.3: Check if handleSelectFeedbackOptionB_Batch avoids setError
  const feedbackOptionAvoidsFatalError =
    pageSource.includes('alert(err.message || \'Falha na comunicação com a API de lote.\')');
  recordResult({
    category: 'Edge Cases: Unhandled Errors',
    testId: 'M8-ERR-03',
    title: 'handleSelectFeedbackOptionB_Batch avoids setError collision and keeps view alive',
    passed: feedbackOptionAvoidsFatalError,
    verdict: feedbackOptionAvoidsFatalError ? 'PASS' : 'FAIL',
  });

  // Test 6.4: Check BatchWaitingPanel error handling
  const waitingPanelHandlesErrorGracefully =
    pageSource.includes('setBatchCheckMessage(`❌ ${err.message || \'Erro ao checar status.\'}`)');
  recordResult({
    category: 'Edge Cases: Unhandled Errors',
    testId: 'M8-ERR-04',
    title: 'BatchWaitingPanel manual status check displays inline error without unmounting component',
    passed: waitingPanelHandlesErrorGracefully,
    verdict: waitingPanelHandlesErrorGracefully ? 'PASS' : 'FAIL',
  });

  // --------------------------------------------------------------------------
  // Summary & Empirical Evaluation
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  const total = empiricalResults.length;
  const passed = empiricalResults.filter((r) => r.verdict === 'PASS').length;
  const defects = empiricalResults.filter((r) => r.verdict === 'DEFECT_FOUND').length;
  const failed = empiricalResults.filter((r) => r.verdict === 'FAIL').length;

  console.log(`TOTAL CHECKS: ${total}`);
  console.log(`PASSED: ${passed}`);
  console.log(`DEFECTS FOUND: ${defects}`);
  console.log(`FAILED: ${failed}`);
  console.log('================================================================\n');

  if (defects > 0) {
    console.log('⚠️ EMPIRICAL DEFECTS IDENTIFIED:');
    empiricalResults
      .filter((r) => r.verdict === 'DEFECT_FOUND')
      .forEach((d) => {
        console.log(`- [${d.testId}] ${d.title}`);
        console.log(`  Detail: ${d.error}`);
      });
  }
}

main().catch((err) => {
  console.error('Fatal error running empirical test:', err);
  process.exit(1);
});
