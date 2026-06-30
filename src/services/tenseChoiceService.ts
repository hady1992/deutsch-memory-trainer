import { TenseKey, Verb } from "../types";
import { detectAuxiliary, detectSeparable, detectVerbPrefix } from "./dataEnrichmentService.js";
import { normalizeAnswer } from "./textDisplayService";

export const TENSE_PRONOUNS = ["ich", "du", "er_sie_es", "wir", "ihr", "sie_Sie"];
export const TENSE_KEYS: TenseKey[] = ["praesens", "praeteritum", "perfekt", "plusquamperfekt", "futur1", "futur2"];

export function getVerbTenseValue(verb: Verb, tense: string, pronoun: string): string {
  const value = verb.tenses?.[tense as TenseKey]?.[pronoun];
  return typeof value === "string" ? value.trim() : "";
}

function uniquePush(target: string[], value?: string) {
  const clean = (value || "").trim();
  if (!clean) return;
  const key = normalizeAnswer(clean);
  if (!key || target.some((item) => normalizeAnswer(item) === key)) return;
  target.push(clean);
}

function scoreSimilarVerb(target: Verb, candidate: Verb): number {
  let score = 0;
  const targetAux = target.auxiliary || detectAuxiliary(target.perfekt || "");
  const candidateAux = candidate.auxiliary || detectAuxiliary(candidate.perfekt || "");
  const targetPrefix = target.prefix || detectVerbPrefix(target.infinitiv);
  const candidatePrefix = candidate.prefix || detectVerbPrefix(candidate.infinitiv);
  const targetSeparable = target.separable ?? detectSeparable(targetPrefix);
  const candidateSeparable = candidate.separable ?? detectSeparable(candidatePrefix);

  if (target.type && target.type === candidate.type) score += 3;
  if (targetAux && targetAux === candidateAux) score += 3;
  if (targetSeparable === candidateSeparable) score += 4;
  if (target.level && target.level === candidate.level) score += 1;
  if (Math.abs((target.infinitiv || "").length - (candidate.infinitiv || "").length) <= 3) score += 1;

  return score;
}

export function generateTenseChoiceOptions(
  verb: Verb,
  allVerbs: Verb[],
  tense: string,
  pronoun: string,
  count = 4
): string[] {
  const correctAnswer = getVerbTenseValue(verb, tense, pronoun);
  const distractors: string[] = [];

  TENSE_PRONOUNS
    .filter((candidatePronoun) => candidatePronoun !== pronoun)
    .forEach((candidatePronoun) => uniquePush(distractors, getVerbTenseValue(verb, tense, candidatePronoun)));

  TENSE_KEYS
    .filter((candidateTense) => candidateTense !== tense)
    .forEach((candidateTense) => uniquePush(distractors, getVerbTenseValue(verb, candidateTense, pronoun)));

  allVerbs
    .filter((candidate) => candidate.id !== verb.id && getVerbTenseValue(candidate, tense, pronoun))
    .map((candidate) => ({
      candidate,
      score: scoreSimilarVerb(verb, candidate),
    }))
    .sort((a, b) => b.score - a.score || a.candidate.infinitiv.localeCompare(b.candidate.infinitiv, "de"))
    .forEach(({ candidate }) => uniquePush(distractors, getVerbTenseValue(candidate, tense, pronoun)));

  const normalizedCorrect = normalizeAnswer(correctAnswer);
  const options = [
    correctAnswer,
    ...distractors.filter((value) => normalizeAnswer(value) !== normalizedCorrect).slice(0, count - 1),
  ].filter(Boolean);

  return [...options].sort(() => Math.random() - 0.5).slice(0, count);
}
