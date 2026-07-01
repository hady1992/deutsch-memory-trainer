import { Verb, VerbCategory, VerbPracticeExample } from "../types";
import { normalizeGermanText } from "./textDisplayService";
import { selectArabicDistractors } from "./arabicDistractorService";

type CategorySourceField =
  | "verbCategoryTraining.expandedPracticeExamples"
  | "expandedExamples.categoryPracticeExamples"
  | "expandedExamples.formExamples"
  | "expandedExamples.studyExamples"
  | "category.exampleBank"
  | "generated_practical"
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

function meaningOptions(verb: Verb, allVerbs: Verb[], correct: string) {
  const distractors = selectArabicDistractors(verb, allVerbs, correct, {
    count: 3,
    sourceType: "verb",
    targetKind: "verb",
    getAnswer: (candidate) => candidate.arabic,
    getId: (candidate) => candidate.id,
  });
  return unique([correct, ...distractors]).slice(0, 4);
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

function categoryById(categories: VerbCategory[], id?: string | null): VerbCategory | undefined {
  return categories.find((category) => category.id === id);
}

function practicalCategoryIds(verb: Verb, selectedCategoryId: string | null): string[] {
  if (selectedCategoryId) return [selectedCategoryId];
  const ids = verb.categoryIds || [];
  const priority = [
    "dativ",
    "akkusativ",
    "dativ_akkusativ",
    "prepositional",
    "reflexiv",
    "trennbar",
    "perfekt_sein",
    "perfekt_haben",
    "modalverben",
  ];
  return priority.filter((id) => ids.includes(id));
}

function fullSentence(sentence: string, answer: string): string {
  return sentence.replace(/_{2,}/g, answer);
}

function gapToken(sentence: string, tokens: string[]): { prompt: string; answer: string } | null {
  for (const token of tokens) {
    const pattern = new RegExp(`\\b${token}\\b`, "i");
    if (pattern.test(sentence)) {
      return { prompt: sentence.replace(pattern, "___"), answer: token };
    }
  }
  return null;
}

function practicalQuestion(
  verb: Verb,
  categoryId: string,
  promptDe: string,
  answer: string,
  questionType: string,
  noteAr: string,
  exampleArText?: string,
  options?: string[]
): VerbCategoryQuestion {
  const exampleDeText = fullSentence(promptDe, answer);
  return {
    id: questionType,
    sourceField: "generated_practical",
    sourceExampleType: questionType,
    categoryId,
    promptAr: "أكمل الفراغ في الجملة الألمانية.",
    promptDe,
    answer,
    answerLang: "de",
    options,
    visibleText: promptDe,
    speakBeforeAnswer: promptDe,
    correctAnswer: answer,
    speakAfterAnswer: answer,
    exampleDe: exampleDeText,
    exampleAr: exampleArText || verb.example_ar || "",
    noteAr: `${noteAr}${verb.arabic ? ` المعنى: ${verb.arabic}` : ""}`,
  };
}

function exampleBankSentence(categories: VerbCategory[], categoryId: string): { de: string; ar?: string; note?: string } | null {
  const category = categoryById(categories, categoryId);
  const examples = Array.isArray(category?.exampleBank) ? category.exampleBank : [];
  const selected = shuffle(examples).find((example) => firstString(example.de));
  if (!selected) return null;
  return {
    de: normalizeGermanText(selected.de),
    ar: firstString(selected.ar),
    note: firstString(selected.note_ar || selected.pattern),
  };
}

function buildCaseGap(verb: Verb, categories: VerbCategory[], categoryId: "dativ" | "akkusativ"): VerbCategoryQuestion | null {
  const dativTokens = ["meiner", "meinem", "einer", "einem", "dem", "der", "mir", "dir", "ihm", "ihr", "uns", "euch"];
  const akkusativTokens = ["einen", "eine", "den", "das", "die", "mich", "dich", "ihn", "sie", "uns", "euch"];
  const casePattern = verb.casePattern as any;
  const ownExample = casePattern?.type === categoryId ? firstString(casePattern.example_de || verb.example_de) : "";
  const fallback = exampleBankSentence(categories, categoryId);
  const sentence = normalizeGermanText(ownExample || fallback?.de || "");
  if (!sentence) return null;
  const gap = gapToken(sentence, categoryId === "dativ" ? dativTokens : akkusativTokens);
  if (!gap) return null;
  const label = categoryId === "dativ" ? "Dativ" : "Akkusativ";
  return practicalQuestion(
    verb,
    categoryId,
    gap.prompt,
    gap.answer,
    `verb_category_${categoryId}_gap`,
    `هذا الفعل يأخذ ${label}.`,
    firstString(casePattern?.example_ar || fallback?.ar || verb.example_ar),
    categoryId === "dativ" ? ["dem", "der", "den", "das"] : ["den", "einen", "dem", "der"]
  );
}

function buildDativAkkusativGap(verb: Verb, categories: VerbCategory[]): VerbCategoryQuestion | null {
  const casePattern = verb.casePattern as any;
  const ownExample = casePattern?.type === "dativ_akkusativ" ? firstString(casePattern.example_de || verb.example_de) : "";
  const fallback = exampleBankSentence(categories, "dativ_akkusativ");
  const sentence = normalizeGermanText(ownExample || fallback?.de || "");
  if (!sentence) return null;
  const patterns = [
    /\b(dem|der|einem|einer)\s+([A-ZÄÖÜ][\p{L}äöüÄÖÜß-]+)\s+(den|das|die|einen|eine|ein)\s+([A-ZÄÖÜ][\p{L}äöüÄÖÜß-]+)/u,
    /\b(mir|dir|ihm|ihr|uns|euch)\s+([A-ZÄÖÜ][\p{L}äöüÄÖÜß-]+)/u,
  ];
  for (const pattern of patterns) {
    const match = sentence.match(pattern);
    if (match?.[0]) {
      return practicalQuestion(
        verb,
        "dativ_akkusativ",
        sentence.replace(match[0], "___"),
        match[0],
        "verb_category_dativ_akkusativ_gap",
        "غالبًا الشخص يكون Dativ والشيء يكون Akkusativ.",
        firstString(casePattern?.example_ar || fallback?.ar || verb.example_ar)
      );
    }
  }
  return null;
}

function buildPrepositionGap(verb: Verb): VerbCategoryQuestion | null {
  const prep = Array.isArray(verb.prepositions) ? (verb.prepositions[0] as any) : null;
  const preposition = firstString(prep?.preposition);
  const sentence = normalizeGermanText(firstString(prep?.example_de || verb.example_de));
  if (!preposition || !sentence) return null;
  let prompt = sentence;
  if (new RegExp(`\\b${preposition}\\b`, "i").test(prompt)) {
    prompt = prompt.replace(new RegExp(`\\b${preposition}\\b`, "i"), "___");
  } else if (preposition === "von" && /\bvom\b/i.test(prompt)) {
    prompt = prompt.replace(/\bvom\b/i, "___ dem");
  } else if (preposition === "zu" && /\bzum\b/i.test(prompt)) {
    prompt = prompt.replace(/\bzum\b/i, "___ dem");
  } else if (preposition === "zu" && /\bzur\b/i.test(prompt)) {
    prompt = prompt.replace(/\bzur\b/i, "___ der");
  } else if (preposition === "bei" && /\bbeim\b/i.test(prompt)) {
    prompt = prompt.replace(/\bbeim\b/i, "___ dem");
  } else {
    return null;
  }
  return practicalQuestion(
    verb,
    "prepositional",
    prompt,
    preposition,
    "verb_category_preposition_gap",
    firstString(prep?.pattern) || `${verb.infinitiv} ${preposition}${prep?.case ? ` + ${prep.case}` : ""}`,
    firstString(prep?.example_ar || verb.example_ar),
    unique([preposition, "auf", "an", "mit", "von", "für"]).slice(0, 4)
  );
}

function buildReflexiveGap(verb: Verb): VerbCategoryQuestion | null {
  const sentence = normalizeGermanText(firstString((verb.casePattern as any)?.example_de || verb.example_de));
  if (!sentence) return null;
  const gap = gapToken(sentence, ["mich", "mir", "dich", "dir", "sich", "uns", "euch"]);
  if (!gap) return null;
  return practicalQuestion(
    verb,
    "reflexiv",
    gap.prompt,
    gap.answer,
    "verb_category_reflexive_gap",
    "هذا الفعل يستخدم مع ضمير انعكاسي.",
    firstString((verb.casePattern as any)?.example_ar || verb.example_ar),
    ["mich", "mir", "sich", "uns"]
  );
}

function buildSeparableGap(verb: Verb): VerbCategoryQuestion | null {
  const prefix = firstString(verb.prefix || verb.infinitiv.match(/^(ab|an|auf|aus|ein|mit|nach|vor|weg|weiter|zurück|zusammen)/)?.[1]);
  const sentence = normalizeGermanText(firstString(verb.example_de || verb.praesens));
  if (!prefix || !sentence) return null;
  const pattern = new RegExp(`\\b${prefix}\\b(?=[.!?]?$)`, "i");
  if (!pattern.test(sentence)) return null;
  return practicalQuestion(
    verb,
    "trennbar",
    sentence.replace(pattern, "___"),
    prefix,
    "verb_category_separable_prefix",
    `البادئة ${prefix} تنفصل وتأتي غالبًا في آخر الجملة.`,
    verb.example_ar,
    unique([prefix, "ab", "auf", "an", "ein", "mit"]).slice(0, 4)
  );
}

function buildAuxiliaryGap(verb: Verb, categoryId: "perfekt_sein" | "perfekt_haben"): VerbCategoryQuestion | null {
  const auxiliary = firstString(verb.auxiliary || (verb.perfekt?.startsWith("ist ") ? "sein" : verb.perfekt?.startsWith("hat ") ? "haben" : ""));
  const answer = auxiliary === "sein" ? "bin" : auxiliary === "haben" ? "habe" : "";
  const perfektRest = firstString(verb.perfekt).replace(/^(ist|hat)\s+/i, "");
  if (!answer || !perfektRest) return null;
  return practicalQuestion(
    verb,
    categoryId,
    `Ich ___ ${perfektRest}.`,
    answer,
    `verb_category_${categoryId}_auxiliary`,
    `في Perfekt يستخدم هذا الفعل ${auxiliary}.`,
    verb.example_ar,
    ["bin", "habe", "ist", "hat"]
  );
}

function buildModalGap(verb: Verb): VerbCategoryQuestion | null {
  const forms: Record<string, string> = {
    "dürfen": "darf",
    "können": "kann",
    "mögen": "mag",
    "müssen": "muss",
    "sollen": "soll",
    "wollen": "will",
  };
  const answer = forms[verb.infinitiv];
  if (!answer) return null;
  return practicalQuestion(
    verb,
    "modalverben",
    `Ich ___ heute arbeiten. (${verb.infinitiv})`,
    answer,
    "verb_category_modal_conjugation",
    "هذا تدريب على تصريف Modalverb مع ich.",
    verb.example_ar,
    ["muss", "kann", "darf", "will", "soll", "mag"]
  );
}

function buildPracticalCategoryQuestion(
  verb: Verb,
  categories: VerbCategory[],
  selectedCategoryId: string | null
): VerbCategoryQuestion | null {
  for (const categoryId of practicalCategoryIds(verb, selectedCategoryId)) {
    if (categoryId === "dativ") return buildCaseGap(verb, categories, "dativ");
    if (categoryId === "akkusativ") return buildCaseGap(verb, categories, "akkusativ");
    if (categoryId === "dativ_akkusativ") return buildDativAkkusativGap(verb, categories);
    if (categoryId === "prepositional") return buildPrepositionGap(verb);
    if (categoryId === "reflexiv") return buildReflexiveGap(verb);
    if (categoryId === "trennbar") return buildSeparableGap(verb);
    if (categoryId === "perfekt_sein") return buildAuxiliaryGap(verb, "perfekt_sein");
    if (categoryId === "perfekt_haben") return buildAuxiliaryGap(verb, "perfekt_haben");
    if (categoryId === "modalverben") return buildModalGap(verb);
  }
  return null;
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
  if (type === "category_recognition" || type === "reflexive_recognition") return null;
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
      options: normalizeOptions(answer, example.options) || meaningOptions(verb, allVerbs, answer),
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

  if (false && type === "category_recognition") {
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
  const practical = buildPracticalCategoryQuestion(verb, categories, selectedCategoryId);
  if (practical) return practical;

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
    options: meaningOptions(verb, allVerbs, verb.arabic),
    exampleDe: normalizeGermanText(verb.example_de),
    exampleAr: verb.example_ar || "",
  };
}
