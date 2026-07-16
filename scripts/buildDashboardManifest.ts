import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Verb, Vocabulary } from "../src/types";
import {
  createDashboardVerbSummary,
  createDashboardVocabularySummary,
} from "../src/services/dataService";
import { DATA_VERSION } from "../src/services/dataVersion";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = <T>(file: string): T => JSON.parse(fs.readFileSync(path.join(root, file), "utf8")) as T;
const verbs = read<Verb[]>("public/data/verbs.json");
const vocabulary = [
  ...read<Vocabulary[]>("public/data/nouns.json"),
  ...read<Vocabulary[]>("public/data/adjectives.json"),
  ...read<Vocabulary[]>("public/data/phrases.json"),
  ...read<Vocabulary[]>("public/data/other-vocabulary.json"),
];
const manifest = {
  schemaVersion: "dashboard-manifest-v1",
  dataVersion: DATA_VERSION,
  generatedFrom: ["verbs.json", "nouns.json", "adjectives.json", "phrases.json", "other-vocabulary.json"],
  verbs: verbs.map(createDashboardVerbSummary),
  vocabulary: vocabulary.map(createDashboardVocabularySummary),
};

fs.writeFileSync(
  path.join(root, "public/data/dashboard-manifest.json"),
  `${JSON.stringify(manifest)}\n`,
  "utf8",
);
console.log(`Dashboard manifest: ${manifest.verbs.length} verbs, ${manifest.vocabulary.length} vocabulary items.`);
