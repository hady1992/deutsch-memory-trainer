import assert from "node:assert/strict";
import {
  B2_GRAMMAR_PROGRESS_KEY,
  B2GrammarProgressService,
} from "../src/features/b2-grammar/b2GrammarProgressService";
import { getB2GrammarPromptPresentation } from "../src/features/b2-grammar/b2GrammarPromptService";
import { ImportExportService } from "../src/services/importExportService";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, String(value)); }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });

const arabicPrompt = getB2GrammarPromptPresentation({
  prompt_de: "Ich ______ gern mehr Verantwortung übernehmen.",
  prompt_ar: "أنا ______ في تحمّل مسؤولية أكبر.",
}, "ar");
assert.equal(arabicPrompt.localizedPrompt, "أنا ______ في تحمّل مسؤولية أكبر.");
assert.equal(arabicPrompt.germanPrompt, "Ich ______ gern mehr Verantwortung übernehmen.");

const germanPrompt = getB2GrammarPromptPresentation({
  prompt_de: "Ich ______ gern mehr Verantwortung übernehmen.",
  prompt_ar: "أنا ______ في تحمّل مسؤولية أكبر.",
}, "de");
assert.equal(germanPrompt.localizedPrompt, "Ich ______ gern mehr Verantwortung übernehmen.");
assert.equal(germanPrompt.germanPrompt, null);

storage.setItem("dmt_progress", JSON.stringify({ legacy: true }));
storage.setItem("dmt_b2_course_progress_v1", JSON.stringify({ course: true }));

assert.equal(B2GrammarProgressService.getProgress().version, 1);
B2GrammarProgressService.visit("gr-01", "gr01-e001", 3);
assert.equal(B2GrammarProgressService.getResumePosition("gr-01", ["x", "y", "z", "gr01-e001"]), 3);

let result = B2GrammarProgressService.recordAnswer("gr-01", "gr01-e001", "wrong", false);
assert.equal(result.status, "review");
assert.equal(result.unresolvedMistake, true);
assert.equal(result.wrongCount, 1);

result = B2GrammarProgressService.recordAnswer("gr-01", "gr01-e001", "right", true);
assert.equal(result.unresolvedMistake, true, "One correct answer must not clear an unresolved mistake");
assert.equal(result.consecutiveCorrect, 1);

result = B2GrammarProgressService.recordAnswer("gr-01", "gr01-e001", "right", true);
assert.equal(result.unresolvedMistake, false, "Two consecutive correct answers should clear the mistake");
assert.equal(result.status, "known");

B2GrammarProgressService.recordSelfAssessment("gr-01", "gr01-e024", "text", "review");
assert.equal(B2GrammarProgressService.getProgress().exercises["gr01-e024"].wrongCount, 0);
assert.equal(B2GrammarProgressService.getProgress().exercises["gr01-e024"].status, "review");

B2GrammarProgressService.visit("gr-21", "gr21-e007", 6);
B2GrammarProgressService.recordAnswer("gr-21", "gr21-e007", "phase three answer", true);
B2GrammarProgressService.visit("gr-31", "gr31-e004", 3);
B2GrammarProgressService.recordAnswer("gr-31", "gr31-e004", "phase four wrong answer", false);
B2GrammarProgressService.visit("gr-41", "gr41-e005", 4);
B2GrammarProgressService.recordAnswer("gr-41", "gr41-e005", "phase five answer", true);
assert.equal(B2GrammarProgressService.getResumePosition("gr-21", ["gr21-e001", "gr21-e007"]), 1);
assert.equal(B2GrammarProgressService.getProgress().exercises["gr31-e004"].unresolvedMistake, true);
assert.equal(B2GrammarProgressService.getResumePosition("gr-41", ["gr41-e001", "gr41-e005"]), 1);

const validBackup = B2GrammarProgressService.getBackupData();
assert.equal(validBackup.topics["gr-21"].lastExerciseId, "gr21-e007");
assert.equal(validBackup.topics["gr-31"].lastExerciseId, "gr31-e004");
assert.equal(validBackup.topics["gr-41"].lastExerciseId, "gr41-e005");
assert.equal(validBackup.exercises["gr31-e004"].unresolvedMistake, true);
assert.equal(B2GrammarProgressService.validateBackup(validBackup), true);
assert.equal(B2GrammarProgressService.importBackup({ version: 1, topics: [], exercises: [] }), false);
const exportedBackup = ImportExportService.createFullBackup();
assert.deepEqual(exportedBackup.b2GrammarProgress, validBackup);

const importResult = ImportExportService.applyFullBackup({
  success: true,
  backup: { b2GrammarProgress: validBackup },
  contentStore: { version: 2, customVerbs: [], customVocab: [], overrideVerbs: {}, overrideVocab: {} },
});
assert.equal(importResult.success, true);
assert.deepEqual(B2GrammarProgressService.getProgress(), validBackup);
assert.equal(B2GrammarProgressService.getProgress().topics["gr-21"].lastExerciseId, "gr21-e007");
assert.equal(B2GrammarProgressService.getProgress().topics["gr-41"].lastExerciseId, "gr41-e005");
assert.equal(B2GrammarProgressService.getProgress().exercises["gr31-e004"].unresolvedMistake, true);
assert.deepEqual(JSON.parse(storage.getItem("dmt_progress") || "{}"), { legacy: true });
assert.deepEqual(JSON.parse(storage.getItem("dmt_b2_course_progress_v1") || "{}"), { course: true });

const grammarBeforeLegacyImport = storage.getItem(B2_GRAMMAR_PROGRESS_KEY);
const legacyImportResult = ImportExportService.applyFullBackup({
  success: true,
  backup: { version: 2, progress: { legacyItem: { correctCount: 1 } } },
  contentStore: { version: 2, customVerbs: [], customVocab: [], overrideVerbs: {}, overrideVocab: {} },
});
assert.equal(legacyImportResult.success, true, "A backup without B2 grammar progress must remain importable");
assert.equal(
  storage.getItem(B2_GRAMMAR_PROGRESS_KEY),
  grammarBeforeLegacyImport,
  "Importing a legacy backup must preserve existing B2 grammar progress",
);
assert.deepEqual(JSON.parse(storage.getItem("dmt_progress") || "{}"), { legacyItem: { correctCount: 1 } });
assert.deepEqual(JSON.parse(storage.getItem("dmt_b2_course_progress_v1") || "{}"), { course: true });

storage.setItem(B2_GRAMMAR_PROGRESS_KEY, "{broken");
assert.equal(B2GrammarProgressService.getProgress().lastTopicId, "");
assert.equal(storage.getItem(B2_GRAMMAR_PROGRESS_KEY), "{broken", "Unreadable data must not be overwritten automatically");

console.log("B2 grammar progress tests: PASSED");
console.log("Bilingual German prompt presentation: PASSED");
console.log("Independent storage key: PASSED");
console.log("Two-correct mistake resolution: PASSED");
console.log("Corrupt storage fallback: PASSED");
console.log("Legacy progress isolation: PASSED");
console.log("Full backup export/import integration: PASSED");
console.log("Legacy backup compatibility: PASSED");
console.log("Phase 3/4/5 resume and backup restoration: PASSED");
