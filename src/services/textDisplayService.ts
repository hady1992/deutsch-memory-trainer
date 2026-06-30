import { TenseKey, Verb } from "../types";

export function normalizeGermanText(value?: string): string {
  const text = (value || "").trim().replace(/\s+/g, " ");
  if (!text) return "";

  const leadingPunctuation = text.match(/^([.!?,;:]+)\s*(.+)$/);
  if (leadingPunctuation) {
    return `${leadingPunctuation[2]}${leadingPunctuation[1]}`;
  }

  return text;
}

export function normalizeAnswer(value?: string): string {
  return normalizeGermanText(value)
    .toLocaleLowerCase("de-DE")
    .replace(/\s+/g, " ")
    .trim();
}

export function answersMatch(input?: string, expected?: string): boolean {
  return normalizeAnswer(input) === normalizeAnswer(expected);
}

export function getTenseExample(verb: Verb, tense?: string) {
  const tenseKey = tense as TenseKey | undefined;
  const example = tenseKey ? verb.tenseExamples?.[tenseKey] : undefined;
  const de = normalizeGermanText(example?.de || verb.example_de);
  const ar = (example?.ar || verb.example_ar || "").trim();

  return { de, ar };
}

export function hasTenseExample(verb: Verb, tense?: string): boolean {
  const example = getTenseExample(verb, tense);
  return Boolean(example.de || example.ar);
}
