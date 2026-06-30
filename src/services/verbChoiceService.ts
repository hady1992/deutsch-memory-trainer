import { TenseKey, Verb } from "../types";
import { normalizeAnswer } from "./textDisplayService";
import {
  detectAuxiliary,
  detectSeparable,
  detectVerbPrefix,
} from "./dataEnrichmentService.js";

export type VerbChoiceQuestionType = "arabic" | "praesens" | "praeteritum" | "perfekt";

const PRONOUNS = ["ich", "du", "er_sie_es", "wir", "ihr", "sie_Sie"];
const TENSES: TenseKey[] = ["praesens", "praeteritum", "perfekt", "plusquamperfekt", "futur1", "futur2"];

const ARABIC_SEMANTIC_GROUPS: Array<{ name: string; patterns: RegExp[] }> = [
  { name: "deception", patterns: [/خدع|يغش|غش|كذب|يكذب|سرق|يسرق|خفي|يخفي|كتم|يكتم/] },
  { name: "speech", patterns: [/قال|يقول|تحدث|يتحدث|سأل|يسأل|أجاب|يجيب|شرح|يشرح|ذكر|يذكر/] },
  { name: "movement", patterns: [/ذهب|يذهب|جاء|يأتي|مشى|يمشي|ركض|يركض|سافر|يسافر|قاد|يقود/] },
  { name: "thinking", patterns: [/فكر|يفكر|عرف|يعرف|تذكر|يتذكر|نسي|ينسى|قرر|يقرر/] },
  { name: "work", patterns: [/عمل|يعمل|نجح|ينجح|فشل|يفشل|نظم|ينظم|بدأ|يبدأ|أنهى|ينهي/] },
  { name: "emotion", patterns: [/فرح|يفرح|حزن|يحزن|خاف|يخاف|أحب|يحب|كره|يكره/] },
];

function uniquePush(target: string[], value?: string) {
  const clean = (value || "").trim();
  if (!clean) return;
  const key = normalizeAnswer(clean);
  if (!key || target.some((item) => normalizeAnswer(item) === key)) return;
  target.push(clean);
}

function extractParticiple2(perfekt?: string): string {
  const text = (perfekt || "").trim();
  if (!text) return "";
  return text
    .replace(/^(hat|habe|hast|haben|habt|ist|bin|bist|sind|seid)\s+/i, "")
    .trim();
}

function swapPerfectAuxiliary(perfekt?: string): string {
  const text = (perfekt || "").trim();
  if (/^hat\s+/i.test(text)) return text.replace(/^hat\s+/i, "ist ");
  if (/^ist\s+/i.test(text)) return text.replace(/^ist\s+/i, "hat ");
  return "";
}

function getTenseForms(verb: Verb, tense?: TenseKey): string[] {
  const forms: string[] = [];
  if (tense) {
    PRONOUNS.forEach((pronoun) => uniquePush(forms, verb.tenses?.[tense]?.[pronoun]));
    return forms;
  }

  TENSES.forEach((tenseKey) => {
    PRONOUNS.forEach((pronoun) => uniquePush(forms, verb.tenses?.[tenseKey]?.[pronoun]));
  });
  return forms;
}

function getGermanCorrectAnswer(verb: Verb, questionType: VerbChoiceQuestionType): string {
  if (questionType === "praesens") return verb.praesens || getTenseForms(verb, "praesens")[2] || "";
  if (questionType === "praeteritum") return verb.praeteritum || "";
  if (questionType === "perfekt") return verb.perfekt || "";
  return verb.arabic || "";
}

export function getVerbChoiceCorrectAnswer(verb: Verb, questionType: VerbChoiceQuestionType): string {
  return questionType === "arabic" ? verb.arabic : getGermanCorrectAnswer(verb, questionType);
}

function sameVerbDistractors(verb: Verb, questionType: VerbChoiceQuestionType): string[] {
  const values: string[] = [];
  const participle2 = verb.participle2 || extractParticiple2(verb.perfekt);

  if (questionType === "praesens") {
    getTenseForms(verb, "praesens").forEach((form) => uniquePush(values, form));
    uniquePush(values, verb.infinitiv);
    uniquePush(values, verb.praeteritum);
    uniquePush(values, verb.perfekt);
    uniquePush(values, participle2);
    return values;
  }

  if (questionType === "praeteritum") {
    uniquePush(values, verb.praesens);
    uniquePush(values, verb.perfekt);
    uniquePush(values, participle2);
    uniquePush(values, verb.infinitiv);
    getTenseForms(verb).forEach((form) => uniquePush(values, form));
    return values;
  }

  if (questionType === "perfekt") {
    uniquePush(values, swapPerfectAuxiliary(verb.perfekt));
    uniquePush(values, verb.praeteritum);
    uniquePush(values, verb.praesens);
    uniquePush(values, participle2);
    uniquePush(values, verb.infinitiv);
    getTenseForms(verb).forEach((form) => uniquePush(values, form));
  }

  return values;
}

function semanticGroups(value?: string): string[] {
  const text = value || "";
  return ARABIC_SEMANTIC_GROUPS
    .filter((group) => group.patterns.some((pattern) => pattern.test(text)))
    .map((group) => group.name);
}

function scoreSimilarVerb(target: Verb, candidate: Verb, questionType: VerbChoiceQuestionType): number {
  let score = 0;
  const targetAux = target.auxiliary || detectAuxiliary(target.perfekt || "");
  const candidateAux = candidate.auxiliary || detectAuxiliary(candidate.perfekt || "");
  const targetPrefix = target.prefix || detectVerbPrefix(target.infinitiv);
  const candidatePrefix = candidate.prefix || detectVerbPrefix(candidate.infinitiv);
  const targetSeparable = target.separable ?? detectSeparable(targetPrefix);
  const candidateSeparable = candidate.separable ?? detectSeparable(candidatePrefix);

  if (target.type && candidate.type === target.type) score += 4;
  if (targetAux && candidateAux === targetAux) score += 3;
  if (targetSeparable === candidateSeparable) score += 2;
  if (target.level && candidate.level === target.level) score += 1;
  if (Math.abs((candidate.infinitiv || "").length - (target.infinitiv || "").length) <= 3) score += 1;
  if (questionType !== "arabic" && getGermanCorrectAnswer(candidate, questionType)) score += 2;

  const targetGroups = semanticGroups(target.arabic);
  const candidateGroups = semanticGroups(candidate.arabic);
  if (targetGroups.some((group) => candidateGroups.includes(group))) score += 6;

  return score;
}

function similarVerbDistractors(
  verb: Verb,
  allVerbs: Verb[],
  questionType: VerbChoiceQuestionType
): string[] {
  return allVerbs
    .filter((candidate) => candidate.id !== verb.id)
    .map((candidate) => ({
      candidate,
      score: scoreSimilarVerb(verb, candidate, questionType),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.candidate.infinitiv.localeCompare(b.candidate.infinitiv, "de"))
    .map(({ candidate }) =>
      questionType === "arabic"
        ? candidate.arabic
        : getGermanCorrectAnswer(candidate, questionType)
    )
    .filter(Boolean);
}

function fillGenericGermanFallbacks(verb: Verb, values: string[]) {
  uniquePush(values, verb.infinitiv);
  uniquePush(values, verb.praesens);
  uniquePush(values, verb.praeteritum);
  uniquePush(values, verb.perfekt);
  uniquePush(values, verb.participle2 || extractParticiple2(verb.perfekt));
}

function shuffle<T>(values: T[]): T[] {
  return [...values].sort(() => Math.random() - 0.5);
}

export function generateVerbChoiceOptions(
  verb: Verb,
  allVerbs: Verb[],
  questionType: VerbChoiceQuestionType,
  count = 4
): string[] {
  const correctAnswer = getVerbChoiceCorrectAnswer(verb, questionType);
  const distractors: string[] = [];

  if (questionType === "arabic") {
    similarVerbDistractors(verb, allVerbs, questionType).forEach((value) => uniquePush(distractors, value));
  } else {
    sameVerbDistractors(verb, questionType).forEach((value) => uniquePush(distractors, value));
    similarVerbDistractors(verb, allVerbs, questionType).forEach((value) => uniquePush(distractors, value));
    fillGenericGermanFallbacks(verb, distractors);
  }

  const normalizedCorrect = normalizeAnswer(correctAnswer);
  const usableDistractors = distractors.filter((value) => normalizeAnswer(value) !== normalizedCorrect);
  const options = [correctAnswer, ...usableDistractors.slice(0, count - 1)].filter(Boolean);

  return shuffle(options).slice(0, count);
}
