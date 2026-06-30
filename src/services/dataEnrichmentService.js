const SEPARABLE_PREFIXES = [
  "ab",
  "an",
  "auf",
  "aus",
  "bei",
  "ein",
  "fest",
  "fort",
  "her",
  "hin",
  "los",
  "mit",
  "nach",
  "statt",
  "teil",
  "vor",
  "weg",
  "weiter",
  "zu",
  "zurueck",
  "zurück",
  "zusammen",
];

export function detectArticle(term = "") {
  const match = String(term).trim().match(/^(der|die|das)\s+/i);
  return match ? match[1].toLowerCase() : "";
}

export function detectGender(article = "") {
  const normalized = String(article).trim().toLowerCase();
  if (normalized === "der") return "maskulin";
  if (normalized === "die") return "feminin";
  if (normalized === "das") return "neutral";
  return "";
}

export function detectPlural(term = "") {
  const text = String(term).trim();
  const commaIndex = text.indexOf(",");
  if (commaIndex === -1) return "";
  return text.slice(commaIndex + 1).trim();
}

export function detectCleanTerm(term = "") {
  const text = String(term).trim();
  const withoutPlural = text.split(",")[0].trim();
  return withoutPlural.replace(/^(der|die|das)\s+/i, "").trim();
}

export function detectVerbPrefix(infinitiv = "") {
  const text = String(infinitiv).trim().toLowerCase();
  const sortedPrefixes = [...SEPARABLE_PREFIXES].sort((a, b) => b.length - a.length);
  return sortedPrefixes.find((prefix) => text.startsWith(prefix) && text.length > prefix.length + 2) || "";
}

export function detectSeparable(prefix = "") {
  return SEPARABLE_PREFIXES.includes(String(prefix).trim().toLowerCase());
}

export function detectAuxiliary(perfekt = "") {
  const text = String(perfekt).trim().toLowerCase();
  const hasHaben = /\b(hat|haben|habe|hast|habt)\b/.test(text);
  const hasSein = /\b(ist|sein|bin|bist|sind|seid)\b/.test(text);
  if (hasHaben && hasSein) return "haben/sein";
  if (hasHaben) return "haben";
  if (hasSein) return "sein";
  return "";
}

export function enrichVocabularyFromTerm(term = "") {
  const article = detectArticle(term);
  return {
    article,
    gender: detectGender(article),
    cleanTerm: detectCleanTerm(term),
    plural: detectPlural(term),
  };
}

export function enrichVerbFromForms(infinitiv = "", perfekt = "") {
  const prefix = detectVerbPrefix(infinitiv);
  return {
    auxiliary: detectAuxiliary(perfekt),
    prefix,
    separable: detectSeparable(prefix),
  };
}
