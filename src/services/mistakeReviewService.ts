import { TenseKey } from "../types";
import { ProgressService } from "./progressService";

export type MistakeType =
  | "verb"
  | "vocabulary"
  | "tense"
  | "verb_category"
  | "article"
  | "plural"
  | "noun"
  | "adjective"
  | "phrase"
  | "other";

export type MistakeMode =
  | "verb-multiple-choice"
  | "verb-writing"
  | "vocab-multiple-choice"
  | "vocab-writing"
  | "tense-multiple-choice"
  | "tense-writing"
  | "quick-practice"
  | "article"
  | "plural"
  | "noun"
  | "adjective"
  | "phrase"
  | "other";

export type MistakeSourceType =
  | "verb"
  | "tense"
  | "vocabulary"
  | "vocabulary_v3"
  | "verb_category"
  | "article"
  | "plural"
  | "noun"
  | "adjective"
  | "phrase"
  | "other";

export interface MistakeRecord {
  id: string;
  itemKey: string;
  type: MistakeType;
  mode: MistakeMode;
  itemId: number | string;
  infinitiv?: string;
  term?: string;
  arabic?: string;
  targetTense?: TenseKey;
  pronoun?: "ich" | "du" | "er_sie_es" | "wir" | "ihr" | "sie_Sie";
  sourceType?: MistakeSourceType;
  categoryId?: string;
  choices?: string[];
  answerLang?: "de" | "ar";
  example_de?: string;
  example_ar?: string;
  note_ar?: string;
  questionText: string;
  correctAnswer: string;
  userAnswer: string;
  wrongCount: number;
  correctAfterMistakeCount: number;
  lastWrongAt: string;
  lastReviewedAt?: string;
  resolved: boolean;
}

type MistakeInput = Omit<
  MistakeRecord,
  "wrongCount" | "correctAfterMistakeCount" | "lastWrongAt" | "lastReviewedAt" | "resolved"
>;

const MISTAKES_KEY = "deutsch-memory-trainer-mistakes";

export class MistakeReviewService {
  private static normalizeRecord(raw: any, index: number): MistakeRecord {
    const fallbackId = `legacy-mistake-${index}`;
    const id = String(raw?.id || fallbackId);
    const type = String(raw?.type || raw?.sourceType || "vocabulary") as MistakeType;
    const mode = String(raw?.mode || raw?.sourceType || "quick-practice") as MistakeMode;
    const itemId = raw?.itemId ?? raw?.sourceId ?? raw?.id ?? id;
    const correctAnswer = String(raw?.correctAnswer ?? raw?.answer ?? raw?.expectedAnswer ?? "-");

    if (!raw?.id || !raw?.questionText || raw?.correctAnswer === undefined) {
      console.error("Incomplete mistake record loaded; using safe fallbacks.", raw);
    }

    return {
      ...raw,
      id,
      itemKey: String(raw?.itemKey || `${type}-${itemId}`),
      type,
      mode,
      itemId,
      questionText: String(raw?.questionText || raw?.question || raw?.prompt || "-"),
      correctAnswer,
      userAnswer: String(raw?.userAnswer ?? raw?.givenAnswer ?? ""),
      wrongCount: Number(raw?.wrongCount || 1),
      correctAfterMistakeCount: Number(raw?.correctAfterMistakeCount || 0),
      lastWrongAt: String(raw?.lastWrongAt || raw?.lastReviewedAt || new Date(0).toISOString()),
      resolved: Boolean(raw?.resolved),
    };
  }

  private static load(): MistakeRecord[] {
    try {
      const raw = localStorage.getItem(MISTAKES_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        console.error("Invalid mistake store format; expected an array.", parsed);
        return [];
      }
      return parsed.map((item, index) => this.normalizeRecord(item, index));
    } catch (e) {
      console.error("Error loading mistakes", e);
      return [];
    }
  }

  private static save(mistakes: MistakeRecord[]): void {
    localStorage.setItem(MISTAKES_KEY, JSON.stringify(mistakes));
  }

  public static getMistakes(): MistakeRecord[] {
    return this.load().sort((a, b) => {
      const aTime = new Date(a.lastWrongAt || a.lastReviewedAt || 0).getTime();
      const bTime = new Date(b.lastWrongAt || b.lastReviewedAt || 0).getTime();
      return bTime - aTime;
    });
  }

  public static getUnresolvedMistakes(): MistakeRecord[] {
    return this.getMistakes().filter((mistake) => !mistake.resolved);
  }

  public static recordMistake(input: MistakeInput, updateProgress = false): MistakeRecord {
    const mistakes = this.load();
    const now = new Date().toISOString();
    const index = mistakes.findIndex((mistake) => mistake.id === input.id);

    if (updateProgress) {
      ProgressService.recordReview(input.itemKey, false);
    }

    if (index >= 0) {
      const updated: MistakeRecord = {
        ...mistakes[index],
        ...input,
        userAnswer: input.userAnswer,
        correctAnswer: input.correctAnswer,
        questionText: input.questionText,
        wrongCount: mistakes[index].wrongCount + 1,
        correctAfterMistakeCount: 0,
        lastWrongAt: now,
        resolved: false,
      };
      mistakes[index] = updated;
      this.save(mistakes);
      return updated;
    }

    const created: MistakeRecord = {
      ...input,
      wrongCount: 1,
      correctAfterMistakeCount: 0,
      lastWrongAt: now,
      resolved: false,
    };
    mistakes.push(created);
    this.save(mistakes);
    return created;
  }

  public static recordReviewResult(id: string, correct: boolean, userAnswer: string, itemKey?: string): MistakeRecord | null {
    const mistakes = this.load();
    const index = mistakes.findIndex((mistake) => mistake.id === id);
    if (index < 0) return null;

    const now = new Date().toISOString();
    const current = mistakes[index];

    if (itemKey) {
      ProgressService.recordReview(itemKey, correct);
    }

    if (correct) {
      const correctAfterMistakeCount = current.correctAfterMistakeCount + 1;
      mistakes[index] = {
        ...current,
        userAnswer,
        correctAfterMistakeCount,
        lastReviewedAt: now,
        resolved: correctAfterMistakeCount >= 2,
      };
    } else {
      mistakes[index] = {
        ...current,
        userAnswer,
        wrongCount: current.wrongCount + 1,
        correctAfterMistakeCount: 0,
        lastWrongAt: now,
        resolved: false,
      };
    }

    this.save(mistakes);
    return mistakes[index];
  }

  public static markResolved(id: string): void {
    const mistakes = this.load().map((mistake) =>
      mistake.id === id
        ? { ...mistake, resolved: true, lastReviewedAt: new Date().toISOString() }
        : mistake
    );
    this.save(mistakes);
  }

  public static deleteMistake(id: string): void {
    this.save(this.load().filter((mistake) => mistake.id !== id));
  }

  public static exportMistakes(): MistakeRecord[] {
    return this.load();
  }

  public static importMistakes(mistakes: MistakeRecord[]): void {
    if (Array.isArray(mistakes)) {
      this.save(mistakes);
    }
  }

  public static clear(): void {
    localStorage.removeItem(MISTAKES_KEY);
  }
}
