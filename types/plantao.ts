/**
 * Types & Domain Constants for Plantão Batch Evaluation & State Machine
 * Requirements R1, R2, R3, R4
 */

export type PlantaoTestStatus =
  | 'in_progress'
  | 'awaiting_batch_bed_evaluation'
  | 'ready_for_adverse'
  | 'awaiting_batch_feedback'
  | 'completed';

export const PLANTAO_STATUSES: readonly PlantaoTestStatus[] = [
  'in_progress',
  'awaiting_batch_bed_evaluation',
  'ready_for_adverse',
  'awaiting_batch_feedback',
  'completed',
] as const;

export function isValidPlantaoStatus(val: unknown): val is PlantaoTestStatus {
  return typeof val === 'string' && PLANTAO_STATUSES.includes(val as PlantaoTestStatus);
}

export function isPendingBatchStatus(status?: string | null): boolean {
  return status === 'awaiting_batch_bed_evaluation' || status === 'awaiting_batch_feedback';
}

export interface PlantaoBedRecord {
  bedNumber: number;
  chapterId: number;
  chapterTitle?: string;
  patientWeight?: number;
  questionIds?: number[];
  bonusQuestionId?: number;
  hasAdverseEvolution?: boolean;
  outcome?: any;
  [key: string]: any;
}

export interface PlantaoMetadata {
  plantaoNumber?: number;
  bedCount?: number;
  beds?: PlantaoBedRecord[];
  adverseEvolutions?: number;
  hasAdverseEvolution?: boolean;
  algorithmVersion?: string;
  globalReadinessAtStart?: number;
  // Batch tracking fields
  batch_job_id?: string;
  batch_bed_eval_id?: string;
  batch_submitted_at?: string;
  batch_bed_eval_submitted_at?: string;
  feedbackBatchId?: string;
  feedback_batch_id?: string;
  feedback_batch_submitted_at?: string;
  evaluationMode?: 'batch' | 'realtime';
  feedbackEvaluationMode?: 'batch' | 'realtime';
  bedEvaluationCompletedAt?: string;
  feedbackCompletedAt?: string;
  batch_error?: string;
  status?: PlantaoTestStatus;
  [key: string]: any;
}

export interface PlantaoTestRecord {
  id: string;
  user_id: string;
  chapter_ids: number[];
  question_type: string;
  total_questions: number;
  score: number | null;
  questions: any[];
  answers: Record<string, any> | null;
  results: Record<string, any> | null;
  completed: boolean;
  draft_index: number;
  mode: 'standard' | 'plantao';
  status: PlantaoTestStatus;
  plantao_data: PlantaoMetadata | null;
  created_at: string;
  completed_at: string | null;
}

// API Payloads
export interface SubmitBedBatchRequest {
  testId: string;
  bedsData?: Array<{
    bedNumber: number;
    patientWeight?: number;
    chapterId?: number;
    chapterTitle?: string;
    mcqResults?: any[];
    prescriptionsPayload?: any[];
    prescriptions?: any[];
  }>;
  userAnswers?: Record<number, any>;
}

export interface SubmitFeedbackBatchRequest {
  testId: string;
  evaluationsSummary?: any[] | string;
  overallScore?: number;
}

export interface CheckBatchStatusRequest {
  testId?: string;
}

export interface CheckBatchStatusResponse {
  updated: boolean;
  status: PlantaoTestStatus;
  pending: boolean;
  results?: any;
  error?: string;
  hasAdverseEvolution?: boolean;
  adverseBedsCount?: number;
  score?: number;
  questions?: any[];
  testId?: string;
  processed?: number;
  tests?: Array<{ testId: string; updated: boolean; status: string }>;
}
