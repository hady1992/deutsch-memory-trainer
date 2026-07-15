import fs from "node:fs";
import path from "node:path";
import {
  SUPPORTED_EXERCISE_TYPES,
  auditCourse,
  courseIdentity,
  loadProductionRegistry,
  normalize,
  readJson,
} from "./b2CourseAuditLib.mjs";

function arg(name) {
  const position = process.argv.indexOf(`--${name}`);
  return position >= 0 ? process.argv[position + 1] : undefined;
}

function fail(message) {
  throw new Error(message);
}

const root = path.resolve(arg("root") ?? "public/data/courses/b2-course");
const productionRoot = path.resolve("public/data");
const unitNumber = Number(arg("unit"));
const titleDe = arg("title-de");
const titleAr = arg("title-ar");
const vocabularySource = arg("vocabulary");
const exercisesSource = arg("exercises");
const pagesFrom = Number(arg("pages-from"));
const pagesTo = Number(arg("pages-to"));
const dryRun = process.argv.includes("--dry-run");
const replace = process.argv.includes("--replace");

if (!Number.isInteger(unitNumber) || unitNumber < 1 || !titleDe || !titleAr || !vocabularySource || !exercisesSource) {
  console.error('Usage: npm run course:add -- --unit 4 --title-de "Tourismus" --title-ar "السياحة" --pages-from 61 --pages-to 80 --vocabulary unit-04-vocabulary.json --exercises unit-04-exercises.json --dry-run');
  process.exit(2);
}

const existingAudit = auditCourse({ courseRoot: root, productionRoot });
if (!existingAudit.ok) fail("The current B2 course must pass course:audit before adding a unit.");
const indexPath = path.join(root, "index.json");
const index = readJson(indexPath);
const existingEntry = index.units.find((entry) => entry.unit === unitNumber);
if (existingEntry && !replace) fail(`Unit ${unitNumber} already exists. Use --replace explicitly to replace it.`);

const sourceVocabularyPath = path.resolve(vocabularySource);
const sourceExercisesPath = path.resolve(exercisesSource);
const vocabulary = readJson(sourceVocabularyPath);
const exercises = readJson(sourceExercisesPath);
if (vocabulary.schemaVersion !== "b2-course-content-v1" || !Array.isArray(vocabulary.items)) fail("Invalid vocabulary schema.");
if (exercises.schemaVersion !== "b2-course-exercises-v1" || !Array.isArray(exercises.exercises)) fail("Invalid exercise schema.");
if (vocabulary.course?.unit !== unitNumber || exercises.unit !== unitNumber) fail("Source files do not match --unit.");
if (exercises.progressKeyProposal && exercises.progressKeyProposal !== "dmt_b2_course_progress_v1") fail("Source exercise file proposes a different progress key.");

const knownItemIds = new Set();
const knownExerciseIds = new Set();
const knownIdentities = new Set();
for (const summary of index.units) {
  if (summary.unit === unitNumber) continue;
  const unitVocabulary = readJson(path.join(root, summary.vocabularyFile));
  const unitExercises = readJson(path.join(root, summary.exercisesFile));
  for (const item of unitVocabulary.items) {
    knownItemIds.add(item.courseItemId);
    knownIdentities.add(courseIdentity(item));
  }
  for (const exercise of unitExercises.exercises) knownExerciseIds.add(exercise.id);
}

const candidateIds = new Set();
const candidateIdentities = new Set();
const production = loadProductionRegistry(productionRoot);
for (const item of vocabulary.items) {
  const id = String(item.courseItemId ?? "").trim();
  if (!new RegExp(`^b2u${String(unitNumber).padStart(2, "0")}-v\\d{3}$`).test(id)) fail(`Invalid candidate vocabulary ID: ${id}`);
  if (knownItemIds.has(id) || candidateIds.has(id)) fail(`Duplicate candidate vocabulary ID: ${id}`);
  candidateIds.add(id);
  const identity = courseIdentity(item);
  if (!identity || knownIdentities.has(identity) || candidateIdentities.has(identity)) fail(`Duplicate or empty candidate identity: ${identity}`);
  candidateIdentities.add(identity);
  const productionMatch = production.exact.get(identity);
  if (productionMatch && String(item.globalRef ?? "") !== productionMatch.ref) fail(`Production duplicate must link its original ID: ${id} -> ${productionMatch.ref}`);
  if (!productionMatch && item.globalRef) fail(`Invalid globalRef on new item: ${id}`);
  if (!Array.isArray(item.examples) || item.examples.length < 2 || item.examples.some((example) => !example.de || !example.ar)) fail(`Invalid examples: ${id}`);
}

const allCandidateRefs = [];
for (const reference of vocabulary.reusedVocabularyRefs ?? []) allCandidateRefs.push({ source: "reusedVocabularyRefs", id: reference.courseItemId });
for (const exercise of exercises.exercises) {
  const id = String(exercise.id ?? "").trim();
  if (!new RegExp(`^b2u${String(unitNumber).padStart(2, "0")}-e\\d{3}$`).test(id)) fail(`Invalid candidate exercise ID: ${id}`);
  if (knownExerciseIds.has(id)) fail(`Duplicate candidate exercise ID: ${id}`);
  knownExerciseIds.add(id);
  if (!SUPPORTED_EXERCISE_TYPES.has(exercise.type)) fail(`Unsupported exercise type ${exercise.type}: ${id}`);
  if (exercise.answer === undefined || exercise.answer === null || exercise.answer === "") fail(`Missing answer: ${id}`);
  if (["multiple_choice", "dialogue_choice", "scenario_choice"].includes(exercise.type)) {
    const options = Array.isArray(exercise.options) ? exercise.options.map(normalize) : [];
    if (new Set(options).size !== options.length) fail(`Duplicate options: ${id}`);
    if (options.filter((option) => option === normalize(exercise.answer)).length !== 1) fail(`Correct answer must appear exactly once: ${id}`);
  }
  for (const reference of [...(exercise.vocabularyRefs ?? []), ...(exercise.reusedVocabularyRefs ?? [])]) {
    allCandidateRefs.push({ source: id, id: reference });
  }
}
for (const reference of allCandidateRefs) {
  if (!knownItemIds.has(reference.id) && !candidateIds.has(reference.id)) fail(`Unresolved vocabulary reference ${reference.id} in ${reference.source}`);
}

const slug = `unit-${String(unitNumber).padStart(2, "0")}`;
const relativeDirectory = `units/${slug}`;
const nextEntry = {
  unit: unitNumber,
  slug,
  title_de: titleDe,
  title_ar: titleAr,
  pages: [Number.isFinite(pagesFrom) ? pagesFrom : 0, Number.isFinite(pagesTo) ? pagesTo : 0],
  vocabularyFile: `${relativeDirectory}/vocabulary.json`,
  exercisesFile: `${relativeDirectory}/exercises.json`,
  vocabularyCount: vocabulary.items.length,
  exerciseCount: exercises.exercises.length,
  enabled: true,
};

const nextIndex = structuredClone(index);
nextIndex.units = nextIndex.units.filter((entry) => entry.unit !== unitNumber);
nextIndex.units.push(nextEntry);
nextIndex.units.sort((left, right) => left.unit - right.unit);
nextIndex.course.contentVersion = new Date().toISOString().slice(0, 10);

if (dryRun) {
  console.log(JSON.stringify({
    ok: true,
    dryRun: true,
    replace: Boolean(existingEntry),
    entry: nextEntry,
    validation: {
      vocabulary: vocabulary.items.length,
      exercises: exercises.exercises.length,
      references: allCandidateRefs.length,
    },
  }, null, 2));
  process.exit(0);
}

const targetDirectory = path.join(root, relativeDirectory);
const nonce = `${process.pid}-${Date.now()}`;
const temporaryDirectory = path.join(root, `.course-add-${nonce}`);
const previousDirectory = path.join(root, `.course-previous-${nonce}`);
const temporaryIndex = path.join(root, `.index-${nonce}.json`);
const previousIndex = path.join(root, `.index-previous-${nonce}.json`);
let movedPreviousUnit = false;
let installedUnit = false;
let movedPreviousIndex = false;

try {
  fs.mkdirSync(temporaryDirectory, { recursive: false });
  fs.copyFileSync(sourceVocabularyPath, path.join(temporaryDirectory, "vocabulary.json"));
  fs.copyFileSync(sourceExercisesPath, path.join(temporaryDirectory, "exercises.json"));
  fs.writeFileSync(temporaryIndex, `${JSON.stringify(nextIndex, null, 2)}\n`, "utf8");

  if (fs.existsSync(targetDirectory)) {
    fs.renameSync(targetDirectory, previousDirectory);
    movedPreviousUnit = true;
  }
  fs.renameSync(temporaryDirectory, targetDirectory);
  installedUnit = true;
  fs.renameSync(indexPath, previousIndex);
  movedPreviousIndex = true;
  fs.renameSync(temporaryIndex, indexPath);

  const finalAudit = auditCourse({ courseRoot: root, productionRoot });
  if (!finalAudit.ok) fail(`Final course audit failed: ${JSON.stringify(finalAudit.errors)}`);

  if (movedPreviousUnit) fs.rmSync(previousDirectory, { recursive: true, force: true });
  if (movedPreviousIndex) fs.rmSync(previousIndex, { force: true });
  console.log(JSON.stringify({ ok: true, dryRun: false, entry: nextEntry, audit: finalAudit.totals }, null, 2));
} catch (error) {
  if (movedPreviousIndex && fs.existsSync(previousIndex)) {
    if (fs.existsSync(indexPath)) fs.rmSync(indexPath, { force: true });
    fs.renameSync(previousIndex, indexPath);
  }
  if (installedUnit && fs.existsSync(targetDirectory)) fs.rmSync(targetDirectory, { recursive: true, force: true });
  if (movedPreviousUnit && fs.existsSync(previousDirectory)) fs.renameSync(previousDirectory, targetDirectory);
  if (fs.existsSync(temporaryDirectory)) fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  if (fs.existsSync(temporaryIndex)) fs.rmSync(temporaryIndex, { force: true });
  throw error;
}
