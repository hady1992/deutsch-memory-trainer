import { Verb, Vocabulary } from "../types";

export type ContentFamily = "verbs" | "nouns" | "adjectives" | "phrases" | "other-vocabulary";
export type ContentIdentityInput = Partial<Omit<Verb, "id">> &
  Partial<Omit<Vocabulary, "id">> & { id?: string | number };

const FAMILY_PREFIXES: Record<Exclude<ContentFamily, "verbs">, string> = {
  nouns: "noun_",
  adjectives: "adj_",
  phrases: "phrase_",
  "other-vocabulary": "other_",
};

const INVISIBLE_SPACES = /[\u00A0\u2000-\u200D\u202F\u205F\u2060\u3000\uFEFF]/g;
const DASHES = /[‐‑‒–—―]/g;
const SINGLE_QUOTES = /[‘’‚‛]/g;
const DOUBLE_QUOTES = /[“”„‟]/g;

export function normalizeGermanText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(INVISIBLE_SPACES, " ")
    .replace(DASHES, "-")
    .replace(SINGLE_QUOTES, "'")
    .replace(DOUBLE_QUOTES, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("de-DE");
}

export function stripGermanArticle(value: unknown): string {
  return normalizeGermanText(value).replace(/^(?:der\s*\/\s*die|der|die|das)\s+/i, "").trim();
}

function nounTerm(item: Partial<Vocabulary>): string {
  const source = item.cleanTerm || item.singular || item.term || item.phrase || item.rawTerm || "";
  const withoutCompactPlural = String(source).split(",")[0];
  return stripGermanArticle(withoutCompactPlural);
}

export function inferContentFamily(item: Partial<Vocabulary>, fallback?: ContentFamily): ContentFamily {
  if (fallback) return fallback;
  const explicit = normalizeGermanText(item.dataMeta?.family);
  if (explicit === "noun") return "nouns";
  if (explicit === "adjective") return "adjectives";
  if (explicit === "phrase") return "phrases";
  if (explicit === "other") return "other-vocabulary";

  const type = normalizeGermanText(item.originalType || item.type);
  if (type.includes("nomen") || type === "noun") return "nouns";
  if (type.includes("adjektiv") || type === "adjective") return "adjectives";
  if (type.includes("phrase") || item.phrase) return "phrases";
  return "other-vocabulary";
}

export function getGermanContentTerm(item: ContentIdentityInput, family: ContentFamily): string {
  if (family === "verbs") return String(item.infinitiv || "").trim();
  if (family === "nouns") return nounTerm(item);
  if (family === "phrases") return String(item.phrase || item.term || item.cleanTerm || "").trim();
  return String(item.term || item.cleanTerm || item.phrase || "").trim();
}

export function getVerbIdentityKey(verb: ContentIdentityInput): string {
  const term = normalizeGermanText(verb.infinitiv);
  return term ? `verbs:${term}` : "";
}

export function getVocabularyIdentityKey(
  item: Partial<Vocabulary>,
  requestedFamily?: Exclude<ContentFamily, "verbs">
): string {
  const family = requestedFamily || (inferContentFamily(item) as Exclude<ContentFamily, "verbs">);
  const term = family === "nouns"
    ? nounTerm(item)
    : normalizeGermanText(family === "phrases" ? item.phrase || item.term : item.term || item.cleanTerm);
  return term ? `${family}:${term}` : "";
}

export function getContentIdentityKey(
  item: ContentIdentityInput,
  family: ContentFamily
): string {
  return family === "verbs"
    ? getVerbIdentityKey(item)
    : getVocabularyIdentityKey(item, family);
}

export function getPotentialDuplicateKey(
  item: ContentIdentityInput,
  family: ContentFamily
): string {
  const exactTerm = family === "nouns"
    ? nounTerm(item)
    : normalizeGermanText(getGermanContentTerm(item, family));
  return exactTerm
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[\p{P}\p{S}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function createNextContentId(
  items: Array<{ id: string | number }>,
  family: ContentFamily
): string | number {
  if (family === "verbs") {
    const maximum = items.reduce((max, item) => {
      const value = typeof item.id === "number" ? item.id : Number(item.id);
      return Number.isSafeInteger(value) ? Math.max(max, value) : max;
    }, 0);
    return maximum + 1;
  }

  const patterns = new Map<string, { count: number; width: number; maximum: number }>();
  items.forEach((item) => {
    const match = String(item.id || "").match(/^(.*?)(\d+)$/);
    if (!match) return;
    const [, prefix, digits] = match;
    const current = patterns.get(prefix) || { count: 0, width: 0, maximum: 0 };
    current.count += 1;
    current.width = Math.max(current.width, digits.length);
    current.maximum = Math.max(current.maximum, Number(digits));
    patterns.set(prefix, current);
  });

  const preferredPrefix = FAMILY_PREFIXES[family];
  const selected = patterns.get(preferredPrefix) || [...patterns.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0], "de"))[0]?.[1];
  const prefix = patterns.has(preferredPrefix)
    ? preferredPrefix
    : [...patterns.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0], "de"))[0]?.[0] || preferredPrefix;
  const width = Math.max(4, selected?.width || 0);
  const nextNumber = (selected?.maximum || 0) + 1;
  return `${prefix}${String(nextNumber).padStart(width, "0")}`;
}

export function sameContentId(left: unknown, right: unknown): boolean {
  return String(left ?? "").trim() === String(right ?? "").trim();
}
