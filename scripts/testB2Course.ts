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
import type { B2CourseExercise, B2CourseIndex } from "../src/features/b2-course/types";

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

Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });

const root = path.resolve("public/data/courses/b2-course");
const index = JSON.parse(fs.readFileSync(path.join(root, "index.json"), "utf8")) as B2CourseIndex;
const exercises: B2CourseExercise[] = index.units.flatMap((unit) => {
  const file = JSON.parse(fs.readFileSync(path.join(root, unit.exercisesFile), "utf8"));
  return file.exercises as B2CourseExercise[];
});

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
B2CourseProgressService.recordVocabularyReview("b2u01-v001", false);
B2CourseProgressService.setResume(1, { exerciseIndex: 7, lastMode: "exercises" });

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

console.log(JSON.stringify({ ok: true, exerciseCount: exercises.length, exerciseTypes: counts, progressKey: B2_COURSE_PROGRESS_KEY }, null, 2));
