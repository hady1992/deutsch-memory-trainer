import fs from "node:fs";
import path from "node:path";
import {
  checkChoiceAnswer,
  checkMatchingAnswer,
  checkOrderAnswer,
  checkTextAnswer,
  isChoiceExercise,
  isOrderExercise,
  isSelfCheckExercise,
  isSupportedExercise,
  isTextExercise,
} from "../src/features/b2-course/exerciseEngine";
import {
  B2_COURSE_PROGRESS_KEY,
  B2CourseProgressService,
} from "../src/features/b2-course/b2CourseProgressService";
import { B2CourseService } from "../src/features/b2-course/b2CourseService";
import type {
  B2CourseExercise,
  B2CourseIndex,
  B2CourseVocabularyFile,
} from "../src/features/b2-course/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });

const root = path.resolve("public/data/courses/b2-course");
const index = JSON.parse(fs.readFileSync(path.join(root, "index.json"), "utf8")) as B2CourseIndex;

const originalFetch = globalThis.fetch;
const courseRequests: string[] = [];
const courseFileFetch = async (input: string | URL | Request) => {
  const url = new URL(String(input), "http://local.test");
  courseRequests.push(url.pathname);
  const file = path.resolve("public", url.pathname.replace(/^\//, ""));
  return new Response(fs.readFileSync(file, "utf8"), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
globalThis.fetch = courseFileFetch;
B2CourseService.clearCache();
const lazyIndex = await B2CourseService.getIndex();
assert(lazyIndex.units.length === 14, "The lazy B2 course index lost units.");
assert(Number(courseRequests.length) === 1 && courseRequests[0].endsWith("/index.json"), "The B2 course overview must load only index.json.");
await B2CourseService.getUnit(1);
assert(Number(courseRequests.length) === 3, "Opening one B2 unit must add only its vocabulary and exercise files.");
await B2CourseService.getUnit(1);
assert(Number(courseRequests.length) === 3, "Reopening a B2 unit must reuse the in-session cache.");
await B2CourseService.getResolvedVocabulary(8);
assert(courseRequests.length < 10, "Resolving reused vocabulary loaded too many B2 units.");
assert(!courseRequests.some((request) => request.includes("unit-14")), "Opening Kapitel 8 unexpectedly loaded Kapitel 14.");
B2CourseService.clearCache();
globalThis.fetch = async () => new Response("Unavailable", { status: 503 });
let failedCourseIndexRequest = false;
try {
  await B2CourseService.getIndex();
} catch {
  failedCourseIndexRequest = true;
}
assert(failedCourseIndexRequest, "A failed B2 course index request was not rejected.");
globalThis.fetch = courseFileFetch;
assert((await B2CourseService.getIndex()).units.length === 14, "A failed B2 course index request could not be retried.");
globalThis.fetch = originalFetch;
const exercises: B2CourseExercise[] = index.units.flatMap((unit) => {
  const file = JSON.parse(fs.readFileSync(path.join(root, unit.exercisesFile), "utf8"));
  return file.exercises as B2CourseExercise[];
});
const unit1Summary = index.units.find((unit) => unit.unit === 1);
const unit2Summary = index.units.find((unit) => unit.unit === 2);
assert(unit1Summary && unit2Summary, "The progress tests require Kapitel 1 and 2.");
const unit1Vocabulary = JSON.parse(
  fs.readFileSync(path.join(root, unit1Summary.vocabularyFile), "utf8"),
) as B2CourseVocabularyFile;
const unit2Vocabulary = JSON.parse(
  fs.readFileSync(path.join(root, unit2Summary.vocabularyFile), "utf8"),
) as B2CourseVocabularyFile;
const unit1Items = unit1Vocabulary.items;
const unit2Items = unit2Vocabulary.items;

const counts: Record<string, number> = {};
for (const exercise of exercises) {
  counts[exercise.type] = (counts[exercise.type] ?? 0) + 1;
  assert(isSupportedExercise(exercise), `Unsupported exercise: ${exercise.id}`);
  if (isChoiceExercise(exercise)) {
    assert(checkChoiceAnswer(exercise, String(exercise.answer)), `Choice checker failed: ${exercise.id}`);
  } else if (isTextExercise(exercise)) {
    assert(checkTextAnswer(exercise, String(exercise.answer)), `Text checker failed: ${exercise.id}`);
  } else if (isOrderExercise(exercise)) {
    const selection = Array.isArray(exercise.answer)
      ? exercise.answer.map(String)
      : (exercise.tokens ?? []).map((token, tokenIndex) => `${tokenIndex}:${token}`);
    assert(checkOrderAnswer(exercise, selection), `Order checker failed: ${exercise.id}`);
  } else if (exercise.type === "matching") {
    assert(checkMatchingAnswer(exercise, exercise.answer as Record<string, string>), `Matching checker failed: ${exercise.id}`);
  } else {
    assert(isSelfCheckExercise(exercise), `Unhandled supported exercise: ${exercise.id}`);
  }
}

const expectedExerciseCount = index.units.reduce((total, unit) => total + unit.exerciseCount, 0);
assert(
  exercises.length === expectedExerciseCount,
  `Expected ${expectedExerciseCount} exercises, found ${exercises.length}`,
);
assert(Object.keys(counts).length === 11, `Expected all 11 exercise types, found ${Object.keys(counts).length}`);

B2CourseProgressService.recordExerciseAttempt(1, "b2u01-e001", false, "wrong");
B2CourseProgressService.recordExerciseAttempt(1, "b2u01-e001", true, "correct");
B2CourseProgressService.recordSelfAssessment(2, "b2u02-e039", "completed", "draft");
B2CourseProgressService.recordSelfAssessment(3, "b2u03-e042", "needs_review", "notes");
B2CourseProgressService.setResume(1, { exerciseIndex: 7, lastMode: "exercises" });

B2CourseProgressService.migrateVocabularyProgress(1, unit1Items);
unit1Items.slice(0, 10).forEach((item, itemIndex) => {
  B2CourseProgressService.recordVocabularyReview(1, item.courseItemId, itemIndex < 7, unit1Items);
});

assert(
  unit1Items.slice(0, 7).every((item) => B2CourseProgressService.getVocabularyStatus(1, item.courseItemId) === "known"),
  "Known vocabulary statuses were not persisted.",
);
assert(
  unit1Items.slice(7, 10).every((item) => B2CourseProgressService.getVocabularyStatus(1, item.courseItemId) === "review"),
  "Review vocabulary statuses were not persisted.",
);
const nextAfterTen = B2CourseProgressService.getNextVocabularyItem(1, unit1Items);
assert(nextAfterTen?.courseItemId === unit1Items[10].courseItemId, "Resume did not point to the first unseen item.");

const reviewBeforeMastering = B2CourseProgressService.getReviewVocabulary(1, unit1Items);
assert(reviewBeforeMastering.length === 3, "The review queue must contain exactly three items.");
const mainCursorBeforeReview = B2CourseProgressService.getStore().vocabularyByUnit["1"].nextItemId;
B2CourseProgressService.recordVocabularyReview(
  1,
  reviewBeforeMastering[0].courseItemId,
  true,
  reviewBeforeMastering,
  false,
);
assert(
  B2CourseProgressService.getVocabularyStatus(1, reviewBeforeMastering[0].courseItemId) === "known",
  "Review to known transition failed.",
);
assert(B2CourseProgressService.getReviewVocabulary(1, unit1Items).length === 2, "Mastered review item was not removed.");
assert(
  B2CourseProgressService.getStore().vocabularyByUnit["1"].nextItemId === mainCursorBeforeReview,
  "Review mode changed the main vocabulary cursor.",
);
const unit1Stats = B2CourseProgressService.getUnitStats(
  1,
  unit1Items.map((item) => item.courseItemId),
  [],
);
assert(
  unit1Stats.reviewedVocabulary === 10
  && unit1Stats.knownVocabulary === 8
  && unit1Stats.reviewVocabulary === 2
  && unit1Stats.unseenVocabulary === 50,
  "Kapitel vocabulary statistics are wrong.",
);

const reusedItemId = unit2Vocabulary.reusedVocabularyRefs?.[0]?.courseItemId;
assert(reusedItemId, "Kapitel 2 needs a reused vocabulary reference for this test.");
B2CourseProgressService.setVocabularyStatus(1, reusedItemId, "known");
B2CourseProgressService.migrateVocabularyProgress(2, [
  ...unit2Items,
  ...(unit2Vocabulary.reusedVocabularyRefs ?? []),
]);
assert(
  B2CourseProgressService.getVocabularyStatus(2, reusedItemId) === "unseen",
  "A linked item incorrectly shared its Kapitel status.",
);

const persistedProgress = JSON.parse(storage.getItem(B2_COURSE_PROGRESS_KEY) ?? "{}") as {
  vocabularyByUnit?: Record<string, { nextItemId?: string }>;
};
assert(
  persistedProgress.vocabularyByUnit?.["1"]?.nextItemId === unit1Items[10].courseItemId,
  "nextItemId was not written to localStorage.",
);
assert(
  B2CourseProgressService.getNextVocabularyItem(1, unit1Items)?.courseItemId === unit1Items[10].courseItemId,
  "nextItemId was not restored after a fresh load.",
);

const reorderedStorage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", { value: reorderedStorage, configurable: true });
reorderedStorage.setItem(B2_COURSE_PROGRESS_KEY, JSON.stringify({
  version: 2,
  vocabulary: {},
  vocabularyByUnit: {
    "1": {
      statusByItemId: { [unit1Items[0].courseItemId]: "known" },
      nextItemId: "removed-item",
      lastViewedItemId: unit1Items[0].courseItemId,
      reviewCursorItemId: "",
      legacyMigrated: true,
      updatedAt: "",
    },
  },
  exercises: {},
  favorites: [],
  resume: { "1": { vocabularyIndex: 0, exerciseIndex: 0, lastMode: "vocabulary", updatedAt: "" } },
  updatedAt: "",
}));
const reorderedItems = [unit1Items[2], unit1Items[0], unit1Items[1]];
assert(
  B2CourseProgressService.getNextVocabularyItem(1, reorderedItems)?.courseItemId === unit1Items[1].courseItemId,
  "Invalid nextItemId did not fall back to the first unseen item after reordering.",
);

const legacyStorage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", { value: legacyStorage, configurable: true });
legacyStorage.setItem(B2_COURSE_PROGRESS_KEY, JSON.stringify({
  version: 1,
  vocabulary: {
    [unit1Items[0].courseItemId]: {
      correctCount: 2,
      wrongCount: 0,
      lastReviewedAt: "2026-01-01T00:00:00.000Z",
      difficult: false,
      mastered: false,
    },
  },
  exercises: { preserved: { completed: true } },
  favorites: [unit1Items[0].courseItemId],
  resume: { "1": { vocabularyIndex: 1, exerciseIndex: 4, lastMode: "vocabulary", updatedAt: "old" } },
  updatedAt: "old",
  customLegacyField: { keep: true },
}));
const migratedStore = B2CourseProgressService.getStore();
assert(migratedStore.version === 2, "Legacy progress was not upgraded to version 2.");
assert((migratedStore.customLegacyField as { keep?: boolean })?.keep, "Unknown legacy fields were deleted.");
assert(migratedStore.exercises.preserved?.completed, "Exercise progress was deleted during migration.");
assert(migratedStore.favorites.includes(unit1Items[0].courseItemId), "Favorites were deleted during migration.");
B2CourseProgressService.migrateVocabularyProgress(1, unit1Items);
assert(
  B2CourseProgressService.getVocabularyStatus(1, unit1Items[0].courseItemId) === "known",
  "Legacy vocabulary progress was not mapped to a stable item ID.",
);
assert(
  B2CourseProgressService.getNextVocabularyItem(1, unit1Items)?.courseItemId === unit1Items[1].courseItemId,
  "Legacy vocabularyIndex was not migrated to the correct next item.",
);

const completionStorage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", { value: completionStorage, configurable: true });
B2CourseProgressService.migrateVocabularyProgress(1, unit1Items.slice(0, 3));
B2CourseProgressService.setVocabularyStatus(1, unit1Items[0].courseItemId, "known");
B2CourseProgressService.setVocabularyStatus(1, unit1Items[1].courseItemId, "review");
B2CourseProgressService.setVocabularyStatus(1, unit1Items[2].courseItemId, "known");
assert(!B2CourseProgressService.getNextVocabularyItem(1, unit1Items.slice(0, 3)), "Completed Kapitel returned an unseen item.");
assert(B2CourseProgressService.getReviewVocabulary(1, unit1Items.slice(0, 3)).length === 1, "Completed Kapitel lost its review queue.");
B2CourseProgressService.setVocabularyStatus(1, unit1Items[1].courseItemId, "known");
assert(B2CourseProgressService.getReviewVocabulary(1, unit1Items.slice(0, 3)).length === 0, "Known Kapitel still has review items.");

const resetStorage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", { value: resetStorage, configurable: true });
B2CourseProgressService.migrateVocabularyProgress(1, unit1Items.slice(0, 2));
B2CourseProgressService.setVocabularyStatus(1, unit1Items[0].courseItemId, "known");
B2CourseProgressService.toggleFavorite(unit1Items[0].courseItemId);
B2CourseProgressService.recordExerciseAttempt(1, "preserved-exercise", true, "answer");
B2CourseProgressService.resetVocabularyProgress(1);
assert(B2CourseProgressService.getVocabularyStatus(1, unit1Items[0].courseItemId) === "unseen", "Explicit reset did not reset Kapitel vocabulary.");
assert(B2CourseProgressService.isFavorite(unit1Items[0].courseItemId), "Explicit reset deleted a favorite.");
assert(B2CourseProgressService.getStore().exercises["preserved-exercise"]?.completed, "Explicit reset deleted exercise progress.");

const emptyStorage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", { value: emptyStorage, configurable: true });
assert(B2CourseProgressService.getStore().version === 2, "Empty localStorage was not initialized safely.");

const invalidStorage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", { value: invalidStorage, configurable: true });
invalidStorage.setItem(B2_COURSE_PROGRESS_KEY, "{invalid-json");
const originalConsoleError = console.error;
console.error = () => undefined;
const invalidStore = B2CourseProgressService.getStore();
console.error = originalConsoleError;
assert(invalidStore.version === 2 && Object.keys(invalidStore.exercises).length === 0, "Invalid JSON was not handled safely.");

Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });

const store = B2CourseProgressService.getStore();
const automatic = store.exercises["b2u01-e001"];
const guidedCompleted = store.exercises["b2u02-e039"];
const guidedReview = store.exercises["b2u03-e042"];
assert(automatic.correctCount === 1 && automatic.wrongCount === 1 && automatic.attempts === 2, "Automatic exercise progress counters are wrong.");
assert(guidedCompleted.completed && guidedCompleted.correctCount === 0, "Guided completion must not increment correctCount.");
assert(!guidedReview.completed && guidedReview.difficult && guidedReview.correctCount === 0, "Guided review state is wrong.");
assert(store.resume["1"].exerciseIndex === 7, "Resume position was not saved.");
assert(localStorage.getItem("dmt_progress") === null, "B2 tests touched the legacy progress key.");
assert(localStorage.getItem(B2_COURSE_PROGRESS_KEY) !== null, "B2 progress was not persisted under its own key.");

const unit5Summary = index.units.find((unit) => unit.unit === 5);
const unit8Summary = index.units.find((unit) => unit.unit === 8);
const unit9Summary = index.units.find((unit) => unit.unit === 9);
assert(unit5Summary && unit8Summary && unit9Summary, "Kapitel 5, 8, and 9 must be present.");

const loadVocabulary = (summary: B2CourseIndex["units"][number]) => JSON.parse(
  fs.readFileSync(path.join(root, summary.vocabularyFile), "utf8"),
) as B2CourseVocabularyFile;
const unit5Vocabulary = loadVocabulary(unit5Summary);
const unit8Vocabulary = loadVocabulary(unit8Summary);
const unit5TrainingItems = [
  ...unit5Vocabulary.items,
  ...(unit5Vocabulary.reusedVocabularyRefs ?? []),
];
const unit8TrainingItems = [
  ...unit8Vocabulary.items,
  ...(unit8Vocabulary.reusedVocabularyRefs ?? []),
];

const newKapitelStorage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", { value: newKapitelStorage, configurable: true });
B2CourseProgressService.migrateVocabularyProgress(5, unit5TrainingItems);
unit5TrainingItems.slice(0, 7).forEach((item, itemIndex) => {
  B2CourseProgressService.recordVocabularyReview(5, item.courseItemId, itemIndex < 5, unit5TrainingItems);
});
assert(
  B2CourseProgressService.getNextVocabularyItem(5, unit5TrainingItems)?.courseItemId === unit5TrainingItems[7].courseItemId,
  "Kapitel 5 did not resume at the first unseen item after seven answers.",
);
assert(
  B2CourseProgressService.getReviewVocabulary(5, unit5TrainingItems).length === 2,
  "Kapitel 5 review queue must contain exactly two items.",
);
const unit5CursorBeforeReview = B2CourseProgressService.getStore().vocabularyByUnit["5"].nextItemId;
const firstUnit5Review = B2CourseProgressService.getReviewVocabulary(5, unit5TrainingItems)[0];
B2CourseProgressService.recordVocabularyReview(5, firstUnit5Review.courseItemId, true, unit5TrainingItems, false);
assert(
  B2CourseProgressService.getReviewVocabulary(5, unit5TrainingItems).length === 1,
  "Mastering one Kapitel 5 review item did not reduce the queue to one.",
);
assert(
  B2CourseProgressService.getStore().vocabularyByUnit["5"].nextItemId === unit5CursorBeforeReview,
  "Kapitel 5 review mode changed the main cursor.",
);

assert(unit8Vocabulary.items.length === 72, "Kapitel 8 must contain 72 local vocabulary items.");
assert(unit8TrainingItems.length === 73, "Kapitel 8 must expose 73 vocabulary items including reused content.");
assert(
  !unit8Vocabulary.items.some((item) => item.courseItemId === "b2u08-v070")
  && unit8Vocabulary.reusedVocabularyRefs?.some((item) => item.courseItemId === "b2u02-v003"),
  "Kapitel 8 Kundschaft must reuse b2u02-v003 instead of duplicating b2u08-v070.",
);
for (const exerciseId of ["b2u08-e035", "b2u08-e039"]) {
  const exercise = exercises.find((item) => item.id === exerciseId);
  assert(exercise, `Missing Kapitel 8 exercise ${exerciseId}.`);
  const references = [...(exercise.vocabularyRefs ?? []), ...(exercise.reusedVocabularyRefs ?? [])];
  assert(references.includes("b2u02-v003") && !references.includes("b2u08-v070"), `Invalid Kundschaft reference: ${exerciseId}`);
}
B2CourseProgressService.setVocabularyStatus(2, "b2u02-v003", "known");
B2CourseProgressService.migrateVocabularyProgress(8, unit8TrainingItems);
assert(
  B2CourseProgressService.getVocabularyStatus(8, "b2u02-v003") === "unseen",
  "Kapitel 2 Kundschaft progress leaked into Kapitel 8.",
);
B2CourseProgressService.setVocabularyStatus(8, "b2u02-v003", "review");
assert(
  B2CourseProgressService.getVocabularyStatus(2, "b2u02-v003") === "known",
  "Kapitel 8 Kundschaft progress changed Kapitel 2.",
);

const convertedTypes: Record<string, B2CourseExercise["type"]> = {
  "b2u09-e006": "matching",
  "b2u09-e009": "sentence_order",
  "b2u09-e017": "sentence_order",
  "b2u09-e018": "fill_blank",
  "b2u09-e023": "fill_blank",
  "b2u09-e025": "fill_blank",
  "b2u09-e030": "sentence_order",
  "b2u09-e039": "sentence_order",
  "b2u09-e047": "matching",
  "b2u09-e053": "matching",
};
for (const [exerciseId, expectedType] of Object.entries(convertedTypes)) {
  const exercise = exercises.find((item) => item.id === exerciseId);
  assert(exercise && exercise.type === expectedType, `Unexpected converted type for ${exerciseId}.`);
  assert(isSupportedExercise(exercise), `Converted exercise is unsupported: ${exerciseId}`);
  if (exercise.type === "matching") {
    assert(exercise.pairs?.length && checkMatchingAnswer(exercise, exercise.answer as Record<string, string>), `Matching conversion failed: ${exerciseId}`);
  } else if (exercise.type === "sentence_order") {
    const selection = (exercise.tokens ?? []).map((token, tokenIndex) => `${tokenIndex}:${token}`);
    assert(exercise.tokens?.at(-1)?.endsWith(".") && checkOrderAnswer(exercise, selection), `Sentence order conversion failed: ${exerciseId}`);
  } else {
    assert(checkTextAnswer(exercise, String(exercise.answer)), `Fill blank conversion failed: ${exerciseId}`);
  }
}
assert(newKapitelStorage.getItem("dmt_progress") === null, "New Kapitel tests touched legacy progress.");

const finalUnitSummaries = index.units.filter((unit) => unit.unit >= 10 && unit.unit <= 14);
assert(finalUnitSummaries.length === 5, "Kapitel 10 through 14 must all be present.");
assert(
  finalUnitSummaries.every((unit, unitIndex) => unit.unit === unitIndex + 10),
  "Kapitel 10 through 14 are not ordered correctly.",
);

const finalUnitVocabulary = new Map(finalUnitSummaries.map((summary) => {
  const vocabulary = loadVocabulary(summary);
  return [summary.unit, {
    vocabulary,
    trainingItems: [
      ...vocabulary.items,
      ...(vocabulary.reusedVocabularyRefs ?? []),
    ],
  }];
}));
const expectedFinalUnitCounts: Record<number, { local: number; reused: number; exercises: number }> = {
  10: { local: 69, reused: 24, exercises: 55 },
  11: { local: 78, reused: 8, exercises: 55 },
  12: { local: 97, reused: 2, exercises: 56 },
  13: { local: 89, reused: 13, exercises: 54 },
  14: { local: 99, reused: 2, exercises: 55 },
};
for (const summary of finalUnitSummaries) {
  const entry = finalUnitVocabulary.get(summary.unit);
  assert(entry, `Missing Kapitel ${summary.unit} vocabulary.`);
  const expected = expectedFinalUnitCounts[summary.unit];
  assert(entry.vocabulary.items.length === expected.local, `Kapitel ${summary.unit} local vocabulary count is wrong.`);
  assert((entry.vocabulary.reusedVocabularyRefs ?? []).length === expected.reused, `Kapitel ${summary.unit} reused vocabulary count is wrong.`);
  assert(summary.exerciseCount === expected.exercises, `Kapitel ${summary.unit} exercise count is wrong.`);
}

const finalKapitelStorage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", { value: finalKapitelStorage, configurable: true });
const unit10TrainingItems = finalUnitVocabulary.get(10)?.trainingItems ?? [];
B2CourseProgressService.migrateVocabularyProgress(10, unit10TrainingItems);
unit10TrainingItems.slice(0, 8).forEach((item, itemIndex) => {
  B2CourseProgressService.recordVocabularyReview(10, item.courseItemId, itemIndex < 5, unit10TrainingItems);
});
assert(
  B2CourseProgressService.getNextVocabularyItem(10, unit10TrainingItems)?.courseItemId === unit10TrainingItems[8].courseItemId,
  "Kapitel 10 did not resume at the first unseen item after eight answers.",
);
assert(B2CourseProgressService.getReviewVocabulary(10, unit10TrainingItems).length === 3, "Kapitel 10 review queue must contain three items.");
const unit10MainCursor = B2CourseProgressService.getStore().vocabularyByUnit["10"].nextItemId;
const firstUnit10Review = B2CourseProgressService.getReviewVocabulary(10, unit10TrainingItems)[0];
B2CourseProgressService.recordVocabularyReview(10, firstUnit10Review.courseItemId, true, unit10TrainingItems, false);
assert(B2CourseProgressService.getReviewVocabulary(10, unit10TrainingItems).length === 2, "Kapitel 10 review queue did not shrink after mastering an item.");
assert(
  B2CourseProgressService.getStore().vocabularyByUnit["10"].nextItemId === unit10MainCursor,
  "Kapitel 10 review mode changed the main study cursor.",
);
assert(
  B2CourseProgressService.getNextVocabularyItem(10, unit10TrainingItems)?.courseItemId === unit10TrainingItems[8].courseItemId,
  "Kapitel 10 resume position was not restored from persisted progress.",
);

for (let unit = 11; unit <= 14; unit += 1) {
  const entry = finalUnitVocabulary.get(unit);
  assert(entry, `Missing Kapitel ${unit} progress fixture.`);
  B2CourseProgressService.migrateVocabularyProgress(unit, entry.trainingItems);
  const stats = B2CourseProgressService.getUnitStats(
    unit,
    entry.trainingItems.map((item) => item.courseItemId),
    [],
  );
  assert(stats.reviewedVocabulary === 0 && stats.unseenVocabulary === entry.trainingItems.length, `Kapitel ${unit} did not start independently at 0%.`);

  const reusedItem = entry.vocabulary.reusedVocabularyRefs?.[0];
  if (reusedItem) {
    const sourceUnit = Number(reusedItem.courseItemId.match(/^b2u(\d{2})-/)?.[1]);
    assert(Number.isInteger(sourceUnit), `Invalid reused courseItemId in Kapitel ${unit}.`);
    B2CourseProgressService.setVocabularyStatus(sourceUnit, reusedItem.courseItemId, "known");
    assert(
      B2CourseProgressService.getVocabularyStatus(unit, reusedItem.courseItemId) === "unseen",
      `Reused vocabulary progress leaked into Kapitel ${unit}.`,
    );
  }
}
assert(finalKapitelStorage.getItem("dmt_progress") === null, "Kapitel 10 through 14 tests touched legacy progress.");
assert(finalKapitelStorage.getItem(B2_COURSE_PROGRESS_KEY) !== null, "Kapitel 10 through 14 progress was not persisted separately.");

console.log(JSON.stringify({
  ok: true,
  exerciseCount: exercises.length,
  exerciseTypes: counts,
  progressKey: B2_COURSE_PROGRESS_KEY,
  vocabularyProgressScenarios: 15,
  kapitel5ResumeAndReview: true,
  kapitel8KundschaftIsolation: true,
  kapitel9ConvertedExercises: Object.keys(convertedTypes).length,
  kapitel10ResumeAndReview: true,
  kapitel11Through14IndependentProgress: true,
  lazyCourseIndexAndUnitCache: true,
}, null, 2));
