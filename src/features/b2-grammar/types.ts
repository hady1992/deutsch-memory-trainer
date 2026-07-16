export type B2GrammarLanguage = "de" | "ar";

export type B2GrammarExerciseType =
  | "multiple_choice"
  | "fill_blank"
  | "matching"
  | "sentence_order"
  | "sentence_build"
  | "verb_form"
  | "email_order"
  | "dialogue_choice"
  | "scenario_choice"
  | "guided_writing"
  | "guided_speaking";

export type B2GrammarDifficulty = "easy" | "medium" | "hard";
export type B2GrammarItemStatus = "unseen" | "known" | "review";
export type B2GrammarMode = "learn" | "practice" | "mistakes" | "mixed";

export interface B2GrammarTopicIndex {
  id: string;
  order: number;
  slug: string;
  title_de: string;
  title_ar: string;
  level: string;
  lessonPath: string;
  exercisesPath: string;
  exerciseCount: number;
  difficultyDistribution: Record<string, number>;
  typeDistribution: Record<string, number>;
  estimatedMinutes: number;
  sourceType: string;
  category: string;
}

export interface B2GrammarPhaseIndex {
  schemaVersion: string;
  contentVersion: string;
  courseId: string;
  phaseId: string;
  title_de: string;
  title_ar: string;
  level: string;
  topicCount: number;
  exerciseCount: number;
  topics: B2GrammarTopicIndex[];
}

export interface B2GrammarExample {
  de: string;
  ar: string;
  note_de?: string;
  note_ar?: string;
}

export interface B2GrammarRule {
  id: string;
  title_de: string;
  title_ar: string;
  explanation_de: string;
  explanation_ar: string;
  formula?: string;
  examples?: B2GrammarExample[];
}

export interface B2GrammarTable {
  id: string;
  title_de: string;
  title_ar: string;
  headers_de: string[];
  headers_ar?: string[];
  rows: string[][];
}

export interface B2GrammarCommonMistake {
  wrong: string;
  correct: string;
  explanation_de: string;
  explanation_ar: string;
}

export interface B2GrammarLesson {
  schemaVersion: string;
  topicId: string;
  slug: string;
  order: number;
  title_de: string;
  title_ar: string;
  level: string;
  sourceType: string;
  category: string;
  estimatedMinutes: number;
  learningObjectives_de: string[];
  learningObjectives_ar: string[];
  shortDescription_de: string;
  shortDescription_ar: string;
  explanation_de: string;
  explanation_ar: string;
  rules: B2GrammarRule[];
  tables: B2GrammarTable[];
  examples: B2GrammarExample[];
  commonMistakes: B2GrammarCommonMistake[];
  quickSummary_de: string[];
  quickSummary_ar: string[];
  relatedTopics: string[];
}

export interface B2GrammarExercise {
  id: string;
  topicId: string;
  type: B2GrammarExerciseType;
  difficulty: B2GrammarDifficulty;
  title_de: string;
  title_ar: string;
  prompt_de: string;
  prompt_ar: string;
  answer: string | Record<string, string> | { requiredConcepts?: string[] };
  explanation_de: string;
  explanation_ar: string;
  grammarFocus: string;
  options?: string[];
  acceptedAnswers?: string[];
  pairs?: Array<[string, string]>;
  tokens?: string[];
  requiredConcepts?: string[];
  evaluationMode?: string;
  infinitive?: string;
  person?: string;
}

export interface B2GrammarExerciseDocument {
  schemaVersion: string;
  topicId: string;
  title_de: string;
  title_ar: string;
  level: string;
  exerciseCount: number;
  supportedTypes: B2GrammarExerciseType[];
  exercises: B2GrammarExercise[];
}

export interface B2GrammarTopic {
  phaseId: string;
  index: B2GrammarTopicIndex;
  lesson: B2GrammarLesson;
  exercises: B2GrammarExercise[];
}

export interface B2GrammarCatalogTopic {
  phaseId: string;
  index: B2GrammarTopicIndex;
}

export interface B2GrammarCatalog {
  phases: B2GrammarPhaseIndex[];
  topics: B2GrammarCatalogTopic[];
  exerciseCount: number;
}

export interface B2GrammarCourse {
  phases: B2GrammarPhaseIndex[];
  topics: B2GrammarTopic[];
  exerciseCount: number;
}

export interface B2GrammarExerciseProgress {
  status: B2GrammarItemStatus;
  attempts: number;
  correctCount: number;
  wrongCount: number;
  consecutiveCorrect: number;
  unresolvedMistake: boolean;
  lastAnswer: string;
  lastReviewedAt: string;
  selfAssessment?: "completed" | "review";
}

export interface B2GrammarTopicProgress {
  lastExerciseId: string;
  lastPosition: number;
  lastVisitedAt: string;
}

export interface B2GrammarProgressStore {
  version: 1;
  lastTopicId: string;
  topics: Record<string, B2GrammarTopicProgress>;
  exercises: Record<string, B2GrammarExerciseProgress>;
}
