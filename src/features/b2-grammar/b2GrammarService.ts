import {
  B2GrammarCourse,
  B2GrammarExercise,
  B2GrammarExerciseDocument,
  B2GrammarExerciseType,
  B2GrammarLesson,
  B2GrammarPhaseIndex,
  B2GrammarTopic,
} from "./types";

export const B2_GRAMMAR_DATA_VERSION = "2026-07-16-phases-1-4";

export const SUPPORTED_B2_GRAMMAR_TYPES: readonly B2GrammarExerciseType[] = [
  "multiple_choice",
  "fill_blank",
  "matching",
  "sentence_order",
  "sentence_build",
  "verb_form",
  "email_order",
  "dialogue_choice",
  "scenario_choice",
  "guided_writing",
  "guided_speaking",
] as const;

const PHASE_ROOTS = [
  "/data/b2-grammar/phase-1",
  "/data/b2-grammar/phase-2",
  "/data/b2-grammar/phase-3",
  "/data/b2-grammar/phase-4",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function fetchJson<T>(url: string): Promise<T> {
  const separator = url.includes("?") ? "&" : "?";
  const response = await fetch(`${url}${separator}v=${B2_GRAMMAR_DATA_VERSION}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`B2 grammar data request failed (${response.status}): ${url}`);
  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new Error(`B2 grammar JSON could not be parsed: ${url}`, { cause: error });
  }
}

function assertText(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing B2 grammar field: ${field}`);
}

export function validateB2GrammarExercise(exercise: unknown, topicId: string): asserts exercise is B2GrammarExercise {
  if (!isRecord(exercise)) throw new Error(`Invalid exercise object in ${topicId}`);
  assertText(exercise.id, `${topicId}.exercise.id`);
  if (exercise.topicId !== topicId) throw new Error(`Exercise ${exercise.id} has topicId ${String(exercise.topicId)}`);
  if (!SUPPORTED_B2_GRAMMAR_TYPES.includes(exercise.type as B2GrammarExerciseType)) {
    throw new Error(`Unsupported exercise type ${String(exercise.type)} in ${exercise.id}`);
  }
  assertText(exercise.prompt_de, `${exercise.id}.prompt_de`);
  assertText(exercise.prompt_ar, `${exercise.id}.prompt_ar`);
  assertText(exercise.explanation_de, `${exercise.id}.explanation_de`);
  assertText(exercise.explanation_ar, `${exercise.id}.explanation_ar`);
  if (exercise.answer === undefined || exercise.answer === null) throw new Error(`Missing answer in ${exercise.id}`);

  if (["multiple_choice", "dialogue_choice", "scenario_choice"].includes(String(exercise.type))) {
    if (!Array.isArray(exercise.options) || exercise.options.length < 2) throw new Error(`Invalid options in ${exercise.id}`);
    const answer = String(exercise.answer);
    if (exercise.options.filter((option) => option === answer).length !== 1) {
      throw new Error(`Correct answer must appear exactly once in ${exercise.id}`);
    }
  }
  if (exercise.type === "matching" && (!Array.isArray(exercise.pairs) || !exercise.pairs.length)) {
    throw new Error(`Missing matching pairs in ${exercise.id}`);
  }
  if (["sentence_order", "email_order"].includes(String(exercise.type)) && (!Array.isArray(exercise.tokens) || !exercise.tokens.length)) {
    throw new Error(`Missing order tokens in ${exercise.id}`);
  }
}

export function validateB2GrammarTopic(
  phase: B2GrammarPhaseIndex,
  topicIndex: B2GrammarPhaseIndex["topics"][number],
  lesson: B2GrammarLesson,
  exerciseDocument: B2GrammarExerciseDocument,
): B2GrammarTopic {
  if (lesson.topicId !== topicIndex.id || exerciseDocument.topicId !== topicIndex.id) {
    throw new Error(`B2 grammar topic reference mismatch for ${topicIndex.id}`);
  }
  if (!Array.isArray(exerciseDocument.exercises) || exerciseDocument.exercises.length !== topicIndex.exerciseCount) {
    throw new Error(`B2 grammar exercise count mismatch for ${topicIndex.id}`);
  }
  exerciseDocument.exercises.forEach((exercise) => validateB2GrammarExercise(exercise, topicIndex.id));
  return { phaseId: phase.phaseId, index: topicIndex, lesson, exercises: exerciseDocument.exercises };
}

async function loadPhase(root: string): Promise<{ phase: B2GrammarPhaseIndex; topics: B2GrammarTopic[] }> {
  const phase = await fetchJson<B2GrammarPhaseIndex>(`${root}/index.json`);
  if (!Array.isArray(phase.topics) || phase.topics.length !== phase.topicCount) {
    throw new Error(`B2 grammar phase count mismatch for ${phase.phaseId || root}`);
  }

  const topics = await Promise.all(
    phase.topics.map(async (topic) => {
      const [lesson, exerciseDocument] = await Promise.all([
        fetchJson<B2GrammarLesson>(`${root}/${topic.lessonPath}`),
        fetchJson<B2GrammarExerciseDocument>(`${root}/${topic.exercisesPath}`),
      ]);
      return validateB2GrammarTopic(phase, topic, lesson, exerciseDocument);
    }),
  );
  const actualCount = topics.reduce((sum, topic) => sum + topic.exercises.length, 0);
  if (actualCount !== phase.exerciseCount) throw new Error(`B2 grammar phase exercise total mismatch for ${phase.phaseId}`);
  return { phase, topics };
}

let coursePromise: Promise<B2GrammarCourse> | null = null;

export function loadB2GrammarCourse(): Promise<B2GrammarCourse> {
  if (!coursePromise) {
    coursePromise = Promise.all(PHASE_ROOTS.map(loadPhase)).then((loaded) => {
      const phases = loaded.map((item) => item.phase);
      const topics = loaded.flatMap((item) => item.topics).sort((a, b) => a.index.order - b.index.order);
      const ids = topics.flatMap((topic) => topic.exercises.map((exercise) => exercise.id));
      if (topics.length !== 40 || ids.length !== 956 || new Set(ids).size !== ids.length) {
        throw new Error(`B2 grammar course validation failed: ${topics.length} topics, ${ids.length} exercises`);
      }
      return { phases, topics, exerciseCount: ids.length };
    }).catch((error) => {
      coursePromise = null;
      console.error("B2 grammar loading failed", error);
      throw error;
    });
  }
  return coursePromise;
}

export function findB2GrammarTopic(course: B2GrammarCourse, topicId: string): B2GrammarTopic | undefined {
  return course.topics.find((topic) => topic.index.id === topicId);
}
