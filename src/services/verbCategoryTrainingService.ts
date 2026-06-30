import { Verb, VerbCategory, VerbPracticeExample } from "../types";
import { normalizeGermanText } from "./textDisplayService";

type CategorySourceField =
  | "verbCategoryTraining.expandedPracticeExamples"
  | "expandedExamples.categoryPracticeExamples"
  | "expandedExamples.formExamples"
  | "expandedExamples.studyExamples"
  | "fallback";

export interface VerbCategoryQuestion {
  id: string;
  sourceField: CategorySourceField;
  sourceExampleType?: string;
  categoryId?: string;
  promptAr: string;
  promptDe?: string;
  answer: string;
  answerLang: "de" | "ar";
  options?: string[];
  visibleText?: string;
  speakBeforeAnswer?: string;
  correctAnswer?: string;
  speakAfterAnswer?: string;
  exampleDe?: string;
  exampleAr?: string;
  noteAr?: string;
  hintAr?: string;
}

interface ExampleCandidate {
  sourceField: CategorySourceField;
  example: VerbPracticeExample;
}

function shuffle<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const trimmed = String(value || "").trim();
    const key = trimmed.toLocaleLowerCase("de-DE");
    if (!trimmed || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function firstString(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

function categoryTitle(category: VerbCategory | undefined, language: "de" | "ar") {
  if (!category) return "";
  return language === "ar" ? category.title_ar : category.title_de;
}

function getCategoryCandidates(verb: Verb): ExampleCandidate[] {
  return [
    ...(verb.verbCategoryTraining?.expandedPracticeExamples || []).map((example) => ({
      sourceField: "verbCategoryTraining.expandedPracticeExamples" as const,
      example,
    })),
    ...(verb.expandedExamples?.categoryPracticeExamples || []).map((example) => ({
      sourceField: "expandedExamples.categoryPracticeExamples" as const,
      example,
    })),
    ...(verb.expandedExamples?.formExamples || []).map((example) => ({
      sourceField: "expandedExamples.formExamples" as const,
      example,
    })),
    ...(verb.expandedExamples?.studyExamples || []).map((example) => ({
      sourceField: "expandedExamples.studyExamples" as const,
      example,
    })),
  ];
}

function meaningOptions(correct: string, allVerbs: Verb[]) {
  return unique([
    correct,
    ...shuffle(allVerbs.map((verb) => verb.arabic).filter(Boolean)).slice(0, 8),
  ]).slice(0, 4);
}

function categoryOptions(correct: string, categories: VerbCategory[], language: "de" | "ar") {
  return unique([
    correct,
    ...shuffle(categories.map((category) => categoryTitle(category, language))).slice(0, 8),
  ]).slice(0, 4);
}

function normalizeOptions(correct: string, options?: string[]) {
  if (!options?.length) return undefined;
  return unique([correct, ...options]).slice(0, Math.max(2, options.length));
}

function exampleDe(example: VerbPracticeExample): string {
  return normalizeGermanText(example.example_de || example.de || example.example);
}

function exampleAr(example: VerbPracticeExample): string {
  return String(example.example_ar || example.ar || "").trim();
}

function buildFromCandidate(
  verb: Verb,
  allVerbs: Verb[],
  categories: VerbCategory[],
  candidate: ExampleCandidate,
  selectedCategoryId: string | null,
  language: "de" | "ar"
): VerbCategoryQuestion | null {
  const example = candidate.example;
  const type = example.type || "category";
  const baseId = `${candidate.sourceField}-${example.id || type}`;
  const promptAr = firstString(example.question_ar || example.title_ar || example.hint_ar);
  const promptDe = firstString(example.question_de || example.de);
  const noteAr = firstString(example.note_ar || example.explanation_ar);
  const hintAr = firstString(example.hint_ar);

  if (type === "meaning_choice_or_write" && example.answer_ar) {
    const answer = firstString(example.answer_ar);
    return {
      id: baseId,
      sourceField: candidate.sourceField,
      sourceExampleType: type,
      categoryId: selectedCategoryId || undefined,
      promptAr: promptAr || "ما معنى هذا الفعل؟",
      promptDe: promptDe || verb.infinitiv,
      answer,
      answerLang: "ar",
      options: normalizeOptions(answer, example.options) || meaningOptions(answer, allVerbs),
      exampleDe: exampleDe(example),
      exampleAr: exampleAr(example),
      noteAr,
      hintAr,
    };
  }

  if (type === "write_german_from_arabic" && example.answer_de) {
    return {
      id: baseId,
      sourceField: candidate.sourceField,
      sourceExampleType: type,
      categoryId: selectedCategoryId || undefined,
      promptAr: promptAr || `اكتب الفعل الألماني بمعنى: ${verb.arabic}`,
      promptDe,
      answer: firstString(example.answer_de),
      answerLang: "de",
      exampleDe: exampleDe(example),
      exampleAr: exampleAr(example),
      noteAr,
      hintAr,
    };
  }

  if (type === "category_recognition") {
    const answerCategoryIds = Array.isArray(example.answerCategoryIds) ? example.answerCategoryIds : [];
    const categoryId = selectedCategoryId && answerCategoryIds.includes(selectedCategoryId)
      ? selectedCategoryId
      : answerCategoryIds[0] || verb.categoryIds?.[0];
    const category = categories.find((item) => item.id === categoryId);
    const answer = categoryTitle(category, language) || firstString(example.answer_ar);
    if (!answer) return null;
    return {
      id: `${baseId}-${categoryId || "category"}`,
      sourceField: candidate.sourceField,
      sourceExampleType: type,
      categoryId,
      promptAr: promptAr || `إلى أي فئة ينتمي الفعل «${verb.infinitiv}»؟`,
      promptDe: promptDe || verb.infinitiv,
      answer,
      answerLang: language,
      options: categoryOptions(answer, categories, language),
      exampleDe: exampleDe(example),
      exampleAr: exampleAr(example),
      noteAr,
      hintAr,
    };
  }

  if (type === "usage_sentence" && example.ar) {
    const answer = firstString(example.ar);
    return {
      id: baseId,
      sourceField: candidate.sourceField,
      sourceExampleType: type,
      categoryId: selectedCategoryId || undefined,
      promptAr: "ما معنى هذا المثال؟",
      promptDe: example.de,
      answer,
      answerLang: "ar",
      exampleDe: normalizeGermanText(example.de),
      exampleAr: answer,
      noteAr,
      hintAr,
    };
  }

  const answer = firstString(example.answer || example.answer_de || example.answer_ar);
  if (!answer) return null;

  const answerLang = /[اأإآء-ي]/.test(answer) ? "ar" : "de";
  return {
    id: baseId,
    sourceField: candidate.sourceField,
    sourceExampleType: type,
    categoryId: selectedCategoryId || undefined,
    promptAr: promptAr || `أجب عن سؤال الفئة للفعل «${verb.infinitiv}».`,
    promptDe,
    answer,
    answerLang,
    options: normalizeOptions(answer, example.options),
    exampleDe: exampleDe(example),
    exampleAr: exampleAr(example),
    noteAr,
    hintAr,
  };
}

export function hasVerbCategoryTraining(verb: Verb): boolean {
  return getCategoryCandidates(verb).length > 0 || Boolean(verb.arabic || verb.example_de || verb.example_ar);
}

export function buildVerbCategoryQuestion(
  verb: Verb,
  allVerbs: Verb[],
  categories: VerbCategory[],
  selectedCategoryId: string | null,
  language: "de" | "ar"
): VerbCategoryQuestion | null {
  const candidates = shuffle(getCategoryCandidates(verb));
  for (const candidate of candidates) {
    const question = buildFromCandidate(verb, allVerbs, categories, candidate, selectedCategoryId, language);
    if (question) return question;
  }

  if (!verb.arabic) return null;
  return {
    id: "fallback-meaning",
    sourceField: "fallback",
    sourceExampleType: "meaning_choice_or_write",
    categoryId: selectedCategoryId || undefined,
    promptAr: "ما معنى هذا الفعل؟",
    promptDe: verb.infinitiv,
    answer: verb.arabic,
    answerLang: "ar",
    options: meaningOptions(verb.arabic, allVerbs),
    exampleDe: normalizeGermanText(verb.example_de),
    exampleAr: verb.example_ar || "",
  };
}
