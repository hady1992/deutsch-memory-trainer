import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  applyContentImportPreview,
  previewContentImport,
} from "../src/services/contentImportService.ts";
import {
  getContentIdentityKey,
  getPotentialDuplicateKey,
} from "../src/services/contentIdentityService.ts";
import { DataService } from "../src/services/dataService.ts";
import { Verb, Vocabulary } from "../src/types.ts";
import { auditContent, CONTENT_FILES } from "./auditContent.ts";

const verb = (id: number, infinitiv: string, arabic = "يبالغ"): Verb => ({
  id,
  infinitiv,
  arabic,
  praesens: "",
  praeteritum: "",
  perfekt: "",
  level: "B1",
  type: "unregelmäßig",
});
const noun = (id: string, term: string, arabic = "مكيف"): Vocabulary => ({
  id,
  term,
  arabic,
  type: "Nomen",
  level: "B1",
  dataMeta: { family: "noun" },
});
const phrase = (id: string, term: string, arabic = "كيف حالك؟"): Vocabulary => ({
  id,
  term,
  phrase: term,
  arabic,
  type: "Phrase",
  level: "B1",
  dataMeta: { family: "phrase" },
});

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

function assertImportIdentityRules(): void {
  assert.equal(
    getContentIdentityKey(verb(1, " Übertreiben "), "verbs"),
    getContentIdentityKey(verb(2, "übertreiben"), "verbs")
  );

  const sameVerbDifferentId = previewContentImport(
    [verb(999, "übertreiben", "يبالغ كثيرًا")],
    [verb(123, "übertreiben")],
    "verbs"
  );
  assert.equal(sameVerbDifferentId.items[0].action, "update");
  assert.equal(sameVerbDifferentId.items[0].existingId, 123);

  const sameIdDifferentVerb = previewContentImport(
    [verb(123, "gehen", "يذهب")],
    [verb(123, "übertreiben")],
    "verbs"
  );
  assert.equal(sameIdDifferentVerb.items[0].action, "id_conflict");

  const selfEdit = previewContentImport(
    [verb(123, "übertreiben", "يفرط / يبالغ")],
    [verb(123, "übertreiben")],
    "verbs"
  );
  assert.equal(selfEdit.items[0].action, "update");

  assert.equal(
    getContentIdentityKey(noun("noun_1", "die Klimaanlage, -n"), "nouns"),
    getContentIdentityKey(noun("noun_2", "Klimaanlage"), "nouns")
  );
  assert.equal(
    getContentIdentityKey(phrase("phrase_1", "Wie   geht es dir ?"), "phrases"),
    getContentIdentityKey(phrase("phrase_2", "Wie geht es dir ?"), "phrases")
  );

  const streetIncoming: Vocabulary = { id: "other_2", term: "Strasse", arabic: "شارع", type: "Wort", level: "B1", dataMeta: { family: "other" } };
  const streetExisting: Vocabulary = { id: "other_1", term: "Straße", arabic: "شارع", type: "Wort", level: "B1", dataMeta: { family: "other" } };
  const streetPreview = previewContentImport(
    [streetIncoming],
    [streetExisting],
    "other-vocabulary"
  );
  assert.equal(streetPreview.items[0].action, "potential_duplicate");
  assert.equal(
    getPotentialDuplicateKey(streetIncoming, "other-vocabulary"),
    getPotentialDuplicateKey(streetExisting, "other-vocabulary")
  );

  const badBatch = previewContentImport(
    [verb(10, "gehen", "يذهب"), verb(10, "kommen", "يأتي")],
    [],
    "verbs"
  );
  assert.equal(badBatch.idConflicts, 1);
  assert.throws(() => applyContentImportPreview([], badBatch), /id conflicts or invalid/i);

  const firstPreview = previewContentImport([verb(777, "lernen", "يتعلم")], [], "verbs");
  const firstApply = applyContentImportPreview([], firstPreview);
  assert.equal(firstApply.items.length, 1);
  assert.equal(firstApply.items[0].id, 1);
  const secondPreview = previewContentImport([verb(777, "lernen", "يتعلم")], firstApply.items, "verbs");
  const secondApply = applyContentImportPreview(firstApply.items, secondPreview);
  assert.equal(secondApply.items.length, 1);
  assert.equal(secondApply.created, 0);

  const updatePreview = previewContentImport([verb(999, "lernen", "يدرس")], firstApply.items, "verbs");
  const updated = applyContentImportPreview(firstApply.items, updatePreview, {}, { 0: "update" });
  assert.equal(updated.items[0].id, 1);
  assert.equal(updated.items[0].arabic, "يدرس");
}

async function assertManualSaveAndUserStorageProtection(): Promise<void> {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  const productionVerb = verb(123, "übertreiben");
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async (input: string | URL | Request) => {
      const url = String(input);
      const payload = url.includes("/data/verbs.json") ? [productionVerb] : [];
      return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });
  storage.setItem("dmt_progress", JSON.stringify({ verbs: { 123: { nextReviewAt: 1 } } }));
  storage.setItem("deutschTrainerDailyStudySets", JSON.stringify({ sets: { verbs: { itemIds: [123] } } }));
  storage.setItem("dmt_favorites", JSON.stringify([123]));
  storage.setItem("deutsch-memory-trainer-mistakes", JSON.stringify([{ itemId: 123 }]));
  DataService.replaceLocalContentStore({
    version: 2,
    customVerbs: [],
    customVocab: [],
    overrideVerbs: {},
    overrideVocab: {},
  });
  const duplicate = await DataService.saveVerb(verb(0, " Übertreiben "));
  assert.equal(duplicate.success, false);
  assert.equal(duplicate.reason, "exact_duplicate");
  assert.equal(duplicate.existingId, 123);
  const selfUpdate = await DataService.saveVerb(verb(123, "übertreiben", "يفرط / يبالغ"));
  assert.equal(selfUpdate.success, true);
  assert.equal(selfUpdate.action, "updated");
  assert.ok(storage.getItem("dmt_progress"));
  assert.ok(storage.getItem("deutschTrainerDailyStudySets"));
  assert.ok(storage.getItem("dmt_favorites"));
  assert.ok(storage.getItem("deutsch-memory-trainer-mistakes"));
}

async function assertAuditFailureAndRecovery(): Promise<void> {
  assert.deepEqual(Object.values(CONTENT_FILES).map((filePath) => path.basename(filePath)).sort(), [
    "adjectives.json",
    "nouns.json",
    "other-vocabulary.json",
    "phrases.json",
    "verbs.json",
  ]);

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "dmt-content-audit-"));
  try {
    await mkdir(path.join(tempRoot, "public/data"), { recursive: true });
    for (const relativePath of Object.values(CONTENT_FILES)) {
      await copyFile(path.resolve(relativePath), path.resolve(tempRoot, relativePath));
    }
    await copyFile(
      path.resolve("public/data/dashboard-manifest.json"),
      path.resolve(tempRoot, "public/data/dashboard-manifest.json"),
    );
    const verbsPath = path.resolve(tempRoot, CONTENT_FILES.verbs);
    const original = await readFile(verbsPath, "utf8");
    const verbs = JSON.parse(original);
    verbs.push({ ...verbs[0] });
    await writeFile(verbsPath, JSON.stringify(verbs), "utf8");
    const failed = await auditContent(tempRoot);
    assert.equal(failed.success, false);
    assert.ok(failed.errors.some((error) => /duplicate id|duplicate German identity/i.test(error)));
    await writeFile(verbsPath, original, "utf8");
    const recovered = await auditContent(tempRoot);
    assert.equal(recovered.success, true);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

assertImportIdentityRules();
await assertManualSaveAndUserStorageProtection();
await assertAuditFailureAndRecovery();
console.log("Content identity/import tests passed (16 required scenarios covered)." );
