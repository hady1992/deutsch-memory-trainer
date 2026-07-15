import { B2_EXERCISE_TYPES, type B2CourseExercise } from "./types";

export function normalizeAnswer(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/[.!?,;:]+$/u, "")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("de-DE");
}

export function isSupportedExercise(exercise: B2CourseExercise): boolean {
  return B2_EXERCISE_TYPES.includes(exercise.type as (typeof B2_EXERCISE_TYPES)[number]);
}

export function isChoiceExercise(exercise: B2CourseExercise): boolean {
  return ["multiple_choice", "dialogue_choice", "scenario_choice"].includes(exercise.type);
}

export function isTextExercise(exercise: B2CourseExercise): boolean {
  return ["fill_blank", "verb_form", "sentence_build"].includes(exercise.type);
}

export function isOrderExercise(exercise: B2CourseExercise): boolean {
  return ["sentence_order", "email_order"].includes(exercise.type);
}

export function isSelfCheckExercise(exercise: B2CourseExercise): boolean {
  return exercise.type === "guided_writing" || exercise.type === "guided_speaking";
}

export function getAcceptedAnswers(exercise: B2CourseExercise): string[] {
  const explicit = Array.isArray(exercise.acceptedAnswers) ? exercise.acceptedAnswers : [];
  const answer = typeof exercise.answer === "string" ? [exercise.answer] : [];
  return [...new Set([...explicit, ...answer].map(normalizeAnswer).filter(Boolean))];
}

export function checkTextAnswer(exercise: B2CourseExercise, value: string): boolean {
  return getAcceptedAnswers(exercise).includes(normalizeAnswer(value));
}

export function checkChoiceAnswer(exercise: B2CourseExercise, value: string): boolean {
  return normalizeAnswer(value) === normalizeAnswer(exercise.answer);
}

export function checkOrderAnswer(exercise: B2CourseExercise, selection: string[]): boolean {
  if (Array.isArray(exercise.answer)) {
    const expected = exercise.answer.map(normalizeAnswer);
    const selected = selection.map(normalizeAnswer);
    return expected.length === selected.length
      && expected.every((value, index) => value === selected[index]);
  }
  const source = exercise.blocks?.map((block) => ({ id: block.id, text: block.text }))
    ?? exercise.tokens?.map((token, index) => ({ id: `${index}:${token}`, text: token }))
    ?? [];
  const sentence = selection
    .map((id) => source.find((candidate) => candidate.id === id)?.text ?? id)
    .join(" ");
  return normalizeAnswer(sentence) === normalizeAnswer(exercise.answer);
}

export function checkMatchingAnswer(
  exercise: B2CourseExercise,
  selection: Record<string, string>,
): boolean {
  if (!exercise.answer || typeof exercise.answer !== "object" || Array.isArray(exercise.answer)) return false;
  const expected = exercise.answer as Record<string, string>;
  return Object.keys(expected).length > 0
    && Object.entries(expected).every(([left, right]) => selection[left] === right);
}

export function getDisplayAnswer(exercise: B2CourseExercise): string {
  if (Array.isArray(exercise.answer)) return exercise.answer.join(" -> ");
  if (exercise.answer && typeof exercise.answer === "object") {
    return Object.entries(exercise.answer as Record<string, unknown>)
      .map(([left, right]) => `${left}: ${Array.isArray(right) ? right.join(", ") : String(right)}`)
      .join("\n");
  }
  return String(exercise.answer ?? "");
}

export function getSelfCheckItems(exercise: B2CourseExercise): string[] {
  if (!exercise.answer || typeof exercise.answer !== "object" || Array.isArray(exercise.answer)) return [];
  const concepts = (exercise.answer as { requiredConcepts?: unknown }).requiredConcepts;
  return Array.isArray(concepts) ? concepts.filter((item): item is string => typeof item === "string") : [];
}
