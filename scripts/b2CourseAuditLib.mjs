import fs from "node:fs";
import path from "node:path";

export const SUPPORTED_EXERCISE_TYPES = new Set([
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
]);

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function normalize(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u00a0\u2000-\u200d\u202f\u205f\u2060\u3000\ufeff]/g, " ")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("de-DE");
}

function stripArticle(value) {
  return normalize(String(value ?? "").split(",")[0])
    .replace(/^(?:der\s*\/\s*die|der|die|das)\s+/i, "")
    .trim();
}

function potential(value) {
  return normalize(value)
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[\p{P}\p{S}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function courseFamily(type) {
  const value = normalize(type);
  if (value === "verb") return "verbs";
  if (value === "noun" || value === "noun_plural") return "nouns";
  if (["adjective", "adjective_adverb", "adjective_participle"].includes(value)) return "adjectives";
  return "phrases";
}

export function courseIdentity(item) {
  const family = courseFamily(item.type);
  const term = family === "nouns" ? stripArticle(item.term) : normalize(item.term);
  return term ? `${family}:${term}` : "";
}

function productionIdentity(family, item) {
  let term = "";
  if (family === "verbs") term = normalize(item.infinitiv);
  else if (family === "nouns") term = stripArticle(item.cleanTerm || item.singular || item.term || item.rawTerm);
  else if (family === "phrases") term = normalize(item.phrase || item.term || item.cleanTerm);
  else term = normalize(item.term || item.cleanTerm || item.phrase);
  return term ? `${family}:${term}` : "";
}

export function loadProductionRegistry(productionRoot) {
  const files = {
    verbs: "verbs.json",
    nouns: "nouns.json",
    adjectives: "adjectives.json",
    phrases: "phrases.json",
    other: "other-vocabulary.json",
  };
  const exact = new Map();
  const fuzzy = new Map();
  for (const [family, filename] of Object.entries(files)) {
    const items = readJson(path.join(productionRoot, filename));
    for (const item of items) {
      const identity = productionIdentity(family, item);
      if (!identity) continue;
      const ref = `${family}:${item.id}`;
      exact.set(identity, { ref, family, id: item.id });
      const fuzzyKey = `${family}:${potential(identity.split(":").slice(1).join(":"))}`;
      if (!fuzzy.has(fuzzyKey)) fuzzy.set(fuzzyKey, []);
      fuzzy.get(fuzzyKey).push({ ref, identity });
    }
  }
  return { exact, fuzzy };
}

function pushError(report, code, message, details = {}) {
  report.errors.push({ code, message, ...details });
}

function pushWarning(report, code, message, details = {}) {
  report.warnings.push({ code, message, ...details });
}

export function auditCourse({ courseRoot, productionRoot }) {
  const report = {
    ok: false,
    courseRoot,
    unitCount: 0,
    totals: {
      vocabulary: 0,
      exercises: 0,
      newVocabulary: 0,
      linkedProductionVocabulary: 0,
      reusedUnitReferences: 0,
      potentialDuplicates: 0,
    },
    exerciseTypes: {},
    units: [],
    errors: [],
    warnings: [],
  };

  const indexPath = path.join(courseRoot, "index.json");
  if (!fs.existsSync(indexPath)) {
    pushError(report, "missing_manifest", "index.json is missing.", { file: indexPath });
    return report;
  }

  let index;
  try {
    index = readJson(indexPath);
  } catch (error) {
    pushError(report, "invalid_manifest_json", error.message, { file: indexPath });
    return report;
  }
  if (index.schemaVersion !== "b2-course-index-v1") pushError(report, "invalid_manifest_schema", "Unexpected manifest schemaVersion.");
  if (index.course?.progressKey !== "dmt_b2_course_progress_v1") pushError(report, "invalid_progress_key", "The B2 course progress key must be dmt_b2_course_progress_v1.");
  if (!Array.isArray(index.units)) pushError(report, "invalid_units", "Manifest units must be an array.");
  if (report.errors.length) return report;

  const production = loadProductionRegistry(productionRoot);
  const courseIds = new Map();
  const exerciseIds = new Set();
  const identities = new Map();
  const allReferences = [];
  const unitNumbers = new Set();
  report.unitCount = index.units.length;

  for (const summary of index.units) {
    if (!Number.isInteger(summary.unit) || summary.unit < 1 || unitNumbers.has(summary.unit)) {
      pushError(report, "invalid_unit_number", "Unit numbers must be unique positive integers.", { unit: summary.unit });
    }
    unitNumbers.add(summary.unit);
    const vocabularyPath = path.join(courseRoot, summary.vocabularyFile ?? "");
    const exercisesPath = path.join(courseRoot, summary.exercisesFile ?? "");
    let vocabulary;
    let exercises;
    try {
      vocabulary = readJson(vocabularyPath);
      exercises = readJson(exercisesPath);
    } catch (error) {
      pushError(report, "invalid_unit_json", error.message, { unit: summary.unit });
      continue;
    }
    const items = Array.isArray(vocabulary.items) ? vocabulary.items : [];
    const exerciseItems = Array.isArray(exercises.exercises) ? exercises.exercises : [];
    const unitReport = {
      unit: summary.unit,
      vocabulary: items.length,
      exercises: exerciseItems.length,
      linkedProduction: 0,
      reusedReferences: (vocabulary.reusedVocabularyRefs ?? []).length,
    };
    report.units.push(unitReport);
    report.totals.vocabulary += items.length;
    report.totals.exercises += exerciseItems.length;
    report.totals.reusedUnitReferences += unitReport.reusedReferences;

    if (vocabulary.schemaVersion !== "b2-course-content-v1") pushError(report, "invalid_vocabulary_schema", "Invalid vocabulary schema.", { unit: summary.unit });
    if (exercises.schemaVersion !== "b2-course-exercises-v1") pushError(report, "invalid_exercise_schema", "Invalid exercise schema.", { unit: summary.unit });
    if (vocabulary.course?.unit !== summary.unit || exercises.unit !== summary.unit) pushError(report, "unit_mismatch", "Unit references do not match the manifest.", { unit: summary.unit });
    if (summary.vocabularyCount !== items.length) pushError(report, "vocabulary_count_mismatch", "Manifest vocabularyCount is wrong.", { unit: summary.unit, expected: summary.vocabularyCount, actual: items.length });
    if (summary.exerciseCount !== exerciseItems.length) pushError(report, "exercise_count_mismatch", "Manifest exerciseCount is wrong.", { unit: summary.unit, expected: summary.exerciseCount, actual: exerciseItems.length });
    if (exercises.progressKeyProposal && exercises.progressKeyProposal !== "dmt_b2_course_progress_v1") pushError(report, "exercise_progress_key", "Exercise file proposes a different progress key.", { unit: summary.unit });

    for (const item of items) {
      const id = String(item.courseItemId ?? "").trim();
      if (!id || !new RegExp(`^b2u${String(summary.unit).padStart(2, "0")}-v\\d{3}$`).test(id)) pushError(report, "invalid_vocabulary_id", "Invalid courseItemId.", { unit: summary.unit, id });
      if (courseIds.has(id)) pushError(report, "duplicate_vocabulary_id", "Duplicate courseItemId.", { id, units: [courseIds.get(id), summary.unit] });
      courseIds.set(id, summary.unit);
      const identity = courseIdentity(item);
      if (!identity) pushError(report, "empty_identity", "Vocabulary identity is empty.", { id });
      if (identities.has(identity)) pushError(report, "duplicate_course_identity", "Duplicate vocabulary identity inside B2 course.", { identity, ids: [identities.get(identity), id] });
      identities.set(identity, id);

      for (const field of ["term", "arabic", "explanation_de", "explanation_ar"]) {
        if (!String(item[field] ?? "").trim()) pushError(report, "missing_vocabulary_field", `Missing ${field}.`, { id });
      }
      if (!/[\u0600-\u06ff]/u.test(String(item.arabic ?? ""))) pushWarning(report, "arabic_text_review", "Arabic meaning does not contain Arabic letters.", { id });
      if (!Array.isArray(item.examples) || item.examples.length < 2 || item.examples.some((example) => !String(example.de ?? "").trim() || !String(example.ar ?? "").trim())) {
        pushError(report, "invalid_examples", "Each vocabulary item needs at least two complete bilingual examples.", { id });
      }

      const productionMatch = production.exact.get(identity);
      if (productionMatch) {
        if (String(item.globalRef ?? "") !== productionMatch.ref) {
          pushError(report, "unlinked_production_duplicate", "Existing production vocabulary must be linked through its original ID.", { id, identity, expectedGlobalRef: productionMatch.ref, actualGlobalRef: item.globalRef });
        } else {
          report.totals.linkedProductionVocabulary += 1;
          unitReport.linkedProduction += 1;
        }
      } else if (item.globalRef) {
        pushError(report, "invalid_global_ref", "globalRef does not match the production identity.", { id, identity, globalRef: item.globalRef });
      } else {
        report.totals.newVocabulary += 1;
        const [family, term] = identity.split(/:(.*)/s);
        const candidates = production.fuzzy.get(`${family}:${potential(term)}`) ?? [];
        if (candidates.length) {
          report.totals.potentialDuplicates += 1;
          pushWarning(report, "potential_production_duplicate", "Potential production duplicate requires manual review.", { id, identity, candidates });
        }
      }

      const family = courseFamily(item.type);
      if (family === "nouns" && (
        !item.grammar?.article
        || (item.grammar?.plural === undefined && item.grammar?.numberType === undefined)
      )) {
        pushWarning(report, "incomplete_noun_grammar", "Noun article or plural information is incomplete.", { id });
      }
      if (family === "verbs" && (!item.grammar?.praeteritum || !item.grammar?.perfekt)) {
        pushWarning(report, "incomplete_verb_grammar", "Verb Präteritum or Perfekt information is incomplete.", { id });
      }
    }

    for (const reference of vocabulary.reusedVocabularyRefs ?? []) {
      allReferences.push({ source: `unit-${summary.unit}-reused`, id: reference.courseItemId });
    }

    for (const exercise of exerciseItems) {
      const id = String(exercise.id ?? "").trim();
      if (!id || !new RegExp(`^b2u${String(summary.unit).padStart(2, "0")}-e\\d{3}$`).test(id)) pushError(report, "invalid_exercise_id", "Invalid exercise ID.", { unit: summary.unit, id });
      if (exerciseIds.has(id)) pushError(report, "duplicate_exercise_id", "Duplicate exercise ID.", { id });
      exerciseIds.add(id);
      report.exerciseTypes[exercise.type] = (report.exerciseTypes[exercise.type] ?? 0) + 1;
      if (!SUPPORTED_EXERCISE_TYPES.has(exercise.type)) pushError(report, "unsupported_exercise_type", "Unsupported exercise type.", { id, type: exercise.type });
      if (exercise.answer === undefined || exercise.answer === null || exercise.answer === "") pushError(report, "missing_exercise_answer", "Exercise answer is missing.", { id });
      if (["multiple_choice", "dialogue_choice", "scenario_choice"].includes(exercise.type)) {
        const options = Array.isArray(exercise.options) ? exercise.options : [];
        const normalizedOptions = options.map(normalize);
        const answerCount = normalizedOptions.filter((option) => option === normalize(exercise.answer)).length;
        if (new Set(normalizedOptions).size !== normalizedOptions.length) pushError(report, "duplicate_options", "Choice options contain duplicates.", { id });
        if (answerCount !== 1) pushError(report, "invalid_correct_option", "Correct answer must appear exactly once in options.", { id, answerCount });
      }
      if (exercise.type === "matching" && (!Array.isArray(exercise.pairs) || exercise.pairs.length < 2)) pushError(report, "invalid_matching", "Matching exercise needs at least two pairs.", { id });
      if (["sentence_order", "email_order"].includes(exercise.type) && !exercise.tokens && !exercise.blocks) pushError(report, "missing_order_source", "Order exercise needs tokens or blocks.", { id });
      if (["guided_writing", "guided_speaking"].includes(exercise.type)) {
        const concepts = exercise.answer?.requiredConcepts;
        if (!Array.isArray(concepts) || concepts.length === 0) pushError(report, "missing_self_check", "Guided exercise needs requiredConcepts.", { id });
      }
      for (const reference of [...(exercise.vocabularyRefs ?? []), ...(exercise.reusedVocabularyRefs ?? [])]) {
        allReferences.push({ source: id, id: reference });
      }
    }
  }

  for (const reference of allReferences) {
    if (!courseIds.has(reference.id)) pushError(report, "unresolved_vocabulary_reference", "Vocabulary reference cannot be resolved.", reference);
  }
  report.ok = report.errors.length === 0;
  return report;
}
