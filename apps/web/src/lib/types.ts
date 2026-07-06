// Field-for-field mirrors of the API's candidate-facing responses (Phase 1–5
// controllers/views). Compile-checked by every consumer; no runtime code.

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'candidate';
}

export interface AuthResponse {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

export interface TrackItem {
  itemId: string;
  type: 'lesson' | 'reading' | 'quiz' | 'coding' | 'exercise';
  refId?: string;
  config: Record<string, unknown>;
}

export interface TrackDay {
  dayNumber: number;
  items: TrackItem[];
}

export interface TrackScoring {
  weights: Record<string, number>;
  passThreshold: number;
  categoryMinimums?: Record<string, number>;
}

export interface Track {
  _id: string;
  title: string;
  description?: string;
  durationDays: number;
  days: TrackDay[];
  scoring: TrackScoring;
  status: string;
}

export interface ItemProgress {
  itemId: string;
  status: string;
  score?: number | null;
  attempts: number;
  completedAt?: string;
}

export interface Enrollment {
  _id: string;
  userId: string;
  trackId: string;
  cohortId?: string;
  startDate: string;
  unlockedDay: number;
  itemProgress: ItemProgress[];
  status: 'active' | 'completed' | 'failed' | 'expired';
  version: number;
}

export interface DayState {
  dayNumber: number;
  unlocked: boolean;
  requiredComplete: number;
  requiredTotal: number;
  dateGateOpen: boolean;
}

export interface UnlockState {
  unlockedDay: number;
  days: DayState[];
}

export interface AttemptQuestion {
  questionId: string;
  prompt?: string;
  type?: 'mcq' | 'multi' | 'text' | 'likert';
  media?: unknown[];
  options?: string[];
  correct?: boolean;
  // Settled attempts only: the candidate's raw answer (presented indices) for review.
  answer?: unknown;
}

export interface QuizAttemptView {
  _id: string;
  quizItemId: string;
  status: 'in-progress' | 'submitted' | 'expired';
  startedAt: string;
  timeLimitSec: number;
  serverNow?: string;
  questions: AttemptQuestion[];
  score?: number;
  traitScores?: Record<string, number>;
  submittedAt?: string;
}

export interface SubmitQuizResult {
  attemptId: string;
  score?: number;
  traitScores?: Record<string, number>;
  correctCount: number;
  total: number;
  unlockState: UnlockState;
}

export interface SubmissionTestResult {
  caseIndex: number;
  status: string;
  // Explicit server discriminant — never inferred from stdout absence.
  hidden?: boolean;
  stdout?: string;
  time?: number;
  memory?: number;
}

export interface SubmissionView {
  _id: string;
  enrollmentId: string;
  itemId?: string;
  problemId: string;
  final: boolean;
  language: string;
  status: 'queued' | 'running' | 'passed' | 'failed' | 'error';
  score: number;
  createdAt?: string;
  testResults: SubmissionTestResult[];
}

export interface CandidateProblemView {
  id: string;
  title: string;
  statement: string;
  difficulty: number;
  categoryId: string;
  languages: string[];
  starterCode: Record<string, string>;
  visibleTestCases: Array<{ input: string; expectedOutput: string }>;
  limits: { cpuTimeSec: number; memoryKb: number; wallTimeSec: number };
}

export interface CapstoneStatus {
  available: boolean;
  quiz?: { config: Record<string, unknown>; attempted: boolean; score?: number };
  coding?: Array<{ problemId: string; settled: boolean; bestScore?: number }>;
}

export interface AssessmentResult {
  enrollmentId: string;
  breakdown: Record<string, number>;
  personalityProfile?: Record<string, number>;
  weightedTotal: number;
  verdict: 'pass' | 'fail';
  generatedAt: string;
}

export interface Lesson {
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
}

export interface MaterialView {
  _id: string;
  title: string;
  body: string;
}
