import { ProgressService } from "./progressService";
import { MistakeReviewService } from "./mistakeReviewService";

export const DAILY_STUDY_SETS_KEY = "deutschTrainerDailyStudySets";

export type DailyStudyContentType = "verbs" | "nouns" | "adjectives";
export type DailyStudySelectionType = "random" | "new" | "mistakes" | "due" | "manual";
export type DailyStudyItemStatus = "not_reviewed" | "correct" | "needs_review" | "mastered";

export interface DailyStudyRoundResult {
  itemId: string;
  correct: boolean;
  status: DailyStudyItemStatus;
  answeredAt: string;
}

export interface DailyStudyQuestionSnapshot {
  itemId: string;
  questionType: string;
  options: string[];
  promptDe?: string;
  promptAr?: string;
  answer?: string;
  answerLang?: "de" | "ar";
  exampleDe?: string;
  exampleAr?: string;
}

export interface DailyStudyRound {
  id: string;
  itemIds: string[];
  currentIndex: number;
  results: Record<string, DailyStudyRoundResult>;
  correctCount: number;
  wrongCount: number;
  startedAt: string;
  completedAt?: string;
  completed: boolean;
  temporary?: boolean;
  currentQuestion?: DailyStudyQuestionSnapshot;
}

export interface DailyStudySet {
  id: string;
  contentType: DailyStudyContentType;
  selectionType: DailyStudySelectionType;
  count: number;
  itemIds: string[];
  createdDate: string;
  createdAt: string;
  updatedAt: string;
  completedRounds: number;
  totalCorrect: number;
  totalWrong: number;
  shuffleItems: boolean;
  currentRound?: DailyStudyRound;
}

interface DailyStudyStore {
  version: 1;
  activeContentType?: DailyStudyContentType;
  sets: Partial<Record<DailyStudyContentType, DailyStudySet>>;
  favorites: Record<DailyStudyContentType, string[]>;
}

const EMPTY_STORE: DailyStudyStore = {
  version: 1,
  sets: {},
  favorites: { verbs: [], nouns: [], adjectives: [] },
};

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function uniqueIds(ids: Array<string | number>): string[] {
  return Array.from(new Set(ids.map(String).map((id) => id.trim()).filter(Boolean)));
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function loadStore(): DailyStudyStore {
  try {
    const raw = localStorage.getItem(DAILY_STUDY_SETS_KEY);
    if (!raw) return { ...EMPTY_STORE, sets: {}, favorites: { ...EMPTY_STORE.favorites } };
    const parsed = JSON.parse(raw);
    return {
      version: 1,
      activeContentType: parsed?.activeContentType,
      sets: parsed?.sets && typeof parsed.sets === "object" ? parsed.sets : {},
      favorites: {
        verbs: uniqueIds(parsed?.favorites?.verbs || []),
        nouns: uniqueIds(parsed?.favorites?.nouns || []),
        adjectives: uniqueIds(parsed?.favorites?.adjectives || []),
      },
    };
  } catch (error) {
    console.error("Error loading daily study sets", error);
    return { ...EMPTY_STORE, sets: {}, favorites: { ...EMPTY_STORE.favorites } };
  }
}

function saveStore(store: DailyStudyStore): void {
  localStorage.setItem(DAILY_STUDY_SETS_KEY, JSON.stringify(store));
}

function createRound(itemIds: string[], shuffleItems: boolean, temporary = false): DailyStudyRound {
  return {
    id: `round-${Date.now()}`,
    itemIds: shuffleItems ? shuffle(itemIds) : [...itemIds],
    currentIndex: 0,
    results: {},
    correctCount: 0,
    wrongCount: 0,
    startedAt: new Date().toISOString(),
    completed: false,
    temporary,
  };
}

export function getAllDailyStudySets(): DailyStudySet[] {
  return Object.values(loadStore().sets).filter(Boolean) as DailyStudySet[];
}

export function getDailyStudySet(contentType?: DailyStudyContentType): DailyStudySet | null {
  const store = loadStore();
  const type = contentType || store.activeContentType;
  return type ? store.sets[type] || null : null;
}

export function saveDailyStudySet(set: DailyStudySet, makeActive = true): DailyStudySet {
  const store = loadStore();
  const saved = { ...set, itemIds: uniqueIds(set.itemIds), updatedAt: new Date().toISOString() };
  store.sets[saved.contentType] = saved;
  if (makeActive) store.activeContentType = saved.contentType;
  saveStore(store);
  return saved;
}

export function createDailyStudySet(input: {
  contentType: DailyStudyContentType;
  selectionType: DailyStudySelectionType;
  itemIds: Array<string | number>;
  shuffleItems?: boolean;
}): DailyStudySet {
  const itemIds = uniqueIds(input.itemIds);
  if (!itemIds.length) throw new Error("A daily study set needs at least one item.");
  const now = new Date().toISOString();
  const set: DailyStudySet = {
    id: `daily-${input.contentType}-${Date.now()}`,
    contentType: input.contentType,
    selectionType: input.selectionType,
    count: itemIds.length,
    itemIds,
    createdDate: todayKey(),
    createdAt: now,
    updatedAt: now,
    completedRounds: 0,
    totalCorrect: 0,
    totalWrong: 0,
    shuffleItems: input.shuffleItems ?? true,
    currentRound: createRound(itemIds, input.shuffleItems ?? true),
  };
  return saveDailyStudySet(set);
}

export function replaceDailyStudySet(input: {
  contentType: DailyStudyContentType;
  selectionType: DailyStudySelectionType;
  itemIds: Array<string | number>;
  shuffleItems?: boolean;
}): DailyStudySet {
  return createDailyStudySet(input);
}

export function updateDailyStudySet(
  originalType: DailyStudyContentType,
  input: {
    contentType: DailyStudyContentType;
    selectionType: DailyStudySelectionType;
    itemIds: Array<string | number>;
    shuffleItems: boolean;
  }
): DailyStudySet {
  const current = getDailyStudySet(originalType);
  if (!current) return createDailyStudySet(input);
  const itemIds = uniqueIds(input.itemIds);
  if (!itemIds.length) throw new Error("A daily study set needs at least one item.");
  const updated: DailyStudySet = {
    ...current,
    contentType: input.contentType,
    selectionType: input.selectionType,
    count: itemIds.length,
    itemIds,
    shuffleItems: input.shuffleItems,
    currentRound: createRound(itemIds, input.shuffleItems),
  };
  const store = loadStore();
  if (originalType !== input.contentType) delete store.sets[originalType];
  store.sets[input.contentType] = { ...updated, updatedAt: new Date().toISOString() };
  store.activeContentType = input.contentType;
  saveStore(store);
  return store.sets[input.contentType]!;
}

export function deleteDailyStudySet(contentType?: DailyStudyContentType): void {
  const store = loadStore();
  const type = contentType || store.activeContentType;
  if (!type) return;
  delete store.sets[type];
  if (store.activeContentType === type) {
    store.activeContentType = (Object.keys(store.sets)[0] as DailyStudyContentType | undefined);
  }
  saveStore(store);
}

export function keepCurrentSetForToday(contentType?: DailyStudyContentType): DailyStudySet | null {
  const set = getDailyStudySet(contentType);
  if (!set) return null;
  return saveDailyStudySet({ ...set, createdDate: todayKey() });
}

export function isDailyStudySetFromPreviousDay(set: DailyStudySet): boolean {
  return set.createdDate !== todayKey();
}

export function startDailyStudyRound(
  contentType?: DailyStudyContentType,
  options?: { itemIds?: Array<string | number>; temporary?: boolean }
): DailyStudySet | null {
  const set = getDailyStudySet(contentType);
  if (!set) return null;
  const roundIds = uniqueIds(options?.itemIds || set.itemIds);
  if (!roundIds.length) return null;
  return saveDailyStudySet({
    ...set,
    currentRound: createRound(roundIds, set.shuffleItems, options?.temporary),
  });
}

export function recordDailyStudyAnswer(
  contentType: DailyStudyContentType,
  itemId: string | number,
  correct: boolean,
  mastered = false
): DailyStudySet | null {
  const set = getDailyStudySet(contentType);
  if (!set?.currentRound || set.currentRound.completed) return set;
  const id = String(itemId);
  if (set.currentRound.results[id]) return set;

  const result: DailyStudyRoundResult = {
    itemId: id,
    correct,
    status: mastered ? "mastered" : correct ? "correct" : "needs_review",
    answeredAt: new Date().toISOString(),
  };
  const results = { ...set.currentRound.results, [id]: result };
  const correctCount = set.currentRound.correctCount + (correct ? 1 : 0);
  const wrongCount = set.currentRound.wrongCount + (correct ? 0 : 1);
  const currentIndex = Math.min(set.currentRound.itemIds.length, set.currentRound.currentIndex + 1);
  const completed = currentIndex >= set.currentRound.itemIds.length;
  const updated: DailyStudySet = {
    ...set,
    totalCorrect: set.totalCorrect + (correct ? 1 : 0),
    totalWrong: set.totalWrong + (correct ? 0 : 1),
    completedRounds: set.completedRounds + (completed && !set.currentRound.temporary ? 1 : 0),
    currentRound: {
      ...set.currentRound,
      results,
      correctCount,
      wrongCount,
      currentIndex,
      completed,
      completedAt: completed ? new Date().toISOString() : undefined,
    },
  };
  return saveDailyStudySet(updated);
}

export function saveDailyStudyQuestion(
  contentType: DailyStudyContentType,
  question: DailyStudyQuestionSnapshot
): DailyStudySet | null {
  const set = getDailyStudySet(contentType);
  const round = set?.currentRound;
  if (!set || !round || round.completed) return set;

  const activeItemId = round.itemIds[round.currentIndex];
  if (activeItemId !== question.itemId) return set;

  const existing = round.currentQuestion;
  if (
    existing?.itemId === question.itemId &&
    existing.questionType === question.questionType &&
    existing.promptDe === question.promptDe &&
    existing.promptAr === question.promptAr &&
    existing.answer === question.answer &&
    existing.answerLang === question.answerLang &&
    existing.exampleDe === question.exampleDe &&
    existing.exampleAr === question.exampleAr &&
    Array.isArray(existing.options) &&
    existing.options.length === question.options.length &&
    existing.options.every((option, index) => option === question.options[index])
  ) {
    return set;
  }

  return saveDailyStudySet({
    ...set,
    currentRound: {
      ...round,
      currentQuestion: {
        ...question,
        options: [...question.options],
      },
    },
  });
}

export function getWrongItemIds(set: DailyStudySet): string[] {
  return Object.values(set.currentRound?.results || {})
    .filter((result) => !result.correct)
    .map((result) => result.itemId);
}

export function reconcileDailyStudySetItems(
  contentType: DailyStudyContentType,
  validIds: Array<string | number>
): DailyStudySet | null {
  const set = getDailyStudySet(contentType);
  if (!set) return null;
  const valid = new Set(uniqueIds(validIds));
  const itemIds = set.itemIds.filter((id) => valid.has(id));
  const currentRound = set.currentRound
    ? {
        ...set.currentRound,
        itemIds: set.currentRound.itemIds.filter((id) => valid.has(id)),
        results: Object.fromEntries(
          Object.entries(set.currentRound.results).filter(([id]) => valid.has(id))
        ),
      }
    : undefined;
  if (currentRound) {
    currentRound.currentIndex = Math.min(
      currentRound.itemIds.length,
      Object.keys(currentRound.results).length
    );
    currentRound.completed = currentRound.itemIds.length > 0 && currentRound.currentIndex >= currentRound.itemIds.length;
  }
  if (itemIds.length === set.itemIds.length && currentRound?.itemIds.length === set.currentRound?.itemIds.length) {
    return set;
  }
  return saveDailyStudySet({ ...set, itemIds, count: itemIds.length, currentRound });
}

export function getFavoriteItemIds(contentType: DailyStudyContentType): string[] {
  return [...loadStore().favorites[contentType]];
}

export function addItemToFavorites(contentType: DailyStudyContentType, itemId: string | number): void {
  const store = loadStore();
  store.favorites[contentType] = uniqueIds([...store.favorites[contentType], itemId]);
  saveStore(store);
}

export function removeItemFromFavorites(contentType: DailyStudyContentType, itemId: string | number): void {
  const store = loadStore();
  store.favorites[contentType] = store.favorites[contentType].filter((id) => id !== String(itemId));
  saveStore(store);
}

export function selectDailyStudyItemIds(
  contentType: DailyStudyContentType,
  selectionType: DailyStudySelectionType,
  availableIds: Array<string | number>,
  count: number,
  manualIds: Array<string | number> = []
): string[] {
  const available = uniqueIds(availableIds);
  if (selectionType === "manual") return uniqueIds(manualIds).filter((id) => available.includes(id));

  const progress = ProgressService.getProgress();
  const prefix = contentType === "verbs" ? "verb" : "vocab";
  const itemKey = (id: string) => `${prefix}-${id}`;
  let preferred: string[] = [];
  if (selectionType === "new") {
    preferred = available.filter((id) => !progress[itemKey(id)]);
  } else if (selectionType === "mistakes") {
    const mistakeKeys = new Set(MistakeReviewService.getUnresolvedMistakes().map((mistake) => mistake.itemKey));
    preferred = available.filter((id) => mistakeKeys.has(itemKey(id)));
  } else if (selectionType === "due") {
    const now = new Date();
    preferred = available.filter((id) => {
      const item = progress[itemKey(id)];
      return Boolean(item?.nextReviewAt && new Date(item.nextReviewAt) <= now);
    });
  }
  const rest = available.filter((id) => !preferred.includes(id));
  return shuffle([...shuffle(preferred), ...shuffle(rest)]).slice(0, Math.min(count, available.length));
}

export function getDailyStudySetItems<T extends { id: string | number }>(set: DailyStudySet, items: T[]): T[] {
  const byId = new Map(items.map((item) => [String(item.id), item]));
  return set.itemIds.map((id) => byId.get(id)).filter(Boolean) as T[];
}
