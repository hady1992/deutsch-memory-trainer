export const B2_EXERCISE_TYPES = [
  "multiple_choice",
  "fill_blank",
  "matching",
  "sentence_order",
  "sentence_build",
  "verb_form",
  "email_order",
  "dialogue_choice",
  "scenario_choice",
  "guided_writing",
  "guided_speaking",
] as const;

export type B2CourseExerciseType = (typeof B2_EXERCISE_TYPES)[number];
export type B2VocabularyFilter = "all" | "noun" | "verb" | "adjective" | "phrase";
export type B2SelfAssessment = "completed" | "needs_review";
export type B2VocabularyStatus = "known" | "review";
export type B2VocabularyTrainingMode = "study" | "review";

export interface B2CourseUnitSummary {
  unit: number;
  slug: string;
  title_de: string;
  title_ar: string;
  pages: [number, number];
  vocabularyFile: string;
  exercisesFile: string;
  vocabularyCount: number;
  exerciseCount: number;
  enabled?: boolean;
}

export interface B2CourseIndex {
  schemaVersion: "b2-course-index-v1";
  course: {
    id: "b2-kurs";
    title_de: string;
    title_ar: string;
    level: "B2";
    progressKey: "dmt_b2_course_progress_v1";
    contentVersion: string;
  };
  units: B2CourseUnitSummary[];
}

export interface B2CourseExample {
  de: string;
  ar: string;
}

export interface B2CourseVocabularyItem {
  courseItemId: string;
  identity: string;
  term: string;
  type: string;
  arabic: string;
  explanation_de: string;
  explanation_ar: string;
  examples: B2CourseExample[];
  grammar?: Record<string, unknown>;
  source: {
    unit: number;
    pages: number[];
    section: string;
  };
  tags?: string[];
  globalRef?: string | number | null;
  integrationStatus?: string;
}

export interface B2CourseReusedReference {
  courseItemId: string;
  term: string;
  pages?: number[];
  reason?: string;
}

export interface B2CourseVocabularyFile {
  schemaVersion: "b2-course-content-v1";
  course: {
    id: "b2-kurs";
    unit: number;
    unitTitle_de: string;
    unitTitle_ar: string;
    sourcePages?: number[];
    [key: string]: unknown;
  };
  reusedVocabularyRefs?: B2CourseReusedReference[];
  items: B2CourseVocabularyItem[];
  [key: string]: unknown;
}

export interface B2CourseOrderBlock {
  id: string;
  text: string;
}

export interface B2CourseExercise {
  id: string;
  unit: number;
  type: B2CourseExerciseType | string;
  title_de: string;
  title_ar: string;
  prompt_de: string;
  prompt_ar: string;
  answer: unknown;
  options?: string[];
  acceptedAnswers?: string[];
  completedSentence_de?: string;
  completedSentence_ar?: string;
  pairs?: Array<[string, string]>;
  tokens?: string[];
  blocks?: B2CourseOrderBlock[];
  vocabularyRefs?: string[];
  reusedVocabularyRefs?: string[];
  grammarFocus?: string;
  evaluationMode?: string;
  source?: string;
  bookTextCopied?: boolean;
  [key: string]: unknown;
}

export interface B2CourseExerciseFile {
  schemaVersion: "b2-course-exercises-v1";
  courseId: "b2-kurs";
  unit: number;
  unitTitle_de: string;
  unitTitle_ar: string;
  progressKeyProposal?: string;
  exercises: B2CourseExercise[];
  [key: string]: unknown;
}

export interface B2CourseUnitData {
  summary: B2CourseUnitSummary;
  vocabulary: B2CourseVocabularyFile;
  exercises: B2CourseExerciseFile;
}

export interface B2CourseItemProgress {
  correctCount: number;
  wrongCount: number;
  lastReviewedAt: string;
  difficult: boolean;
  mastered: boolean;
}

export interface B2CourseExerciseProgress {
  correctCount: number;
  wrongCount: number;
  attempts: number;
  completed: boolean;
  difficult: boolean;
  lastReviewedAt: string;
  lastAnswer: unknown;
  unitId: string;
  exerciseId: string;
  selfAssessment?: B2SelfAssessment;
}

export interface B2CourseResumeState {
  vocabularyIndex: number;
  exerciseIndex: number;
  lastMode: "unit" | "vocabulary" | "exercises";
  updatedAt: string;
  [key: string]: unknown;
}

export interface B2CourseUnitVocabularyProgress {
  statusByItemId: Record<string, B2VocabularyStatus>;
  nextItemId: string;
  lastViewedItemId: string;
  reviewCursorItemId: string;
  legacyMigrated: boolean;
  updatedAt: string;
  [key: string]: unknown;
}

export interface B2CourseProgressStore {
  version: 2;
  vocabulary: Record<string, B2CourseItemProgress>;
  vocabularyByUnit: Record<string, B2CourseUnitVocabularyProgress>;
  exercises: Record<string, B2CourseExerciseProgress>;
  favorites: string[];
  resume: Record<string, B2CourseResumeState>;
  updatedAt: string;
  [key: string]: unknown;
}

export interface B2CourseUnitStats {
  vocabularyTotal: number;
  reviewedVocabulary: number;
  masteredVocabulary: number;
  knownVocabulary: number;
  reviewVocabulary: number;
  unseenVocabulary: number;
  exerciseTotal: number;
  completedExercises: number;
  difficultItems: number;
  percent: number;
}
