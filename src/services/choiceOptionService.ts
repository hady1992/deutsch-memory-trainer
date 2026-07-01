export function shuffleOptions<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}

export function normalizeChoiceOption(value?: string): string {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/ـ/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/[،؛؟,.!?;:()[\]{}"'`´]/g, "")
    .toLocaleLowerCase("de-DE")
    .trim();
}

export function hasCorrectOptionExactlyOnce(options: string[] | undefined, correctAnswer?: string): boolean {
  const correctKey = normalizeChoiceOption(correctAnswer);
  if (!correctKey || !options?.length) return false;
  return options.filter((option) => normalizeChoiceOption(option) === correctKey).length === 1;
}

export function ensureCorrectOption(
  options: string[] | undefined,
  correctAnswer?: string,
  desiredCount = 4
): string[] | null {
  const correct = String(correctAnswer || "").trim();
  if (!correct) return null;

  const correctKey = normalizeChoiceOption(correct);
  if (!correctKey) return null;

  const seen = new Set<string>([correctKey]);
  const distractors: string[] = [];

  (options || []).forEach((option) => {
    const clean = String(option || "").trim();
    const key = normalizeChoiceOption(clean);
    if (!clean || !key || key === correctKey || seen.has(key)) return;
    seen.add(key);
    distractors.push(clean);
  });

  const targetCount = Math.max(2, desiredCount);
  const repaired = [correct, ...distractors].slice(0, targetCount);
  if (repaired.length < 2) return null;
  if (!hasCorrectOptionExactlyOnce(repaired, correct)) return null;

  return shuffleOptions(repaired);
}
