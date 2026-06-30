export type TenseKey =
  | "praesens"
  | "praeteritum"
  | "perfekt"
  | "plusquamperfekt"
  | "futur1"
  | "futur2";

export interface LocalizedExample {
  de?: string;
  ar?: string;
}

export interface VerbCategory {
  id: string;
  title_ar: string;
  title_de: string;
  description_ar?: string;
  description_de?: string;
  count?: number;
  enabled?: boolean;
  filterField?: string;
  trainingModes?: string[];
  exampleBank?: Array<LocalizedExample & {
    answer?: string;
    note_ar?: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export interface VerbPracticeExample {
  id?: string;
  type?: string;
  de?: string;
  ar?: string;
  question_ar?: string;
  question_de?: string;
  answer?: string;
  answer_ar?: string | string[];
  answer_de?: string;
  answerCategoryIds?: string[];
  options?: string[];
  example?: string;
  example_de?: string;
  example_ar?: string;
  exampleAr?: string;
  note_ar?: string;
  hint_ar?: string;
  explanation_ar?: string;
  title_ar?: string;
  tense?: TenseKey;
  needsReview?: boolean;
  [key: string]: unknown;
}

export interface VerbExpandedExamples {
  version?: string;
  generated?: boolean;
  needsReview?: boolean;
  source?: string;
  note_ar?: string;
  studyExamples?: VerbPracticeExample[];
  tenseUsageExamples?: VerbPracticeExample[];
  formExamples?: VerbPracticeExample[];
  categoryPracticeExamples?: VerbPracticeExample[];
  [key: string]: unknown;
}

export interface VerbCategoryTraining {
  expandedPracticeExamples?: VerbPracticeExample[];
  [key: string]: unknown;
}

export type TenseExamples = Partial<Record<TenseKey, LocalizedExample>>;

export type VerbTenses = Partial<Record<TenseKey, Record<string, string>>>;

export interface DataMeta {
  generated?: boolean;
  needsReview?: boolean;
  source?: string;
  confidence?: number;
  [key: string]: unknown;
}

export interface Verb {
  id: number;
  infinitiv: string;
  arabic: string;
  praesens: string;
  praeteritum: string;
  perfekt: string;
  participle2?: string;
  example_de?: string;
  example_ar?: string;
  level: string;
  type: string;
  isCustom?: boolean;
  tenses?: VerbTenses;
  auxiliary?: "" | "haben" | "sein" | "haben/sein";
  separable?: boolean;
  prefix?: string;
  tags?: string[];
  notes_ar?: string;
  dataMeta?: DataMeta;
  tenseExamples?: TenseExamples;
  tensesMeta?: DataMeta;
  grammarTags?: string[];
  categoryIds?: string[];
  casePattern?: unknown;
  prepositions?: unknown[];
  verbCategoryTraining?: VerbCategoryTraining;
  categoryMeta?: DataMeta;
  expandedExamples?: VerbExpandedExamples;
  exampleMeta?: DataMeta;
}

export interface Vocabulary {
  id: number | string;
  chapter?: number;
  chapterTitle?: string;
  section?: string;
  term?: string;
  phrase?: string;
  arabic: string;
  type: string;
  level: string;
  example_de?: string;
  example_ar?: string;
  isCustom?: boolean;
  article?: "" | "der" | "die" | "das";
  gender?: "" | "maskulin" | "feminin" | "neutral";
  plural?: string;
  cleanTerm?: string;
  synonyms?: string[];
  tags?: string[];
  notes_ar?: string;
  vocabMeta?: DataMeta;
  examples?: Array<LocalizedExample & {
    type?: string;
    source?: string;
    [key: string]: unknown;
  }>;
  rawTerm?: string;
  originalType?: string;
  dataMeta?: DataMeta & {
    family?: "noun" | "adjective" | "phrase" | "other" | string;
    [key: string]: unknown;
  };
  sourceId?: number;
  needsReview?: boolean;
  trainArticle?: boolean;
  trainPlural?: boolean;
  singular?: string;
  pluralTerm?: string;
  pluralRaw?: string;
  articleTraining?: Record<string, any>;
  pluralTraining?: Record<string, any>;
  meaningTraining?: Record<string, any>;
  adjectiveTraining?: Record<string, any>;
  phraseTraining?: Record<string, any>;
  gapExample?: Record<string, any>;
  gapExamples?: Record<string, any>[];
  generalVocabularyTraining?: Record<string, any>;
  comparative?: string;
  superlative?: string;
  opposite?: string;
  valency?: string;
  usage_ar?: string;
}

export interface ProgressItem {
  itemKey: string; // e.g. "verb-1" or "vocab-1"
  correctCount: number;
  wrongCount: number;
  lastReviewedAt: string; // ISO string
  nextReviewAt: string; // ISO string
  difficulty: "new" | "easy" | "medium" | "difficult";
  mastered: boolean;
}

export interface LastSessionResult {
  mode: "verbs" | "vocab";
  date: string;
  totalQuestions: number;
  correctCount: number;
  wrongCount: number;
}

export interface UserSettings {
  speechSpeed: "slow" | "normal" | "fast";
  dailyGoal: number; // e.g. 10 items
  questionsPerSession: number; // e.g. 10, 20, 30
  showArabicImmediately: boolean;
  autoPlayPronunciation: boolean;
  language?: "de" | "ar";
}
