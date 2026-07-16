import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  ContentFamily,
  getContentIdentityKey,
  getGermanContentTerm,
  getPotentialDuplicateKey,
} from "../src/services/contentIdentityService.ts";
import { ImportableContent, validateContentItem } from "../src/services/contentImportService.ts";
import type { Verb, Vocabulary } from "../src/types.ts";
import {
  createDashboardVerbSummary,
  createDashboardVocabularySummary,
} from "../src/services/dataService.ts";
import { DATA_VERSION } from "../src/services/dataVersion.ts";

export const CONTENT_FILES: Record<ContentFamily, string> = {
  verbs: "public/data/verbs.json",
  nouns: "public/data/nouns.json",
  adjectives: "public/data/adjectives.json",
  phrases: "public/data/phrases.json",
  "other-vocabulary": "public/data/other-vocabulary.json",
};

export interface AuditResult {
  success: boolean;
  counts: Record<ContentFamily, number>;
  errors: string[];
  warnings: string[];
}

function addExampleWarnings(
  value: unknown,
  location: string,
  warnings: string[],
  visited = new Set<object>()
): void {
  if (!value || typeof value !== "object") return;
  if (visited.has(value as object)) return;
  visited.add(value as object);

  if (Array.isArray(value)) {
    value.forEach((child, index) => addExampleWarnings(child, `${location}[${index}]`, warnings, visited));
    return;
  }

  const record = value as Record<string, unknown>;
  const firstText = (keys: string[]) => keys.find((key) => typeof record[key] === "string" && record[key].trim());
  const germanExample = firstText(["de", "example_de", "full_de", "sentence_de"]);
  const germanContext = germanExample || firstText(["question_de"]);
  const arabicExample = firstText(["ar", "example_ar", "translation_ar", "full_ar", "sentence_ar"]);
  if (germanExample && !arabicExample) warnings.push(`${location}: German example has no Arabic translation.`);
  if (arabicExample && !germanContext) warnings.push(`${location}: Arabic example has no German sentence.`);

  Object.entries(record).forEach(([key, child]) => {
    if (typeof child === "object" && child !== null) {
      addExampleWarnings(child, `${location}.${key}`, warnings, visited);
    }
  });
}

export async function auditContent(rootDir = process.cwd()): Promise<AuditResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const counts = Object.fromEntries(
    (Object.keys(CONTENT_FILES) as ContentFamily[]).map((family) => [family, 0])
  ) as Record<ContentFamily, number>;
  const globalIds = new Map<string, { family: ContentFamily; term: string }>();
  const auditedItems = new Map<ContentFamily, ImportableContent[]>();

  for (const [family, relativePath] of Object.entries(CONTENT_FILES) as Array<[ContentFamily, string]>) {
    const fullPath = path.resolve(rootDir, relativePath);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(fullPath, "utf8"));
    } catch (error) {
      errors.push(`${relativePath}: JSON parsing failed: ${(error as Error).message}`);
      continue;
    }
    if (!Array.isArray(parsed)) {
      errors.push(`${relativePath}: root value must be an array.`);
      continue;
    }

    counts[family] = parsed.length;
    auditedItems.set(family, parsed as ImportableContent[]);
    const ids = new Map<string, number>();
    const identities = new Map<string, number>();
    const potentialGroups = new Map<string, Array<{ index: number; identity: string; term: string }>>();

    parsed.forEach((raw, index) => {
      const location = `${relativePath}[${index}]`;
      const validation = validateContentItem(raw, family);
      if ("reason" in validation) {
        errors.push(`${location}: ${validation.reason}`);
        return;
      }
      const item = validation.item as ImportableContent;
      const id = String(item.id).trim();
      const identity = getContentIdentityKey(item, family);
      const term = getGermanContentTerm(item, family);

      if (ids.has(id)) {
        errors.push(`${location}: duplicate id ${id}; first used at index ${ids.get(id)}.`);
      } else {
        ids.set(id, index);
      }
      if (identities.has(identity)) {
        errors.push(`${location}: exact duplicate German identity "${term}"; first used at index ${identities.get(identity)}.`);
      } else {
        identities.set(identity, index);
      }

      const globalId = globalIds.get(id);
      if (globalId && globalId.family !== family) {
        errors.push(`${location}: id ${id} conflicts with ${globalId.family} item "${globalId.term}".`);
      } else {
        globalIds.set(id, { family, term });
      }

      const potentialKey = getPotentialDuplicateKey(item, family);
      if (potentialKey) {
        potentialGroups.set(potentialKey, [
          ...(potentialGroups.get(potentialKey) || []),
          { index, identity, term },
        ]);
      }
      addExampleWarnings(item, location, warnings);
    });

    potentialGroups.forEach((group) => {
      const distinctIdentities = new Set(group.map((item) => item.identity));
      if (distinctIdentities.size > 1) {
        warnings.push(
          `${relativePath}: potential duplicate spellings: ${group.map((item) => `#${item.index} "${item.term}"`).join(", ")}.`
        );
      }
    });
  }

  try {
    const dashboardManifest = JSON.parse(
      await readFile(path.resolve(rootDir, "public/data/dashboard-manifest.json"), "utf8"),
    ) as Record<string, unknown>;
    const expectedVerbs = (auditedItems.get("verbs") || []).map((item) => createDashboardVerbSummary(item as Verb));
    const expectedVocabulary = ([
      ...(auditedItems.get("nouns") || []),
      ...(auditedItems.get("adjectives") || []),
      ...(auditedItems.get("phrases") || []),
      ...(auditedItems.get("other-vocabulary") || []),
    ]).map((item) => createDashboardVocabularySummary(item as Vocabulary));
    if (dashboardManifest.schemaVersion !== "dashboard-manifest-v1" || dashboardManifest.dataVersion !== DATA_VERSION) {
      errors.push("public/data/dashboard-manifest.json: schema or data version is stale.");
    }
    if (JSON.stringify(dashboardManifest.verbs) !== JSON.stringify(expectedVerbs)) {
      errors.push("public/data/dashboard-manifest.json: verb summaries are stale.");
    }
    if (JSON.stringify(dashboardManifest.vocabulary) !== JSON.stringify(expectedVocabulary)) {
      errors.push("public/data/dashboard-manifest.json: vocabulary summaries are stale.");
    }
  } catch (error) {
    errors.push(`public/data/dashboard-manifest.json: validation failed: ${(error as Error).message}`);
  }

  return { success: errors.length === 0, counts, errors, warnings };
}

export function printAudit(result: AuditResult): void {
  console.log("Content audit counts:");
  (Object.keys(CONTENT_FILES) as ContentFamily[]).forEach((family) => {
    console.log(`  ${family}: ${result.counts[family]}`);
  });
  console.log(`Warnings: ${result.warnings.length}`);
  result.warnings.slice(0, 50).forEach((warning) => console.warn(`  WARN ${warning}`));
  if (result.warnings.length > 50) console.warn(`  ... ${result.warnings.length - 50} more warning(s)`);
  console.log(`Errors: ${result.errors.length}`);
  result.errors.forEach((error) => console.error(`  ERROR ${error}`));
  console.log(result.success ? "Content audit passed." : "Content audit failed.");
}

const currentFile = fileURLToPath(import.meta.url);
if (path.resolve(process.argv[1] || "") === path.resolve(currentFile)) {
  const result = await auditContent();
  printAudit(result);
  if (!result.success) process.exitCode = 1;
}
