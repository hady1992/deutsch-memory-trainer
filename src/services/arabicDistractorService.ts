type Primitive = string | number | boolean | null | undefined;

export interface ArabicDistractorOptions<T> {
  count?: number;
  sourceType?: string;
  targetKind?: string;
  getAnswer?: (item: T) => string;
  getId?: (item: T) => string | number | undefined;
}

interface ItemProfile {
  answer: string;
  normalizedAnswer: string;
  kind: string;
  sourceType: string;
  type: string;
  level: string;
  categories: string[];
  tags: string[];
  semanticGroups: string[];
  searchableText: string;
}

const profileCache = new WeakMap<object, Map<string, ItemProfile>>();

const SEMANTIC_GROUPS: Array<{ name: string; patterns: RegExp[] }> = [
  {
    name: "participation",
    patterns: [/شارك|يشارك|مشارك|حضر|يحضر|حضور|انضم|ينضم|تعاون|يتعاون|اجتماع|فعاليه|فعالية|دوره|دورة/],
  },
  {
    name: "work_job",
    patterns: [/عمل|يعمل|وظيف|مهن|شركة|مكتب|زميل|مدير|مشروع|موظف|تدريب|مهني|arbeit|beruf|job|firma|büro|buero/i],
  },
  {
    name: "apartment_contract",
    patterns: [/شقه|شقة|سكن|منزل|بيت|غرفه|غرفة|ايجار|إيجار|عقد|مالك|مستاجر|مستأجر|فاتوره|فاتورة|miet|wohnung|vertrag/i],
  },
  {
    name: "school_office",
    patterns: [/مدرس|جامع|درس|محاضره|محاضرة|امتحان|اختبار|صف|تعليم|مكتب|ملف|schule|kurs|unterricht|prüfung|pruefung/i],
  },
  {
    name: "movement_travel",
    patterns: [/ذهب|يذهب|سافر|يسافر|سفر|رحله|رحلة|وصل|يصل|غادر|يغادر|ركب|يركب|قاد|يقود|مشى|يمشي|انتقل|ينتقل|zug|reise|fahren|gehen/i],
  },
  {
    name: "communication",
    patterns: [/قال|يقول|تحدث|يتحدث|سأل|يسال|يسأل|اجاب|أجاب|يجيب|شرح|يشرح|اخبر|أخبر|يخبر|ناقش|يناقش|اتصل|يتصل|ارسل|أرسل|يرسل|kommun|sprech|sagen|fragen/i],
  },
  {
    name: "emotion_opinion",
    patterns: [/شعر|يشعر|فرح|يفرح|حزن|يحزن|خاف|يخاف|قلق|احب|أحب|يحب|كره|يكره|رأي|راي|اعتقد|يعتقد|ظن|يظن|موافق|meinung|gefühl|gefuehl/i],
  },
  {
    name: "bureaucracy_document",
    patterns: [/طلب|رسمي|وثيقه|وثيقة|مستند|ملف|استماره|استمارة|شهاده|شهادة|موعد|تاشيره|تأشيرة|قانون|اذن|إذن|فاتوره|فاتورة|عقد|antrag|termin|formular|dokument|bescheinigung/i],
  },
  {
    name: "finance",
    patterns: [/مال|نقود|دفع|يدفع|حساب|مصرف|بنك|راتب|سعر|تكلفه|تكلفة|فاتوره|فاتورة|تأمين|تامين|geld|konto|preis|rechnung/i],
  },
  {
    name: "health",
    patterns: [/طبيب|مريض|مرض|صحه|صحة|علاج|دواء|الم|ألم|مستشفى|مستشفي|عياده|عيادة|arzt|krank|gesund|medizin/i],
  },
  {
    name: "adjective_quality",
    patterns: [/مرن|قابل|مناسب|عملي|مهم|صعب|سهل|سريع|بطيء|واضح|مفيد|ضروري|مريح|flexibel|praktisch|wichtig|geeignet/i],
  },
  {
    name: "thinking_learning",
    patterns: [/فكر|يفكر|عرف|يعرف|فهم|يفهم|تعلم|يتعلم|تذكر|يتذكر|نسي|ينسى|قرر|يقرر|اختار|يختار|denken|wissen|lernen|verstehen/i],
  },
];

const SEMANTIC_FALLBACK_OPTIONS: Record<string, string[]> = {
  participation: ["يحضر", "ينضم", "يتعاون", "يشترك"],
  work_job: ["ينجز", "يدير", "ينظم", "يتعاون"],
  apartment_contract: ["اتفاقية", "وثيقة السكن", "عقد", "فاتورة السكن"],
  school_office: ["درس", "موعد دراسي", "محاضرة", "تدريب"],
  movement_travel: ["يسافر", "ينتقل", "يصل", "يغادر"],
  communication: ["يخبر", "يناقش", "يشرح", "يتصل"],
  emotion_opinion: ["يعتقد", "يشعر", "يفضل", "يوافق"],
  bureaucracy_document: ["طلب رسمي", "وثيقة", "استمارة", "موعد"],
  finance: ["فاتورة", "دفعة", "حساب", "تكلفة"],
  health: ["علاج", "موعد طبي", "دواء", "فحص"],
  adjective_quality: ["قابل للتغيير", "عملي", "مناسب", "مفيد"],
  thinking_learning: ["يفهم", "يتعلم", "يتذكر", "يقرر"],
};

const ARABIC_STOP_WORDS = new Set([
  "في",
  "من",
  "على",
  "الى",
  "إلى",
  "عن",
  "مع",
  "او",
  "أو",
  "و",
  "ال",
  "هذا",
  "هذه",
  "ذلك",
  "تلك",
  "شيء",
  "شيئا",
]);

function firstString(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" ? (value as Record<string, any>) : {};
}

function collectPrimitiveStrings(value: unknown, output: string[] = []): string[] {
  if (value === null || value === undefined) return output;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const text = String(value).trim();
    if (text) output.push(text);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectPrimitiveStrings(item, output));
    return output;
  }
  if (typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((item) => collectPrimitiveStrings(item, output));
  }
  return output;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter((value) => {
      const key = value.toLocaleLowerCase("ar");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function normalizeArabicText(value: string): string {
  return String(value || "")
    .replace(/\u0640/g, "")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{Script=Arabic}\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("ar");
}

function normalizedTokens(value: string): string[] {
  return normalizeArabicText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !ARABIC_STOP_WORDS.has(token));
}

function answerParts(value: string): string[] {
  return String(value || "")
    .split(/[\/،,؛;()]+/g)
    .map(normalizeArabicText)
    .filter(Boolean);
}

function displayAnswerParts(value: string): string[] {
  return String(value || "")
    .split(/[\/،,؛;()]+/g)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3);
}

export function isSameOrNearArabicMeaning(correctAnswer: string, candidateAnswer: string): boolean {
  const correct = normalizeArabicText(correctAnswer);
  const candidate = normalizeArabicText(candidateAnswer);
  if (!correct || !candidate) return true;
  if (correct === candidate) return true;

  const correctParts = answerParts(correctAnswer);
  const candidateParts = answerParts(candidateAnswer);
  if (correctParts.some((part) => part === candidate) || candidateParts.some((part) => part === correct)) return true;

  const short = correct.length < candidate.length ? correct : candidate;
  const long = correct.length < candidate.length ? candidate : correct;
  if (short.length >= 4 && long.includes(short)) return true;

  const correctTokens = normalizedTokens(correctAnswer);
  const candidateTokens = normalizedTokens(candidateAnswer);
  if (!correctTokens.length || !candidateTokens.length) return false;
  const overlap = candidateTokens.filter((token) => correctTokens.includes(token)).length;
  return overlap > 0 && overlap / Math.min(correctTokens.length, candidateTokens.length) >= 0.8;
}

function inferKind(raw: Record<string, any>, explicitKind?: string): string {
  const candidates = [
    explicitKind,
    raw.dataMeta?.family,
    raw.sourceType,
    raw.wordType,
    raw.originalType,
    raw.type,
  ]
    .map((value) => String(value || "").toLocaleLowerCase("de"))
    .filter(Boolean);
  const joined = candidates.join(" ");
  if (/verb|الفعل|فعل|unregel|regel/.test(joined)) return "verb";
  if (/noun|nomen|اسم/.test(joined)) return "noun";
  if (/adjective|adjektiv|صفة|صفه/.test(joined)) return "adjective";
  if (/phrase|عبارة|عباره|ausdruck/.test(joined)) return "phrase";
  if (/other|general|wort|كلمة|كلمه/.test(joined)) return "other";
  return candidates[0] || "";
}

export function getArabicSemanticGroups(value: unknown): string[] {
  const text = collectPrimitiveStrings(value).join(" ");
  return SEMANTIC_GROUPS
    .filter((group) => group.patterns.some((pattern) => pattern.test(text)))
    .map((group) => group.name);
}

function profileFor<T>(
  item: T,
  answer: string,
  options: ArabicDistractorOptions<T>,
  isTarget: boolean
): ItemProfile {
  const cacheOwner = item && typeof item === "object" ? item as object : null;
  const cacheKey = `${isTarget ? "target" : "candidate"}|${answer}|${options.sourceType || ""}|${options.targetKind || ""}`;
  const cached = cacheOwner ? profileCache.get(cacheOwner)?.get(cacheKey) : undefined;
  if (cached) return cached;

  const raw = asRecord(item);
  const kind = inferKind(raw, isTarget ? options.targetKind : undefined);
  const sourceType = String(
    (isTarget ? options.sourceType : undefined) || raw.sourceType || raw.dataMeta?.family || kind || ""
  ).trim();
  const type = String(raw.type || raw.originalType || raw.wordType || raw.dataMeta?.family || "").trim();
  const level = String(raw.level || "").trim();
  const categories = uniqueStrings([
    ...collectPrimitiveStrings(raw.categoryIds),
    ...collectPrimitiveStrings(raw.category),
    ...collectPrimitiveStrings(raw.topic),
    ...collectPrimitiveStrings(raw.domain),
    ...collectPrimitiveStrings(raw.section),
    ...collectPrimitiveStrings(raw.chapterTitle),
  ]);
  const tags = uniqueStrings([
    ...collectPrimitiveStrings(raw.semanticTags),
    ...collectPrimitiveStrings(raw.grammarTags),
    ...collectPrimitiveStrings(raw.tags),
    ...collectPrimitiveStrings(raw.dataMeta?.family),
    ...collectPrimitiveStrings(raw.dataMeta?.source),
  ]);
  const searchableText = [
    answer,
    raw.arabic,
    raw.notes_ar,
    raw.usage_ar,
    raw.term,
    raw.cleanTerm,
    raw.phrase,
    raw.infinitiv,
    raw.example_ar,
    raw.example_de,
    raw.level,
    raw.type,
    raw.originalType,
    raw.dataMeta?.family,
    ...collectPrimitiveStrings(raw.examples),
  ]
    .map(firstString)
    .filter(Boolean)
    .join(" ");

  const profile = {
    answer,
    normalizedAnswer: normalizeArabicText(answer),
    kind,
    sourceType,
    type,
    level,
    categories,
    tags,
    semanticGroups: uniqueStrings([
      ...getArabicSemanticGroups(answer),
      ...getArabicSemanticGroups(searchableText),
      ...getArabicSemanticGroups([...categories, ...tags]),
    ]),
    searchableText,
  };
  if (cacheOwner) {
    const itemCache = profileCache.get(cacheOwner) || new Map<string, ItemProfile>();
    itemCache.set(cacheKey, profile);
    profileCache.set(cacheOwner, itemCache);
  }
  return profile;
}

function intersectionCount(left: string[], right: string[]): number {
  const normalizedRight = new Set(right.map((item) => item.toLocaleLowerCase("ar")));
  return left.filter((item) => normalizedRight.has(item.toLocaleLowerCase("ar"))).length;
}

function tokenOverlapScore(left: string, right: string): number {
  const leftTokens = normalizedTokens(left);
  const rightTokens = normalizedTokens(right);
  if (!leftTokens.length || !rightTokens.length) return 0;
  return leftTokens.filter((token) => rightTokens.includes(token)).length;
}

export function scoreArabicDistractor<T>(
  targetItem: T,
  candidateItem: T,
  correctAnswer: string,
  candidateAnswer: string,
  options: ArabicDistractorOptions<T> = {}
): number {
  const target = profileFor(targetItem, correctAnswer, options, true);
  const candidate = profileFor(candidateItem, candidateAnswer, options, false);
  return scoreProfiles(target, candidate, correctAnswer, candidateAnswer);
}

function scoreProfiles(
  target: ItemProfile,
  candidate: ItemProfile,
  correctAnswer: string,
  candidateAnswer: string
): number {
  if (!candidate.normalizedAnswer || isSameOrNearArabicMeaning(correctAnswer, candidateAnswer)) return Number.NEGATIVE_INFINITY;

  let score = 0;
  if (target.sourceType && candidate.sourceType && target.sourceType === candidate.sourceType) score += 28;
  if (target.kind && candidate.kind && target.kind === candidate.kind) score += 32;
  if (target.kind && candidate.kind && target.kind !== candidate.kind) score -= 18;
  if (target.type && candidate.type && target.type === candidate.type) score += 10;
  if (target.level && candidate.level && target.level === candidate.level) score += 8;

  const categoryOverlap = intersectionCount(target.categories, candidate.categories);
  const tagOverlap = intersectionCount(target.tags, candidate.tags);
  const semanticOverlap = intersectionCount(target.semanticGroups, candidate.semanticGroups);
  score += Math.min(36, categoryOverlap * 18);
  score += Math.min(24, tagOverlap * 8);
  score += semanticOverlap > 0 ? 40 + Math.min(12, (semanticOverlap - 1) * 4) : 0;
  score += Math.min(12, tokenOverlapScore(target.searchableText, candidate.searchableText) * 3);
  score += Math.max(0, 6 - Math.abs(candidateAnswer.length - correctAnswer.length) / 4);

  return score;
}

function byScoreThenStable<T extends { score: number; answer: string }>(left: T, right: T): number {
  return right.score - left.score || left.answer.localeCompare(right.answer, "ar");
}

export function selectArabicDistractors<T>(
  targetItem: T,
  candidates: T[],
  correctAnswer: string,
  options: ArabicDistractorOptions<T> = {}
): string[] {
  const count = options.count ?? 3;
  const targetId = options.getId?.(targetItem);
  const targetProfile = profileFor(targetItem, correctAnswer, options, true);
  const rows = candidates
    .flatMap((candidate) => {
      const answer = firstString(options.getAnswer?.(candidate) ?? asRecord(candidate).arabic);
      const candidateId = options.getId?.(candidate);
      const answerVariants = uniqueStrings([answer, ...displayAnswerParts(answer)]);
      return answerVariants.map((answerVariant) => {
        const profile = profileFor(candidate, answerVariant, options, false);
        return {
        candidate,
        answer: answerVariant,
        profile,
        score: scoreProfiles(targetProfile, profile, correctAnswer, answerVariant),
        sameId: targetId !== undefined && candidateId !== undefined && String(targetId) === String(candidateId),
        };
      });
    })
    .filter((row) => !row.sameId && Number.isFinite(row.score) && row.answer.trim());

  const selected: string[] = [];
  const addFrom = (bucket: typeof rows) => {
    for (const row of bucket.sort(byScoreThenStable)) {
      if (selected.length >= count) break;
      if (isSameOrNearArabicMeaning(correctAnswer, row.answer)) continue;
      if (selected.some((value) => isSameOrNearArabicMeaning(value, row.answer))) continue;
      selected.push(row.answer.trim());
    }
  };

  targetProfile.semanticGroups.forEach((group) => {
    for (const value of SEMANTIC_FALLBACK_OPTIONS[group] || []) {
      if (selected.length >= count) break;
      if (isSameOrNearArabicMeaning(correctAnswer, value)) continue;
      if (selected.some((item) => isSameOrNearArabicMeaning(item, value))) continue;
      selected.push(value);
    }
  });
  addFrom(rows.filter((row) => intersectionCount(targetProfile.semanticGroups, row.profile.semanticGroups) > 0));
  addFrom(rows.filter((row) => targetProfile.kind && row.profile.kind === targetProfile.kind));
  addFrom(rows.filter((row) => targetProfile.level && row.profile.level === targetProfile.level));
  addFrom(rows);

  return selected.slice(0, count);
}
