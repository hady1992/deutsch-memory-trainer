export type B2ExplanationLanguage = "ar" | "de";

const EXPLANATION_LANGUAGE_KEY = "dmt_b2_course_explanation_language_v1";

export function getB2ExplanationLanguage(isRtl: boolean): B2ExplanationLanguage {
  if (typeof window === "undefined") return isRtl ? "ar" : "de";
  const stored = window.localStorage.getItem(EXPLANATION_LANGUAGE_KEY);
  if (stored === "ar" || stored === "de") return stored;
  return isRtl ? "ar" : "de";
}

export function setB2ExplanationLanguage(language: B2ExplanationLanguage): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(EXPLANATION_LANGUAGE_KEY, language);
  }
}
