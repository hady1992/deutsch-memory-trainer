import { Vocabulary } from "../types";
import { normalizeGermanText } from "./textDisplayService";
import { selectArabicDistractors } from "./arabicDistractorService";

export type VocabularyFamily = "noun" | "adjective" | "phrase" | "other";

export interface VocabularyTrainingQuestion {
  id: string;
  sourceType: "vocabulary_v3";
  kind:
    | "meaning"
    | "write_german"
    | "article"
    | "plural"
    | "adjective_meaning_choice"
    | "adjective_german_choice"
    | "adjective_sentence"
    | "comparative"
    | "superlative"
    | "phrase_gap";
  promptAr?: string;
  promptDe?: string;
  answer: string;
  answerLang: "de" | "ar";
  acceptedAnswers?: string[];
  options?: string[];
  visibleText?: string;
  speakBeforeAnswer?: string;
  correctAnswer?: string;
  speakAfterAnswer?: string;
  exampleDe?: string;
  exampleAr?: string;
  noteAr?: string;
}

function firstString(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

function unique(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const trimmed = value.trim();
    const key = trimmed.toLocaleLowerCase("de-DE");
    if (!trimmed || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function shuffle<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5);
}

function exampleFrom(value: any) {
  if (!value) return { de: "", ar: "" };
  return {
    de: normalizeGermanText(value.de),
    ar: firstString(value.ar),
  };
}

export function getVocabularyFamily(item: Vocabulary): VocabularyFamily {
  const family = item.dataMeta?.family;
  if (family === "noun" || family === "adjective" || family === "phrase" || family === "other") return family;
  if (item.phrase || item.phraseTraining || item.gapExamples?.length) return "phrase";
  if (item.adjectiveTraining) return "adjective";
  if (item.articleTraining || item.pluralTraining || item.article) return "noun";
  return "other";
}

export function getVocabularyTerm(item: Vocabulary): string {
  return firstString(item.term || item.phrase || item.singular || item.rawTerm);
}

export function getVocabularyFullTerm(item: Vocabulary): string {
  if (getVocabularyFamily(item) === "noun") {
    return firstString(item.singular || [item.article, item.term].filter(Boolean).join(" "));
  }
  return getVocabularyTerm(item);
}

export function getVocabularyTypeLabel(item: Vocabulary): string {
  return firstString(item.originalType || item.type || getVocabularyFamily(item));
}

export function getVocabularyNeedsReview(item: Vocabulary): boolean {
  return Boolean(item.vocabMeta?.needsReview ?? item.dataMeta?.needsReview ?? item.dataMeta?.needsHumanReview ?? item.needsReview);
}

export function getVocabularyDefaultExample(item: Vocabulary) {
  const legacy = { de: normalizeGermanText(item.example_de), ar: firstString(item.example_ar) };
  if (legacy.de || legacy.ar) return legacy;
  const examples = item.examples || [];
  return exampleFrom(examples[0]);
}

function meaningTraining(item: Vocabulary): any {
  return item.meaningTraining || item.adjectiveTraining?.meaning || item.phraseTraining?.meaning || item.generalVocabularyTraining?.meaning;
}

export function getVocabularyMeaningQuestion(item: Vocabulary, allItems: Vocabulary[]): VocabularyTrainingQuestion {
  const training = meaningTraining(item);
  const answer = firstString(training?.answer_ar || item.arabic);
  const example = exampleFrom(training?.exampleAfterAnswer || item.examples?.[0]);
  const family = getVocabularyFamily(item);
  const distractors = selectArabicDistractors(item, allItems, answer, {
    count: 3,
    sourceType: family,
    targetKind: family,
    getAnswer: (candidate) => firstString(meaningTraining(candidate)?.answer_ar || candidate.arabic),
    getId: (candidate) => candidate.id,
  });
  const options = unique([answer, ...distractors]).slice(0, 4);

  return {
    id: "meaning",
    sourceType: "vocabulary_v3",
    kind: "meaning",
    promptDe: firstString(training?.question || getVocabularyFullTerm(item)),
    promptAr: "ما معنى الكلمة الألمانية التالية؟",
    answer,
    answerLang: "ar",
    options,
    exampleDe: example.de,
    exampleAr: example.ar,
  };
}

function buildNounQuestions(item: Vocabulary): VocabularyTrainingQuestion[] {
  const questions: VocabularyTrainingQuestion[] = [];
  if (item.articleTraining?.answer) {
    const example = exampleFrom(item.articleTraining.exampleAfterAnswer);
    questions.push({
      id: "noun_article",
      sourceType: "vocabulary_v3",
      kind: "article",
      promptDe: firstString(item.articleTraining.question),
      promptAr: "اختر الأرتيكل الصحيح.",
      answer: firstString(item.articleTraining.answer),
      answerLang: "de",
      options: Array.isArray(item.articleTraining.options) ? item.articleTraining.options : ["der", "die", "das"],
      exampleDe: example.de,
      exampleAr: example.ar,
      noteAr: firstString(item.articleTraining.explanation_ar),
    });
  }
  if (item.pluralTraining?.answer && item.pluralTraining?.hasPlural !== false) {
    const example = exampleFrom(item.pluralTraining.exampleAfterAnswer);
    questions.push({
      id: "noun_plural",
      sourceType: "vocabulary_v3",
      kind: "plural",
      promptDe: firstString(item.pluralTraining.question || getVocabularyFullTerm(item)),
      promptAr: "اكتب صيغة الجمع.",
      answer: firstString(item.pluralTraining.answer),
      answerLang: "de",
      acceptedAnswers: unique([firstString(item.pluralTraining.answer), firstString(item.pluralTraining.pluralTerm)]),
      exampleDe: example.de,
      exampleAr: example.ar,
      noteAr: firstString(item.pluralTraining.explanation_ar),
    });
  }
  const meaning = item.meaningTraining;
  if (meaning?.answer_de) {
    const example = exampleFrom(meaning.exampleAfterAnswer);
    questions.push({
      id: "noun_write_german",
      sourceType: "vocabulary_v3",
      kind: "write_german",
      promptAr: item.arabic,
      answer: firstString(meaning.answer_de),
      answerLang: "de",
      acceptedAnswers: unique([firstString(meaning.answer_de), getVocabularyTerm(item)]),
      exampleDe: example.de,
      exampleAr: example.ar,
    });
  }
  return questions;
}

function buildAdjectiveQuestions(item: Vocabulary): VocabularyTrainingQuestion[] {
  const training = item.adjectiveTraining;
  const questions: VocabularyTrainingQuestion[] = [];
  if (training?.writeGerman?.answer) {
    const example = exampleFrom(training.writeGerman.exampleAfterAnswer);
    questions.push({
      id: "adjective_write_german",
      sourceType: "vocabulary_v3",
      kind: "write_german",
      promptAr: firstString(training.writeGerman.question_ar || item.arabic),
      answer: firstString(training.writeGerman.answer),
      answerLang: "de",
      exampleDe: example.de,
      exampleAr: example.ar,
    });
  }
  if (training?.comparative?.enabled && training.comparative.answer) {
    questions.push({
      id: "adjective_comparative",
      sourceType: "vocabulary_v3",
      kind: "comparative",
      promptDe: firstString(training.comparative.question),
      promptAr: "اكتب صيغة المقارنة.",
      answer: firstString(training.comparative.answer),
      answerLang: "de",
      noteAr: firstString(training.comparative.note_ar),
      exampleDe: normalizeGermanText((item.examples || []).find((example) => example.type === "comparative")?.de),
      exampleAr: firstString((item.examples || []).find((example) => example.type === "comparative")?.ar),
    });
  }
  if (training?.superlative?.enabled && training.superlative.answer) {
    questions.push({
      id: "adjective_superlative",
      sourceType: "vocabulary_v3",
      kind: "superlative",
      promptDe: firstString(training.superlative.question),
      promptAr: "اكتب صيغة التفضيل.",
      answer: firstString(training.superlative.answer),
      answerLang: "de",
      noteAr: firstString(training.superlative.note_ar),
      exampleDe: normalizeGermanText((item.examples || []).find((example) => example.type === "superlative")?.de),
      exampleAr: firstString((item.examples || []).find((example) => example.type === "superlative")?.ar),
    });
  }
  return questions;
}

function buildPhraseQuestions(item: Vocabulary): VocabularyTrainingQuestion[] {
  const questions: VocabularyTrainingQuestion[] = [];
  const fillBlank = item.phraseTraining?.fillBlank || item.gapExample || item.gapExamples?.[0];
  if (fillBlank?.answer) {
    const acceptedAnswers = Array.isArray(fillBlank.acceptedAnswers) ? fillBlank.acceptedAnswers : [];
    questions.push({
      id: "phrase_gap",
      sourceType: "vocabulary_v3",
      kind: "phrase_gap",
      promptDe: firstString(fillBlank.de),
      promptAr: firstString(fillBlank.ar),
      answer: firstString(fillBlank.answer),
      answerLang: "de",
      acceptedAnswers: unique([firstString(fillBlank.answer), ...acceptedAnswers.map(firstString)]),
      exampleDe: normalizeGermanText(fillBlank.de),
      exampleAr: firstString(fillBlank.ar),
    });
  }
  if (item.phraseTraining?.writePhrase?.answer) {
    const example = exampleFrom(item.phraseTraining.writePhrase.exampleAfterAnswer);
    questions.push({
      id: "phrase_write",
      sourceType: "vocabulary_v3",
      kind: "write_german",
      promptAr: firstString(item.phraseTraining.writePhrase.question_ar || item.arabic),
      answer: firstString(item.phraseTraining.writePhrase.answer),
      answerLang: "de",
      exampleDe: example.de,
      exampleAr: example.ar,
    });
  }
  return questions;
}

function buildOtherQuestions(item: Vocabulary): VocabularyTrainingQuestion[] {
  const training = item.generalVocabularyTraining?.writeGerman;
  if (!training?.answer) return [];
  const example = exampleFrom(training.exampleAfterAnswer);
  return [{
    id: "other_write_german",
    sourceType: "vocabulary_v3",
    kind: "write_german",
    promptAr: firstString(training.question_ar || item.arabic),
    answer: firstString(training.answer),
    answerLang: "de",
    exampleDe: example.de,
    exampleAr: example.ar,
  }];
}

export function getVocabularyWritingQuestion(item: Vocabulary): VocabularyTrainingQuestion {
  const family = getVocabularyFamily(item);
  const questions =
    family === "noun"
      ? buildNounQuestions(item)
      : family === "adjective"
      ? buildAdjectiveQuestions(item)
      : family === "phrase"
      ? buildPhraseQuestions(item)
      : buildOtherQuestions(item);

  if (family === "phrase") {
    const phraseGap = questions.find((question) => question.kind === "phrase_gap");
    if (phraseGap) return phraseGap;
  }

  const selected = shuffle(questions)[0];
  if (selected) return selected;

  const example = getVocabularyDefaultExample(item);
  return {
    id: "legacy_write_german",
    sourceType: "vocabulary_v3",
    kind: "write_german",
    promptAr: item.arabic,
    answer: getVocabularyFullTerm(item),
    answerLang: "de",
    exampleDe: example.de,
    exampleAr: example.ar,
  };
}

export function answersMatchAny(input: string, question: VocabularyTrainingQuestion): boolean {
  const expected = unique([question.answer, ...(question.acceptedAnswers || [])]);
  const normalize = (value: string) =>
    value
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("de-DE");
  const withoutArticle = (value: string) => normalize(value).replace(/^(der|die|das)\s+/i, "");
  const normalizedInput = normalize(input);
  const normalizedInputNoArticle = withoutArticle(input);
  return expected.some((answer) => {
    const normalizedAnswer = normalize(answer);
    return normalizedAnswer === normalizedInput || withoutArticle(answer) === normalizedInputNoArticle;
  });
}
