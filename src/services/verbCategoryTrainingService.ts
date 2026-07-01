import { Verb, VerbCategory } from "../types";
import { ensureCorrectOption } from "./choiceOptionService";
import { normalizeGermanText } from "./textDisplayService";

type CategorySourceField =
  | "generated_practical"
  | "category.exampleBank";

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
    "reflexiv",
    "prepositional",
    "trennbar",
    "modalverben",
    "perfekt_sein",
    "perfekt_haben",
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

const DEFINITE_CASE_OPTIONS = ["der", "die", "das", "den", "dem"];
const INDEFINITE_CASE_OPTIONS = ["ein", "eine", "einen", "einem", "einer"];
const DATIV_PRONOUN_OPTIONS = ["mir", "dir", "ihm", "ihr", "uns", "euch"];
const AKKUSATIV_PRONOUN_OPTIONS = ["mich", "dich", "ihn", "sie", "uns", "euch"];

function optionsFromPool(answer: string, pool: string[], count = 4): string[] {
  return unique([answer, ...pool.filter((option) => option.toLocaleLowerCase("de-DE") !== answer.toLocaleLowerCase("de-DE"))]).slice(0, count);
}

function caseGapOptions(answer: string, categoryId: "dativ" | "akkusativ"): string[] {
  const key = answer.toLocaleLowerCase("de-DE");
  if (INDEFINITE_CASE_OPTIONS.includes(key)) {
    return optionsFromPool(answer, INDEFINITE_CASE_OPTIONS);
  }
  if (DEFINITE_CASE_OPTIONS.includes(key)) {
    const pool = categoryId === "dativ"
      ? ["dem", "der", "den", "das", "die"]
      : ["den", "das", "die", "der", "dem"];
    return optionsFromPool(answer, pool);
  }
  if (categoryId === "dativ" && DATIV_PRONOUN_OPTIONS.includes(key)) {
    return optionsFromPool(answer, DATIV_PRONOUN_OPTIONS);
  }
  if (categoryId === "akkusativ" && AKKUSATIV_PRONOUN_OPTIONS.includes(key)) {
    return optionsFromPool(answer, AKKUSATIV_PRONOUN_OPTIONS);
  }
  return optionsFromPool(answer, categoryId === "dativ" ? DATIV_PRONOUN_OPTIONS : AKKUSATIV_PRONOUN_OPTIONS);
}

function practicalQuestion(
  verb: Verb,
  categoryId: string,
  instructionAr: string,
  promptDe: string,
  answer: string,
  questionType: string,
  noteAr: string,
  exampleArText?: string,
  options?: string[]
): VerbCategoryQuestion | null {
  const validOptions = options?.length
    ? ensureCorrectOption(options, answer, Math.min(6, Math.max(2, options.length)))
    : undefined;
  if (options?.length && !validOptions) return null;

  const exampleDeText = fullSentence(promptDe, answer);
  const question: VerbCategoryQuestion = {
    id: questionType,
    sourceField: "generated_practical",
    sourceExampleType: questionType,
    categoryId,
    promptAr: instructionAr,
    promptDe,
    answer,
    answerLang: "de",
    options: validOptions,
    visibleText: promptDe,
    speakBeforeAnswer: promptDe,
    correctAnswer: answer,
    speakAfterAnswer: answer,
    exampleDe: exampleDeText,
    exampleAr: exampleArText || verb.example_ar || "",
    noteAr: `${noteAr}${verb.arabic ? ` المعنى: ${verb.arabic}` : ""}`,
  };
  return isValidPracticalQuestion(question) ? question : null;
}

const CATEGORY_LABEL_ANSWERS = new Set([
  "dativ",
  "akkusativ",
  "reflexiv",
  "trennbar",
  "sein",
  "haben",
  "modalverb",
  "modalverben",
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsAnswer(text: string, answer: string): boolean {
  if (!text || !answer) return false;
  const escaped = escapeRegExp(answer.trim());
  if (!escaped) return false;
  return new RegExp(`(^|\\s|[.,!?;:()])${escaped}($|\\s|[.,!?;:()])`, "i").test(text);
}

function isValidPracticalQuestion(question: VerbCategoryQuestion): boolean {
  const answer = firstString(question.correctAnswer || question.answer);
  const prompt = firstString(question.visibleText || question.promptDe);
  if (!prompt.includes("___")) return false;
  if (CATEGORY_LABEL_ANSWERS.has(answer.toLocaleLowerCase("de-DE"))) return false;
  if (containsAnswer(prompt, answer)) return false;
  return true;
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
    categoryId === "dativ" ? "أكمل أداة أو ضمير Dativ المناسب:" : "أكمل أداة أو ضمير Akkusativ المناسب:",
    gap.prompt,
    gap.answer,
    `verb_category_${categoryId}_gap`,
    `هذا الموضع يحتاج ${label}.`,
    firstString(casePattern?.example_ar || fallback?.ar || verb.example_ar),
    caseGapOptions(gap.answer, categoryId)
  );
}

function buildDativAkkusativGap(verb: Verb, categories: VerbCategory[]): VerbCategoryQuestion | null {
  const casePattern = verb.casePattern as any;
  const ownExample = casePattern?.type === "dativ_akkusativ" ? firstString(casePattern.example_de || verb.example_de) : "";
  const fallback = exampleBankSentence(categories, "dativ_akkusativ");
  const sentence = normalizeGermanText(ownExample || fallback?.de || "");
  if (!sentence) return null;
  const patterns = [
    {
      pattern: /\b(dem|der|einem|einer)\s+([A-ZÄÖÜ][\p{L}äöüÄÖÜß-]+)\s+(den|das|die|einen|eine|ein)\s+([A-ZÄÖÜ][\p{L}äöüÄÖÜß-]+)/u,
      prompt: (match: RegExpMatchArray) => sentence.replace(match[0], `___ ${match[2]} ___ ${match[4]}`),
      note: (match: RegExpMatchArray) => `Dativ: ${match[1]} ${match[2]}. Akkusativ: ${match[3]} ${match[4]}.`,
    },
    {
      pattern: /\b(mir|dir|ihm|ihr|uns|euch)\s+((?:(?:den|das|die|einen|eine|ein|dieses|diese|diesen|meinen|deinen|seinen|ihren|unseren|euer)\s+)?[A-ZÄÖÜ][\p{L}äöüÄÖÜß-]+)/u,
      prompt: (match: RegExpMatchArray) => sentence.replace(match[0], "___ ___"),
      note: (match: RegExpMatchArray) => `Dativ: ${match[1]}. Akkusativ: ${match[2]}.`,
    },
  ];
  for (const { pattern, prompt, note } of patterns) {
    const match = sentence.match(pattern);
    if (match?.[0]) {
      return practicalQuestion(
        verb,
        "dativ_akkusativ",
        "أكمل المفعولين: Dativ ثم Akkusativ:",
        prompt(match),
        match[0],
        "verb_category_dativ_akkusativ_gap",
        note(match),
        firstString(casePattern?.example_ar || fallback?.ar || verb.example_ar)
      );
    }
  }
  return null;
}

function buildPrepositionGap(verb: Verb): VerbCategoryQuestion | null {
  const prep = Array.isArray(verb.prepositions) ? (verb.prepositions[0] as any) : null;
  const preposition = firstString(prep?.preposition).split(/[\/,]/)[0]?.trim();
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
  } else if (preposition === "in" && /\bim\b/i.test(prompt)) {
    prompt = prompt.replace(/\bim\b/i, "___ dem");
  } else if (preposition === "in" && /\bins\b/i.test(prompt)) {
    prompt = prompt.replace(/\bins\b/i, "___ das");
  } else {
    return null;
  }
  return practicalQuestion(
    verb,
    "prepositional",
    "أكمل حرف الجر المناسب:",
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
    "أكمل الضمير الانعكاسي المناسب:",
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
    "أكمل السابقة المنفصلة في آخر الجملة:",
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
  if ((categoryId === "perfekt_sein" && auxiliary !== "sein") || (categoryId === "perfekt_haben" && auxiliary !== "haben")) return null;
  const answer = auxiliary === "sein" ? "bin" : auxiliary === "haben" ? "habe" : "";
  const perfektRest = firstString(verb.perfekt).replace(/^(ist|hat)\s+/i, "");
  if (!answer || !perfektRest || perfektRest.includes("...") || perfektRest.includes("/")) return null;
  return practicalQuestion(
    verb,
    categoryId,
    "اختر الفعل المساعد الصحيح في Perfekt:",
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
    "أكمل تصريف الفعل المساعد:",
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
    const question =
      categoryId === "dativ"
        ? buildCaseGap(verb, categories, "dativ")
        : categoryId === "akkusativ"
        ? buildCaseGap(verb, categories, "akkusativ")
        : categoryId === "dativ_akkusativ"
        ? buildDativAkkusativGap(verb, categories)
        : categoryId === "prepositional"
        ? buildPrepositionGap(verb)
        : categoryId === "reflexiv"
        ? buildReflexiveGap(verb)
        : categoryId === "trennbar"
        ? buildSeparableGap(verb)
        : categoryId === "perfekt_sein"
        ? buildAuxiliaryGap(verb, "perfekt_sein")
        : categoryId === "perfekt_haben"
        ? buildAuxiliaryGap(verb, "perfekt_haben")
        : categoryId === "modalverben"
        ? buildModalGap(verb)
        : null;
    if (question) return question;
  }
  return null;
}

export function hasVerbCategoryTraining(verb: Verb): boolean {
  const practicalIds = new Set([
    "dativ",
    "akkusativ",
    "dativ_akkusativ",
    "prepositional",
    "reflexiv",
    "trennbar",
    "perfekt_sein",
    "perfekt_haben",
    "modalverben",
  ]);
  return Boolean(verb.categoryIds?.some((categoryId) => practicalIds.has(categoryId)));
}

export function buildVerbCategoryQuestion(
  verb: Verb,
  allVerbs: Verb[],
  categories: VerbCategory[],
  selectedCategoryId: string | null,
  language: "de" | "ar"
): VerbCategoryQuestion | null {
  void allVerbs;
  void language;
  return buildPracticalCategoryQuestion(verb, categories, selectedCategoryId);
}
