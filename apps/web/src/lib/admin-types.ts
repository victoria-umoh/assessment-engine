// Field-for-field mirrors of the API's admin-facing responses (Phase 6
// controllers/views). Compile-checked by every consumer; no runtime code.

import type { AssessmentResult, Enrollment, ItemProgress, Track } from './types';

export interface AdminQuestion {
  _id: string;
  type: 'mcq' | 'multi' | 'text' | 'likert';
  categoryId: string;
  difficulty: number;
  prompt: string;
  options?: string[];
  correct?: number[] | string[];
  traitMapping?: { dimension: string; direction: 1 | -1 };
  explanation?: string;
  tags: string[];
  materialId?: string;
  source: 'seed' | 'admin' | 'generated';
  status: 'active' | 'archived';
}

export interface Category {
  _id: string;
  key: string;
  name: string;
  description?: string;
  scoringMode: 'correctness' | 'profile';
  traitDimensions?: string[];
}

export interface AdminLesson {
  _id: string;
  title: string;
  contentBlocks: Array<{
    type: 'markdown' | 'video' | 'image';
    markdown?: string;
    url?: string;
    caption?: string;
  }>;
  estMinutes: number;
  tags: string[];
  status: 'active' | 'archived';
}

export interface AdminCodingProblem {
  _id: string;
  title: string;
  statement: string;
  difficulty: number;
  categoryId: string;
  languages: string[];
  starterCode: Record<string, string>;
  testCases: Array<{ input: string; expectedOutput: string; hidden: boolean; weight: number }>;
  limits: { cpuTimeSec: number; memoryKb: number; wallTimeSec: number };
  status: 'active' | 'archived';
}

export interface AdminMaterialRow {
  _id: string;
  title: string;
  source: 'upload' | 'generated' | 'authored';
  status: 'processing' | 'ready' | 'failed';
  archived: boolean;
  linkedQuestionCount: number;
}

export interface AdminMaterialDetail {
  _id: string;
  title: string;
  source: 'upload' | 'generated' | 'authored';
  status: 'processing' | 'ready' | 'failed';
  failureReason?: string;
  archived: boolean;
  file?: { originalName: string; mimeType: string; size: number };
  content?: string;
  extractedText?: string;
  generationMeta?: { prompt: string; model: string; generatedAt: string };
  linkedQuestionIds: string[];
}

// Admin tracks carry finalAssessment (candidate reads project it out).
export interface AdminTrack extends Track {
  finalAssessment?: {
    quizConfig?: Record<string, unknown>;
    codingProblemIds?: string[];
  };
  updatedAt?: string;
}

export interface AdminCohort {
  _id: string;
  trackId: string;
  name: string;
  startDate: string;
  endDate?: string;
  capacity?: number;
  inviteCode?: string;
  pacingOverrides?: { unlockMode?: 'hybrid' | 'progress-only' | 'day-only' };
  status: 'scheduled' | 'active' | 'completed' | 'archived';
}

export interface AdminUser {
  _id: string;
  email: string;
  name: string;
  role: 'admin' | 'candidate';
  status: 'active' | 'disabled';
  createdAt?: string;
}

export interface AuditEntry {
  _id: string;
  actorId: string;
  action: string;
  entity: string;
  entityId?: string;
  diff?: unknown;
  at: string;
}

export interface AnalyticsOverview {
  users: { total: number; admins: number; candidates: number; disabled: number };
  tracks: { published: number; draft: number };
  cohorts: { scheduled: number; active: number };
  enrollments: { active: number; completed: number; failed: number };
  submissions: { queued: number; running: number };
}

export interface CohortCandidateRow {
  enrollmentId: string;
  userId: string;
  email?: string;
  name?: string;
  status: string;
  unlockedDay: number;
  requiredComplete: number;
  requiredTotal: number;
  weightedTotal?: number;
  verdict?: 'pass' | 'fail';
}

export interface CohortDashboard {
  cohort: {
    _id: string;
    name: string;
    trackId: string;
    trackTitle?: string;
    startDate: string;
    status: string;
    capacity?: number;
    inviteCode?: string;
  };
  stats: {
    enrolled: number;
    byStatus: Record<string, number>;
    verdicts: { pass: number; fail: number; pending: number };
    avgWeightedTotal: number | null;
  };
  candidates: CohortCandidateRow[];
}

export interface EnrollmentDetail {
  enrollment: Enrollment & { itemProgress: ItemProgress[] };
  user: { _id: string; email: string; name: string } | null;
  track: { _id: string; title: string; durationDays: number } | null;
  attempts: Array<{
    _id: string;
    quizItemId: string;
    status: string;
    score?: number;
    traitScores?: Record<string, number>;
    startedAt: string;
    submittedAt?: string;
  }>;
  submissions: Array<{
    _id: string;
    problemId: string;
    itemId?: string;
    final: boolean;
    status: string;
    score: number;
    createdAt?: string;
  }>;
  result: AssessmentResult | null;
}

export interface QuestionStat {
  questionId: string;
  prompt?: string;
  served: number;
  correctRate: number;
}
