import { Verb, Vocabulary } from "../types";
import {
  ContentFamily,
  createNextContentId,
  getContentIdentityKey,
  getGermanContentTerm,
  getPotentialDuplicateKey,
  inferContentFamily,
  sameContentId,
} from "./contentIdentityService";

export type ImportItemAction =
  | "new"
  | "update"
  | "exact_duplicate"
  | "potential_duplicate"
  | "id_conflict"
  | "invalid";

export type PotentialDuplicateDecision = "skip" | "add";
export type ExistingUpdateDecision = "skip" | "update";
export type ImportableContent = Verb | Vocabulary;

export interface ImportPreviewItem<T extends ImportableContent = ImportableContent> {
  index: number;
  term: string;
  incomingId?: string | number;
  action: ImportItemAction;
  existingId?: string | number;
  existingTerm?: string;
  reason?: string;
  item: T;
}

export interface ImportPreviewReport<T extends ImportableContent = ImportableContent> {
  family: ContentFamily;
  total: number;
  newItems: number;
  updates: number;
  exactDuplicates: number;
  potentialDuplicates: number;
  idConflicts: number;
  invalidItems: number;
  items: ImportPreviewItem<T>[];
}

export interface AppliedImport<T extends ImportableContent = ImportableContent> {
  items: T[];
  created: number;
  updated: number;
  skipped: number;
  changes: Array<{ index: number; action: "created" | "updated"; item: T }>;
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return Object.keys(record)
    .filter((key) => !["id", "isCustom", "isDeleted"].includes(key))
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      result[key] = sortObject(record[key]);
      return result;
    }, {});
}

function contentEquals(incoming: ImportableContent, existing: ImportableContent): boolean {
  const incomingFields = sortObject(incoming) as Record<string, unknown>;
  const existingFields = sortObject(existing) as Record<string, unknown>;
  return Object.keys(incomingFields).every((key) =>
    JSON.stringify(incomingFields[key]) === JSON.stringify(existingFields[key])
  );
}

export function validateContentItem(
  value: unknown,
  family: ContentFamily
): { valid: true; item: ImportableContent } | { valid: false; reason: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { valid: false, reason: "Item must be a JSON object." };
  }
  const item = value as ImportableContent;
  if (item.id === undefined || item.id === null || String(item.id).trim() === "") {
    return { valid: false, reason: "Missing or empty id." };
  }
  if (!String(item.arabic || "").trim()) {
    return { valid: false, reason: "Missing Arabic meaning." };
  }
  if (!getContentIdentityKey(item, family)) {
    return { valid: false, reason: family === "verbs" ? "Missing infinitiv." : "Missing German term." };
  }
  if (family !== "verbs") {
    const explicit = item.dataMeta?.family;
    if (explicit && inferContentFamily(item as Vocabulary) !== family) {
      return { valid: false, reason: `Item family does not match ${family}.` };
    }
  }
  return { valid: true, item };
}

function countActions(items: ImportPreviewItem[]) {
  const count = (action: ImportItemAction) => items.filter((item) => item.action === action).length;
  return {
    newItems: count("new"),
    updates: count("update"),
    exactDuplicates: count("exact_duplicate"),
    potentialDuplicates: count("potential_duplicate"),
    idConflicts: count("id_conflict"),
    invalidItems: count("invalid"),
  };
}

export function previewContentImport<T extends ImportableContent>(
  incoming: unknown,
  existing: T[],
  family: ContentFamily,
  potentialPool: ImportableContent[] = existing
): ImportPreviewReport<T> {
  if (!Array.isArray(incoming)) {
    const invalid = [{
      index: 0,
      term: "",
      action: "invalid" as const,
      reason: "The JSON root must be an array.",
      item: {} as T,
    }];
    return { family, total: 0, ...countActions(invalid), items: invalid };
  }

  const existingById = new Map(existing.map((item) => [String(item.id), item]));
  const existingByIdentity = new Map(existing.map((item) => [getContentIdentityKey(item, family), item]));
  const potentialByKey = new Map<string, ImportableContent[]>();
  potentialPool.forEach((item) => {
    const candidateFamily = family === "verbs" ? "verbs" : inferContentFamily(item as Vocabulary);
    const key = getPotentialDuplicateKey(item, candidateFamily);
    if (key) potentialByKey.set(key, [...(potentialByKey.get(key) || []), item]);
  });

  const incomingById = new Map<string, ImportableContent>();
  const incomingByIdentity = new Map<string, ImportableContent>();
  const items: ImportPreviewItem<T>[] = incoming.map((raw, index) => {
    const validation = validateContentItem(raw, family);
    const rawItem = (raw && typeof raw === "object" ? raw : {}) as T;
    const term = getGermanContentTerm(rawItem, family);
    if ("reason" in validation) {
      return { index, term, incomingId: rawItem.id, action: "invalid", reason: validation.reason, item: rawItem };
    }

    const item = validation.item as T;
    const idKey = String(item.id);
    const identity = getContentIdentityKey(item, family);
    const earlierById = incomingById.get(idKey);
    const earlierByIdentity = incomingByIdentity.get(identity);
    if (earlierById && getContentIdentityKey(earlierById, family) !== identity) {
      return {
        index,
        term,
        incomingId: item.id,
        action: "id_conflict",
        existingId: earlierById.id,
        existingTerm: getGermanContentTerm(earlierById, family),
        reason: "The same incoming id is used for a different German identity.",
        item,
      };
    }
    if (earlierByIdentity) {
      return {
        index,
        term,
        incomingId: item.id,
        action: "exact_duplicate",
        existingId: earlierByIdentity.id,
        existingTerm: getGermanContentTerm(earlierByIdentity, family),
        reason: "The same German identity appears more than once in the import batch.",
        item,
      };
    }
    incomingById.set(idKey, item);
    incomingByIdentity.set(identity, item);

    const idMatch = existingById.get(idKey);
    if (idMatch && getContentIdentityKey(idMatch, family) !== identity) {
      return {
        index,
        term,
        incomingId: item.id,
        action: "id_conflict",
        existingId: idMatch.id,
        existingTerm: getGermanContentTerm(idMatch, family),
        reason: "Incoming id belongs to a different existing German identity.",
        item,
      };
    }

    const identityMatch = existingByIdentity.get(identity);
    if (identityMatch) {
      return {
        index,
        term,
        incomingId: item.id,
        action: contentEquals(item, identityMatch) ? "exact_duplicate" : "update",
        existingId: identityMatch.id,
        existingTerm: getGermanContentTerm(identityMatch, family),
        reason: contentEquals(item, identityMatch)
          ? "All meaningful fields already match."
          : "Same German identity with changed fields; existing id will be preserved.",
        item,
      };
    }

    const potentialKey = getPotentialDuplicateKey(item, family);
    const potentialMatch = (potentialByKey.get(potentialKey) || []).find((candidate) => {
      const candidateFamily = family === "verbs" ? "verbs" : inferContentFamily(candidate as Vocabulary);
      return getContentIdentityKey(candidate, candidateFamily) !== identity;
    });
    if (potentialMatch) {
      const potentialFamily = family === "verbs" ? "verbs" : inferContentFamily(potentialMatch as Vocabulary);
      return {
        index,
        term,
        incomingId: item.id,
        action: "potential_duplicate",
        existingId: potentialMatch.id,
        existingTerm: getGermanContentTerm(potentialMatch, potentialFamily),
        reason: "German spelling is potentially equivalent after umlaut/transliteration normalization.",
        item,
      };
    }

    return { index, term, incomingId: item.id, action: "new", reason: "New German identity.", item };
  });

  return { family, total: incoming.length, ...countActions(items), items };
}

export function applyContentImportPreview<T extends ImportableContent>(
  existing: T[],
  preview: ImportPreviewReport<T>,
  potentialDecisions: Record<number, PotentialDuplicateDecision> = {},
  updateDecisions: Record<number, ExistingUpdateDecision> = {},
  markCustom = false
): AppliedImport<T> {
  if (preview.idConflicts || preview.invalidItems) {
    throw new Error("Import contains id conflicts or invalid items.");
  }

  const result = existing.map((item) => ({ ...item })) as T[];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const changes: AppliedImport<T>["changes"] = [];

  preview.items.forEach((entry) => {
    if (entry.action === "exact_duplicate") {
      skipped += 1;
      return;
    }
    if (entry.action === "potential_duplicate" && (potentialDecisions[entry.index] || "skip") === "skip") {
      skipped += 1;
      return;
    }
    if (entry.action === "update") {
      if ((updateDecisions[entry.index] || "skip") === "skip") {
        skipped += 1;
        return;
      }
      const targetIndex = result.findIndex((item) => sameContentId(item.id, entry.existingId));
      if (targetIndex < 0) throw new Error(`Existing item ${entry.existingId} disappeared before apply.`);
      const current = result[targetIndex];
      result[targetIndex] = {
        ...current,
        ...entry.item,
        id: current.id,
        isCustom: markCustom ? current.isCustom ?? true : current.isCustom,
      } as T;
      changes.push({ index: entry.index, action: "updated", item: result[targetIndex] });
      updated += 1;
      return;
    }

    const id = createNextContentId(result, preview.family);
    const createdItem = { ...entry.item, id, isCustom: markCustom || entry.item.isCustom } as T;
    result.push(createdItem);
    changes.push({ index: entry.index, action: "created", item: createdItem });
    created += 1;
  });

  const verification = previewContentImport(result, [], preview.family);
  if (verification.invalidItems || verification.idConflicts || verification.exactDuplicates) {
    throw new Error("Final import result failed identity validation.");
  }
  return { items: result, created, updated, skipped, changes };
}
