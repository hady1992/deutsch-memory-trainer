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
const phaseRoots = ["phase-1", "phase-2"];

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

  for (const phaseRoot of phaseRoots) {
    const root = path.join(dataRoot, phaseRoot);
    const index = await readJson<B2GrammarPhaseIndex>(path.join(root, "index.json"));
    if (index.topics.length !== index.topicCount) errors.push(`${phaseRoot}: topicCount mismatch`);
    let phaseExerciseCount = 0;

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
  if (topicIds.size !== 20) errors.push(`Expected 20 topics, found ${topicIds.size}`);
  if (exerciseCount !== 464 || exerciseIds.size !== 464) errors.push(`Expected 464 unique exercises, found ${exerciseCount}/${exerciseIds.size}`);

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
