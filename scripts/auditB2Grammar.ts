import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SUPPORTED_B2_GRAMMAR_TYPES,
  validateB2GrammarExercise,
} from "../src/features/b2-grammar/b2GrammarService";
import type {
  B2GrammarExerciseDocument,
  B2GrammarLesson,
  B2GrammarPhaseIndex,
} from "../src/features/b2-grammar/types";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = path.join(projectRoot, "public", "data", "b2-grammar");
const phaseSpecs = [
  { root: "phase-1", phaseId: "grammar-phase-1", firstTopic: 1, lastTopic: 10, exerciseCount: 228 },
  { root: "phase-2", phaseId: "grammar-phase-2", firstTopic: 11, lastTopic: 20, exerciseCount: 236 },
  { root: "phase-3", phaseId: "grammar-phase-3", firstTopic: 21, lastTopic: 30, exerciseCount: 246 },
  { root: "phase-4", phaseId: "grammar-phase-4", firstTopic: 31, lastTopic: 40, exerciseCount: 246 },
  { root: "phase-5", phaseId: "grammar-phase-5", firstTopic: 41, lastTopic: 50, exerciseCount: 246 },
] as const;

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function audit(): Promise<void> {
  const errors: string[] = [];
  const topicIds = new Set<string>();
  const exerciseIds = new Set<string>();
  const relatedTopicIds: Array<{ source: string; related: string }> = [];
  const typeCounts = new Map<string, number>();
  let exerciseCount = 0;

  for (const spec of phaseSpecs) {
    const phaseRoot = spec.root;
    const root = path.join(dataRoot, phaseRoot);
    const index = await readJson<B2GrammarPhaseIndex>(path.join(root, "index.json"));
    if (index.phaseId !== spec.phaseId) errors.push(`${phaseRoot}: phaseId mismatch`);
    if (index.topicCount !== 10) errors.push(`${phaseRoot}: expected 10 topics, found ${index.topicCount}`);
    if (index.exerciseCount !== spec.exerciseCount) {
      errors.push(`${phaseRoot}: expected ${spec.exerciseCount} exercises, found ${index.exerciseCount}`);
    }
    if (index.topics.length !== index.topicCount) errors.push(`${phaseRoot}: topicCount mismatch`);
    let phaseExerciseCount = 0;

    const expectedTopicIds = Array.from(
      { length: spec.lastTopic - spec.firstTopic + 1 },
      (_, offset) => `gr-${String(spec.firstTopic + offset).padStart(2, "0")}`,
    );
    const actualTopicIds = index.topics.map((topic) => topic.id);
    if (actualTopicIds.join("|") !== expectedTopicIds.join("|")) {
      errors.push(`${phaseRoot}: topic IDs or order do not match ${expectedTopicIds[0]} through ${expectedTopicIds.at(-1)}`);
    }

    for (const topic of index.topics) {
      if (topicIds.has(topic.id)) errors.push(`Duplicate topic id: ${topic.id}`);
      topicIds.add(topic.id);
      const lessonPath = path.resolve(root, topic.lessonPath);
      const exercisesPath = path.resolve(root, topic.exercisesPath);
      if (!lessonPath.startsWith(root) || !exercisesPath.startsWith(root)) {
        errors.push(`${topic.id}: path escapes phase root`);
        continue;
      }
      const [lesson, document] = await Promise.all([
        readJson<B2GrammarLesson>(lessonPath),
        readJson<B2GrammarExerciseDocument>(exercisesPath),
      ]);
      if (lesson.topicId !== topic.id || document.topicId !== topic.id) errors.push(`${topic.id}: topic reference mismatch`);
      if (document.exercises.length !== topic.exerciseCount || document.exerciseCount !== topic.exerciseCount) {
        errors.push(`${topic.id}: exerciseCount mismatch`);
      }
      if (!lesson.title_de || !lesson.title_ar || !lesson.explanation_de || !lesson.explanation_ar) {
        errors.push(`${topic.id}: bilingual lesson content missing`);
      }
      lesson.relatedTopics.forEach((related) => relatedTopicIds.push({ source: topic.id, related }));
      phaseExerciseCount += document.exercises.length;

      for (const exercise of document.exercises) {
        try {
          validateB2GrammarExercise(exercise, topic.id);
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
        if (exerciseIds.has(exercise.id)) errors.push(`Duplicate exercise id: ${exercise.id}`);
        exerciseIds.add(exercise.id);
        typeCounts.set(exercise.type, (typeCounts.get(exercise.type) || 0) + 1);
      }
    }

    if (phaseExerciseCount !== index.exerciseCount) errors.push(`${phaseRoot}: total exerciseCount mismatch`);
    exerciseCount += phaseExerciseCount;
  }

  relatedTopicIds.forEach(({ source, related }) => {
    if (!topicIds.has(related)) errors.push(`${source}: unknown related topic ${related}`);
  });
  for (const type of typeCounts.keys()) {
    if (!SUPPORTED_B2_GRAMMAR_TYPES.includes(type as never)) errors.push(`Unsupported type: ${type}`);
  }
  if (topicIds.size !== 50) errors.push(`Expected 50 topics, found ${topicIds.size}`);
  if (exerciseCount !== 1202 || exerciseIds.size !== 1202) errors.push(`Expected 1202 unique exercises, found ${exerciseCount}/${exerciseIds.size}`);

  console.log("B2 grammar content audit");
  console.log(`Topics: ${topicIds.size}`);
  console.log(`Exercises: ${exerciseCount}`);
  console.log(`Unique exercise IDs: ${exerciseIds.size}`);
  console.log(`Types: ${[...typeCounts.entries()].sort().map(([type, count]) => `${type}=${count}`).join(", ")}`);
  console.log(`Supported engine types: ${SUPPORTED_B2_GRAMMAR_TYPES.length}`);
  if (errors.length) {
    errors.forEach((error) => console.error(`ERROR: ${error}`));
    process.exitCode = 1;
    return;
  }
  console.log("Result: PASSED");
}

audit().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
