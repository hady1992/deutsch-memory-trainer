import type {
  B2CourseExerciseProgress,
  B2CourseItemProgress,
  B2CourseProgressStore,
  B2CourseResumeState,
  B2CourseUnitStats,
  B2SelfAssessment,
} from "./types";

export const B2_COURSE_PROGRESS_KEY = "dmt_b2_course_progress_v1";

const emptyStore = (): B2CourseProgressStore => ({
  version: 1,
  vocabulary: {},
  exercises: {},
  favorites: [],
  resume: {},
  updatedAt: new Date(0).toISOString(),
});

function load(): B2CourseProgressStore {
  try {
    const raw = localStorage.getItem(B2_COURSE_PROGRESS_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Partial<B2CourseProgressStore>;
    if (parsed.version !== 1) return emptyStore();
    return {
      version: 1,
      vocabulary: parsed.vocabulary ?? {},
      exercises: parsed.exercises ?? {},
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
      resume: parsed.resume ?? {},
      updatedAt: parsed.updatedAt ?? new Date(0).toISOString(),
    };
  } catch (error) {
    console.error("[B2CourseProgress] Invalid local progress data", error);
    return emptyStore();
  }
}

function save(store: B2CourseProgressStore): void {
  localStorage.setItem(B2_COURSE_PROGRESS_KEY, JSON.stringify({
    ...store,
    updatedAt: new Date().toISOString(),
  }));
}

const emptyVocabularyProgress = (): B2CourseItemProgress => ({
  correctCount: 0,
  wrongCount: 0,
  lastReviewedAt: "",
  difficult: false,
  mastered: false,
});

const emptyExerciseProgress = (unit: number, exerciseId: string): B2CourseExerciseProgress => ({
  correctCount: 0,
  wrongCount: 0,
  attempts: 0,
  completed: false,
  difficult: false,
  lastReviewedAt: "",
  lastAnswer: "",
  unitId: `b2-course-unit-${String(unit).padStart(2, "0")}`,
  exerciseId,
});

export class B2CourseProgressService {
  static getStore(): B2CourseProgressStore {
    return load();
  }

  static getVocabularyProgress(id: string): B2CourseItemProgress {
    return load().vocabulary[id] ?? emptyVocabularyProgress();
  }

  static recordVocabularyReview(id: string, correct: boolean): B2CourseItemProgress {
    const store = load();
    const current = store.vocabulary[id] ?? emptyVocabularyProgress();
    const correctCount = current.correctCount + (correct ? 1 : 0);
    const wrongCount = current.wrongCount + (correct ? 0 : 1);
    const next: B2CourseItemProgress = {
      ...current,
      correctCount,
      wrongCount,
      lastReviewedAt: new Date().toISOString(),
      difficult: correct ? wrongCount > correctCount : true,
      mastered: correct && correctCount >= 5 && wrongCount <= 1,
    };
    store.vocabulary[id] = next;
    save(store);
    return next;
  }

  static setVocabularyDifficult(id: string, difficult: boolean): void {
    const store = load();
    store.vocabulary[id] = {
      ...(store.vocabulary[id] ?? emptyVocabularyProgress()),
      difficult,
    };
    save(store);
  }

  static recordExerciseAttempt(
    unit: number,
    exerciseId: string,
    correct: boolean,
    lastAnswer: unknown,
  ): B2CourseExerciseProgress {
    const store = load();
    const current = {
      ...emptyExerciseProgress(unit, exerciseId),
      ...(store.exercises[exerciseId] ?? {}),
    };
    const next: B2CourseExerciseProgress = {
      ...current,
      correctCount: current.correctCount + (correct ? 1 : 0),
      wrongCount: current.wrongCount + (correct ? 0 : 1),
      attempts: current.attempts + 1,
      completed: current.completed || correct,
      difficult: correct ? current.difficult && current.wrongCount > current.correctCount : true,
      lastReviewedAt: new Date().toISOString(),
      lastAnswer,
      unitId: `b2-course-unit-${String(unit).padStart(2, "0")}`,
      exerciseId,
      selfAssessment: undefined,
    };
    store.exercises[exerciseId] = next;
    save(store);
    return next;
  }

  static recordSelfAssessment(
    unit: number,
    exerciseId: string,
    assessment: B2SelfAssessment,
    lastAnswer: string,
  ): B2CourseExerciseProgress {
    const store = load();
    const current = {
      ...emptyExerciseProgress(unit, exerciseId),
      ...(store.exercises[exerciseId] ?? {}),
    };
    const completed = assessment === "completed";
    const next: B2CourseExerciseProgress = {
      ...current,
      attempts: current.attempts + 1,
      completed: current.completed || completed,
      difficult: assessment === "needs_review",
      wrongCount: current.wrongCount + (assessment === "needs_review" ? 1 : 0),
      correctCount: current.correctCount,
      lastReviewedAt: new Date().toISOString(),
      lastAnswer,
      unitId: `b2-course-unit-${String(unit).padStart(2, "0")}`,
      exerciseId,
      selfAssessment: assessment,
    };
    store.exercises[exerciseId] = next;
    save(store);
    return next;
  }

  static setExerciseDifficult(unit: number, exerciseId: string, difficult: boolean): void {
    const store = load();
    store.exercises[exerciseId] = {
      ...emptyExerciseProgress(unit, exerciseId),
      ...(store.exercises[exerciseId] ?? {}),
      difficult,
    };
    save(store);
  }

  static toggleFavorite(id: string): boolean {
    const store = load();
    const favorites = new Set(store.favorites);
    const isFavorite = !favorites.has(id);
    if (isFavorite) favorites.add(id);
    else favorites.delete(id);
    store.favorites = [...favorites];
    save(store);
    return isFavorite;
  }

  static isFavorite(id: string): boolean {
    return load().favorites.includes(id);
  }

  static getResume(unit: number): B2CourseResumeState {
    return load().resume[String(unit)] ?? {
      vocabularyIndex: 0,
      exerciseIndex: 0,
      lastMode: "unit",
      updatedAt: "",
    };
  }

  static setResume(unit: number, patch: Partial<B2CourseResumeState>): void {
    const store = load();
    const current = store.resume[String(unit)] ?? this.getResume(unit);
    store.resume[String(unit)] = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    save(store);
  }

  static getUnitStats(vocabularyIds: string[], exerciseIds: string[]): B2CourseUnitStats {
    const store = load();
    const reviewedVocabulary = vocabularyIds.filter((id) => Boolean(store.vocabulary[id]?.lastReviewedAt)).length;
    const masteredVocabulary = vocabularyIds.filter((id) => store.vocabulary[id]?.mastered).length;
    const completedExercises = exerciseIds.filter((id) => store.exercises[id]?.completed).length;
    const difficultItems = vocabularyIds.filter((id) => store.vocabulary[id]?.difficult).length
      + exerciseIds.filter((id) => store.exercises[id]?.difficult).length;
    return {
      vocabularyTotal: vocabularyIds.length,
      reviewedVocabulary,
      masteredVocabulary,
      exerciseTotal: exerciseIds.length,
      completedExercises,
      difficultItems,
      percent: Math.round(
        ((reviewedVocabulary + completedExercises) /
          Math.max(1, vocabularyIds.length + exerciseIds.length)) * 100,
      ),
    };
  }
}
