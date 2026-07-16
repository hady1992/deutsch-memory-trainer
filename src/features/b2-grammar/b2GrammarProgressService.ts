import {
  B2GrammarExerciseProgress,
  B2GrammarItemStatus,
  B2GrammarProgressStore,
} from "./types";

export const B2_GRAMMAR_PROGRESS_KEY = "dmt_b2_grammar_progress_v1";

const EMPTY_STORE: B2GrammarProgressStore = {
  version: 1,
  lastTopicId: "",
  topics: {},
  exercises: {},
};

function cloneEmpty(): B2GrammarProgressStore {
  return { ...EMPTY_STORE, topics: {}, exercises: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isValidB2GrammarProgress(value: unknown): value is B2GrammarProgressStore {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.topics) || !isRecord(value.exercises)) return false;
  return Object.values(value.exercises).every((entry) => {
    if (!isRecord(entry)) return false;
    return ["unseen", "known", "review"].includes(String(entry.status))
      && Number.isFinite(entry.attempts)
      && Number.isFinite(entry.correctCount)
      && Number.isFinite(entry.wrongCount)
      && Number.isFinite(entry.consecutiveCorrect)
      && typeof entry.unresolvedMistake === "boolean";
  });
}

function read(): B2GrammarProgressStore {
  const raw = localStorage.getItem(B2_GRAMMAR_PROGRESS_KEY);
  if (!raw) return cloneEmpty();
  try {
    const parsed = JSON.parse(raw);
    if (isValidB2GrammarProgress(parsed)) return parsed;
    console.warn("Ignoring invalid B2 grammar progress data.");
  } catch (error) {
    console.warn("Ignoring unreadable B2 grammar progress data.", error instanceof Error ? error.message : String(error));
  }
  return cloneEmpty();
}

function write(store: B2GrammarProgressStore): void {
  localStorage.setItem(B2_GRAMMAR_PROGRESS_KEY, JSON.stringify(store));
}

function emptyExercise(status: B2GrammarItemStatus = "unseen"): B2GrammarExerciseProgress {
  return {
    status,
    attempts: 0,
    correctCount: 0,
    wrongCount: 0,
    consecutiveCorrect: 0,
    unresolvedMistake: false,
    lastAnswer: "",
    lastReviewedAt: "",
  };
}

export const B2GrammarProgressService = {
  getProgress(): B2GrammarProgressStore {
    return read();
  },

  getBackupData(): B2GrammarProgressStore {
    return read();
  },

  validateBackup(value: unknown): value is B2GrammarProgressStore {
    return isValidB2GrammarProgress(value);
  },

  importBackup(value: unknown): boolean {
    if (!isValidB2GrammarProgress(value)) return false;
    write(value);
    return true;
  },

  visit(topicId: string, exerciseId: string, position: number): void {
    const store = read();
    store.lastTopicId = topicId;
    store.topics[topicId] = {
      lastExerciseId: exerciseId,
      lastPosition: Math.max(0, position),
      lastVisitedAt: new Date().toISOString(),
    };
    write(store);
  },

  recordAnswer(topicId: string, exerciseId: string, answer: string, correct: boolean): B2GrammarExerciseProgress {
    const store = read();
    const previous = store.exercises[exerciseId] || emptyExercise();
    const consecutiveCorrect = correct ? previous.consecutiveCorrect + 1 : 0;
    const unresolvedMistake = correct ? previous.unresolvedMistake && consecutiveCorrect < 2 : true;
    const next: B2GrammarExerciseProgress = {
      ...previous,
      status: unresolvedMistake ? "review" : correct ? "known" : "review",
      attempts: previous.attempts + 1,
      correctCount: previous.correctCount + (correct ? 1 : 0),
      wrongCount: previous.wrongCount + (correct ? 0 : 1),
      consecutiveCorrect,
      unresolvedMistake,
      lastAnswer: answer,
      lastReviewedAt: new Date().toISOString(),
      selfAssessment: undefined,
    };
    store.lastTopicId = topicId;
    store.exercises[exerciseId] = next;
    write(store);
    return next;
  },

  recordSelfAssessment(topicId: string, exerciseId: string, answer: string, assessment: "completed" | "review"): void {
    const store = read();
    const previous = store.exercises[exerciseId] || emptyExercise();
    const needsReview = assessment === "review";
    store.lastTopicId = topicId;
    store.exercises[exerciseId] = {
      ...previous,
      status: needsReview ? "review" : "known",
      attempts: previous.attempts + 1,
      consecutiveCorrect: 0,
      unresolvedMistake: needsReview,
      lastAnswer: answer,
      lastReviewedAt: new Date().toISOString(),
      selfAssessment: assessment,
    };
    write(store);
  },

  getTopicStats(topicId: string, exerciseIds: string[]): { completed: number; review: number; percent: number; started: boolean } {
    const store = read();
    const entries = exerciseIds.map((id) => store.exercises[id]).filter(Boolean);
    const completed = entries.filter((entry) => entry.status === "known").length;
    const review = entries.filter((entry) => entry.unresolvedMistake || entry.status === "review").length;
    return {
      completed,
      review,
      percent: exerciseIds.length ? Math.round((completed / exerciseIds.length) * 100) : 0,
      started: Boolean(store.topics[topicId]) || entries.length > 0,
    };
  },

  getResumePosition(topicId: string, exerciseIds: string[]): number {
    const topic = read().topics[topicId];
    if (!topic) return 0;
    const byId = exerciseIds.indexOf(topic.lastExerciseId);
    return byId >= 0 ? byId : Math.min(Math.max(topic.lastPosition, 0), Math.max(exerciseIds.length - 1, 0));
  },
};
