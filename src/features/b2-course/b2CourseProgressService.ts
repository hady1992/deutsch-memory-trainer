import type {
  B2CourseExerciseProgress,
  B2CourseItemProgress,
  B2CourseProgressStore,
  B2CourseResumeState,
  B2CourseUnitStats,
  B2CourseUnitVocabularyProgress,
  B2SelfAssessment,
  B2VocabularyStatus,
} from "./types";

export const B2_COURSE_PROGRESS_KEY = "dmt_b2_course_progress_v1";
const PROGRESS_CHANGE_EVENT = "dmt-b2-course-progress-change";

type VocabularyIdentity = { courseItemId: string };

const emptyStore = (): B2CourseProgressStore => ({
  version: 2,
  vocabulary: {},
  vocabularyByUnit: {},
  exercises: {},
  favorites: [],
  resume: {},
  updatedAt: new Date(0).toISOString(),
});

const emptyUnitVocabularyProgress = (): B2CourseUnitVocabularyProgress => ({
  statusByItemId: {},
  nextItemId: "",
  lastViewedItemId: "",
  reviewCursorItemId: "",
  legacyMigrated: false,
  updatedAt: "",
});

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeStatuses(value: unknown): Record<string, B2VocabularyStatus> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, B2VocabularyStatus] => (
      entry[1] === "known" || entry[1] === "review"
    )),
  );
}

function migrateStore(value: unknown): B2CourseProgressStore {
  if (!isRecord(value)) return emptyStore();
  const rawVocabularyByUnit = isRecord(value.vocabularyByUnit) ? value.vocabularyByUnit : {};
  const vocabularyByUnit = Object.fromEntries(Object.entries(rawVocabularyByUnit).map(([unit, entry]) => {
    const current = isRecord(entry) ? entry : {};
    return [unit, {
      ...current,
      statusByItemId: sanitizeStatuses(current.statusByItemId),
      nextItemId: typeof current.nextItemId === "string" ? current.nextItemId : "",
      lastViewedItemId: typeof current.lastViewedItemId === "string" ? current.lastViewedItemId : "",
      reviewCursorItemId: typeof current.reviewCursorItemId === "string" ? current.reviewCursorItemId : "",
      legacyMigrated: current.legacyMigrated === true,
      updatedAt: typeof current.updatedAt === "string" ? current.updatedAt : "",
    } satisfies B2CourseUnitVocabularyProgress];
  }));

  return {
    ...value,
    version: 2,
    vocabulary: isRecord(value.vocabulary)
      ? value.vocabulary as Record<string, B2CourseItemProgress>
      : {},
    vocabularyByUnit,
    exercises: isRecord(value.exercises)
      ? value.exercises as Record<string, B2CourseExerciseProgress>
      : {},
    favorites: Array.isArray(value.favorites)
      ? value.favorites.filter((item): item is string => typeof item === "string")
      : [],
    resume: isRecord(value.resume)
      ? value.resume as Record<string, B2CourseResumeState>
      : {},
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date(0).toISOString(),
  };
}

function notifyProgressChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PROGRESS_CHANGE_EVENT));
}

function persist(store: B2CourseProgressStore, touchUpdatedAt = true): void {
  const next = {
    ...store,
    version: 2 as const,
    updatedAt: touchUpdatedAt ? new Date().toISOString() : store.updatedAt,
  };
  localStorage.setItem(B2_COURSE_PROGRESS_KEY, JSON.stringify(next));
  notifyProgressChanged();
}

function load(): B2CourseProgressStore {
  try {
    const raw = localStorage.getItem(B2_COURSE_PROGRESS_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as unknown;
    const migrated = migrateStore(parsed);
    if (!isRecord(parsed) || parsed.version !== 2 || !isRecord(parsed.vocabularyByUnit)) {
      persist(migrated, false);
    }
    return migrated;
  } catch (error) {
    console.error("[B2CourseProgress] Invalid local progress data", error);
    return emptyStore();
  }
}

function unitKey(unit: number): string {
  return String(unit);
}

function getOriginUnit(itemId: string): number | null {
  const match = /^b2u(\d{2})-v\d{3}$/i.exec(itemId);
  return match ? Number(match[1]) : null;
}

function ensureUnitProgress(store: B2CourseProgressStore, unit: number): B2CourseUnitVocabularyProgress {
  const key = unitKey(unit);
  const current = store.vocabularyByUnit[key];
  if (current) return current;
  const created = emptyUnitVocabularyProgress();
  store.vocabularyByUnit[key] = created;
  return created;
}

function findUnseenItem(
  items: readonly VocabularyIdentity[],
  statuses: Record<string, B2VocabularyStatus>,
  startIndex = 0,
): VocabularyIdentity | undefined {
  if (!items.length) return undefined;
  const safeStart = ((startIndex % items.length) + items.length) % items.length;
  for (let offset = 0; offset < items.length; offset += 1) {
    const candidate = items[(safeStart + offset) % items.length];
    if (!statuses[candidate.courseItemId]) return candidate;
  }
  return undefined;
}

function itemIndex(items: readonly VocabularyIdentity[], itemId: string): number {
  return items.findIndex((item) => item.courseItemId === itemId);
}

export class B2CourseProgressService {
  static getStore(): B2CourseProgressStore {
    return load();
  }

  static subscribe(listener: () => void): () => void {
    if (typeof window === "undefined") return () => undefined;
    const onStorage = (event: StorageEvent) => {
      if (event.key === B2_COURSE_PROGRESS_KEY) listener();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(PROGRESS_CHANGE_EVENT, listener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(PROGRESS_CHANGE_EVENT, listener);
    };
  }

  static migrateVocabularyProgress(unit: number, items: readonly VocabularyIdentity[]): void {
    const store = load();
    const key = unitKey(unit);
    const existed = Boolean(store.vocabularyByUnit[key]);
    const unitProgress = ensureUnitProgress(store, unit);
    const before = JSON.stringify(unitProgress);
    const validIds = new Set(items.map((item) => item.courseItemId));
    const resume = this.getResumeFromStore(store, unit);

    if (!unitProgress.legacyMigrated) {
      items.forEach((item) => {
        if (unitProgress.statusByItemId[item.courseItemId] || getOriginUnit(item.courseItemId) !== unit) return;
        const legacy = store.vocabulary[item.courseItemId];
        if (!legacy?.lastReviewedAt) return;
        unitProgress.statusByItemId[item.courseItemId] = legacy.difficult ? "review" : "known";
      });
      unitProgress.legacyMigrated = true;
    }

    const legacyIndex = Math.min(
      Math.max(0, Number.isFinite(resume.vocabularyIndex) ? resume.vocabularyIndex : 0),
      Math.max(0, items.length - 1),
    );
    const savedLastViewedIndex = itemIndex(items, unitProgress.lastViewedItemId);
    const fallbackStartIndex = savedLastViewedIndex >= 0 ? savedLastViewedIndex + 1 : legacyIndex;
    if (savedLastViewedIndex < 0) {
      unitProgress.lastViewedItemId = items[legacyIndex]?.courseItemId ?? "";
    }
    if (
      !unitProgress.nextItemId
      || !validIds.has(unitProgress.nextItemId)
      || Boolean(unitProgress.statusByItemId[unitProgress.nextItemId])
    ) {
      unitProgress.nextItemId = findUnseenItem(items, unitProgress.statusByItemId, fallbackStartIndex)?.courseItemId ?? "";
    }
    if (unitProgress.reviewCursorItemId && !validIds.has(unitProgress.reviewCursorItemId)) {
      unitProgress.reviewCursorItemId = "";
    }

    if (!existed || before !== JSON.stringify(unitProgress)) {
      unitProgress.updatedAt = new Date().toISOString();
      persist(store);
    }
  }

  static getVocabularyStatus(unit: number, itemId: string): B2VocabularyStatus | "unseen" {
    return load().vocabularyByUnit[unitKey(unit)]?.statusByItemId[itemId] ?? "unseen";
  }

  static setVocabularyStatus(unit: number, itemId: string, status: B2VocabularyStatus): void {
    const store = load();
    const unitProgress = ensureUnitProgress(store, unit);
    unitProgress.statusByItemId[itemId] = status;
    unitProgress.lastViewedItemId = itemId;
    unitProgress.updatedAt = new Date().toISOString();
    persist(store);
  }

  static getVocabularyProgress(id: string): B2CourseItemProgress {
    return load().vocabulary[id] ?? emptyVocabularyProgress();
  }

  static recordVocabularyReview(
    unit: number,
    id: string,
    correct: boolean,
    items: readonly VocabularyIdentity[],
    updateMainCursor = true,
  ): B2CourseItemProgress {
    const store = load();
    const current = store.vocabulary[id] ?? emptyVocabularyProgress();
    const correctCount = current.correctCount + (correct ? 1 : 0);
    const wrongCount = current.wrongCount + (correct ? 0 : 1);
    const next: B2CourseItemProgress = {
      ...current,
      correctCount,
      wrongCount,
      lastReviewedAt: new Date().toISOString(),
      difficult: correct ? false : true,
      mastered: correct && (current.mastered || correctCount >= 5 && wrongCount <= 1),
    };
    store.vocabulary[id] = next;

    const unitProgress = ensureUnitProgress(store, unit);
    unitProgress.statusByItemId[id] = correct ? "known" : "review";
    unitProgress.lastViewedItemId = id;
    if (updateMainCursor) {
      const currentIndex = itemIndex(items, id);
      const nextItem = findUnseenItem(items, unitProgress.statusByItemId, Math.max(0, currentIndex + 1));
      unitProgress.nextItemId = nextItem?.courseItemId ?? "";
      const resume = this.getResumeFromStore(store, unit);
      store.resume[unitKey(unit)] = {
        ...resume,
        vocabularyIndex: nextItem ? itemIndex(items, nextItem.courseItemId) : currentIndex,
        lastMode: "vocabulary",
        updatedAt: new Date().toISOString(),
      };
    }
    unitProgress.updatedAt = new Date().toISOString();
    persist(store);
    return next;
  }

  static setVocabularyCursor(unit: number, itemId: string, items: readonly VocabularyIdentity[]): void {
    const store = load();
    const unitProgress = ensureUnitProgress(store, unit);
    const currentIndex = Math.max(0, itemIndex(items, itemId));
    const status = unitProgress.statusByItemId[itemId];
    const nextItem = status
      ? findUnseenItem(items, unitProgress.statusByItemId, currentIndex + 1)
      : items[currentIndex];
    unitProgress.lastViewedItemId = itemId;
    unitProgress.nextItemId = nextItem?.courseItemId ?? "";
    unitProgress.updatedAt = new Date().toISOString();

    const resume = this.getResumeFromStore(store, unit);
    store.resume[unitKey(unit)] = {
      ...resume,
      vocabularyIndex: currentIndex,
      lastMode: "vocabulary",
      updatedAt: new Date().toISOString(),
    };
    persist(store);
  }

  static getNextVocabularyItem<T extends VocabularyIdentity>(unit: number, items: readonly T[]): T | undefined {
    this.migrateVocabularyProgress(unit, items);
    const unitProgress = load().vocabularyByUnit[unitKey(unit)] ?? emptyUnitVocabularyProgress();
    const saved = items.find((item) => (
      item.courseItemId === unitProgress.nextItemId
      && !unitProgress.statusByItemId[item.courseItemId]
    ));
    if (saved) return saved;
    const lastIndex = itemIndex(items, unitProgress.lastViewedItemId);
    return findUnseenItem(items, unitProgress.statusByItemId, Math.max(0, lastIndex + 1)) as T | undefined;
  }

  static getReviewVocabulary<T extends VocabularyIdentity>(unit: number, items: readonly T[]): T[] {
    const statuses = load().vocabularyByUnit[unitKey(unit)]?.statusByItemId ?? {};
    return items.filter((item) => statuses[item.courseItemId] === "review");
  }

  static getReviewStartItem<T extends VocabularyIdentity>(unit: number, items: readonly T[]): T | undefined {
    const unitProgress = load().vocabularyByUnit[unitKey(unit)] ?? emptyUnitVocabularyProgress();
    return items.find((item) => item.courseItemId === unitProgress.reviewCursorItemId) ?? items[0];
  }

  static setReviewCursor(unit: number, itemId: string): void {
    const store = load();
    const unitProgress = ensureUnitProgress(store, unit);
    unitProgress.reviewCursorItemId = itemId;
    unitProgress.updatedAt = new Date().toISOString();
    persist(store);
  }

  static resetVocabularyProgress(unit: number): void {
    const store = load();
    store.vocabularyByUnit[unitKey(unit)] = {
      ...emptyUnitVocabularyProgress(),
      legacyMigrated: true,
      updatedAt: new Date().toISOString(),
    };
    const resume = this.getResumeFromStore(store, unit);
    store.resume[unitKey(unit)] = {
      ...resume,
      vocabularyIndex: 0,
      lastMode: "unit",
      updatedAt: new Date().toISOString(),
    };
    persist(store);
  }

  static setVocabularyDifficult(id: string, difficult: boolean): void {
    const store = load();
    store.vocabulary[id] = {
      ...(store.vocabulary[id] ?? emptyVocabularyProgress()),
      difficult,
    };
    persist(store);
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
    persist(store);
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
    persist(store);
    return next;
  }

  static setExerciseDifficult(unit: number, exerciseId: string, difficult: boolean): void {
    const store = load();
    store.exercises[exerciseId] = {
      ...emptyExerciseProgress(unit, exerciseId),
      ...(store.exercises[exerciseId] ?? {}),
      difficult,
    };
    persist(store);
  }

  static toggleFavorite(id: string): boolean {
    const store = load();
    const favorites = new Set(store.favorites);
    const isFavorite = !favorites.has(id);
    if (isFavorite) favorites.add(id);
    else favorites.delete(id);
    store.favorites = [...favorites];
    persist(store);
    return isFavorite;
  }

  static isFavorite(id: string): boolean {
    return load().favorites.includes(id);
  }

  private static getResumeFromStore(store: B2CourseProgressStore, unit: number): B2CourseResumeState {
    return store.resume[unitKey(unit)] ?? {
      vocabularyIndex: 0,
      exerciseIndex: 0,
      lastMode: "unit",
      updatedAt: "",
    };
  }

  static getResume(unit: number): B2CourseResumeState {
    const store = load();
    return this.getResumeFromStore(store, unit);
  }

  static setResume(unit: number, patch: Partial<B2CourseResumeState>): void {
    const store = load();
    const current = this.getResumeFromStore(store, unit);
    store.resume[unitKey(unit)] = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    persist(store);
  }

  static getUnitStats(
    unit: number,
    vocabularyIds: string[],
    exerciseIds: string[],
  ): B2CourseUnitStats {
    const store = load();
    const statuses = store.vocabularyByUnit[unitKey(unit)]?.statusByItemId ?? {};
    const knownVocabulary = vocabularyIds.filter((id) => statuses[id] === "known").length;
    const reviewVocabulary = vocabularyIds.filter((id) => statuses[id] === "review").length;
    const reviewedVocabulary = knownVocabulary + reviewVocabulary;
    const completedExercises = exerciseIds.filter((id) => store.exercises[id]?.completed).length;
    const difficultItems = vocabularyIds.filter((id) => store.vocabulary[id]?.difficult).length
      + exerciseIds.filter((id) => store.exercises[id]?.difficult).length;
    return {
      vocabularyTotal: vocabularyIds.length,
      reviewedVocabulary,
      masteredVocabulary: knownVocabulary,
      knownVocabulary,
      reviewVocabulary,
      unseenVocabulary: Math.max(0, vocabularyIds.length - reviewedVocabulary),
      exerciseTotal: exerciseIds.length,
      completedExercises,
      difficultItems,
      percent: Math.round((reviewedVocabulary / Math.max(1, vocabularyIds.length)) * 100),
    };
  }
}
