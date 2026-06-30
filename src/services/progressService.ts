import { ProgressItem, LastSessionResult } from "../types";

const PROGRESS_KEY = "dmt_progress";
const LAST_SESSION_KEY = "dmt_last_session";

export class ProgressService {
  private static loadProgress(): Record<string, ProgressItem> {
    const raw = localStorage.getItem(PROGRESS_KEY);
    return raw ? JSON.parse(raw) : {};
  }

  private static saveProgress(progress: Record<string, ProgressItem>): void {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  }

  public static getProgressItem(itemKey: string): ProgressItem {
    const progress = this.loadProgress();
    if (progress[itemKey]) {
      return progress[itemKey];
    }
    return {
      itemKey,
      correctCount: 0,
      wrongCount: 0,
      lastReviewedAt: "",
      nextReviewAt: "",
      difficulty: "new",
      mastered: false,
    };
  }

  // Record a review event (knew it or forgot it)
  public static recordReview(itemKey: string, knew: boolean): ProgressItem {
    const progress = this.loadProgress();
    const current = this.getProgressItem(itemKey);

    const now = new Date();
    current.lastReviewedAt = now.toISOString();

    if (knew) {
      current.correctCount += 1;
    } else {
      current.wrongCount += 1;
    }

    // Determine difficulty and next review time
    // If wrong, next review is very soon (0 hours, basically due immediately)
    if (!knew) {
      current.difficulty = "difficult";
      current.nextReviewAt = now.toISOString(); // due immediately
      current.mastered = false;
    } else {
      // Correct answer! Let's calculate next interval based on correct count
      let days = 1;
      if (current.correctCount === 1) {
        days = 1;
        current.difficulty = "easy";
      } else if (current.correctCount === 2) {
        days = 3;
        current.difficulty = "easy";
      } else if (current.correctCount >= 3 && current.correctCount < 5) {
        days = 7;
        current.difficulty = "medium";
      } else if (current.correctCount >= 5) {
        days = 14;
        // Mastered if correct answers >= 5 and mistakes <= 1
        if (current.wrongCount <= 1) {
          current.mastered = true;
          days = 30;
        }
      }
      
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + days);
      current.nextReviewAt = nextDate.toISOString();

      // If it was difficult and now is correct, check if we should lower difficulty
      if (current.difficulty === "difficult" && current.correctCount >= 3) {
        current.difficulty = "medium";
      }
    }

    progress[itemKey] = current;
    this.saveProgress(progress);
    return current;
  }

  // Get statistics for the dashboard
  public static getStats(verbKeys: string[], vocabKeys: string[]): {
    totalVerbs: number;
    totalVocab: number;
    learnedVerbs: number;
    learnedVocab: number;
    difficultVerbs: number;
    difficultVocab: number;
    dueVerbsCount: number;
    dueVocabCount: number;
    masteredVerbs: number;
    masteredVocab: number;
  } {
    const progress = this.loadProgress();
    const now = new Date();

    let learnedVerbs = 0;
    let learnedVocab = 0;
    let difficultVerbs = 0;
    let difficultVocab = 0;
    let dueVerbsCount = 0;
    let dueVocabCount = 0;
    let masteredVerbs = 0;
    let masteredVocab = 0;

    verbKeys.forEach((key) => {
      const item = progress[key];
      if (item) {
        if (item.correctCount >= 3) learnedVerbs++;
        if (item.difficulty === "difficult") difficultVerbs++;
        if (item.mastered) masteredVerbs++;
        if (item.nextReviewAt && new Date(item.nextReviewAt) <= now) {
          dueVerbsCount++;
        }
      } else {
        // new item is considered due if not reviewed yet (optional, let's keep new items separate or due)
        dueVerbsCount++;
      }
    });

    vocabKeys.forEach((key) => {
      const item = progress[key];
      if (item) {
        if (item.correctCount >= 3) learnedVocab++;
        if (item.difficulty === "difficult") difficultVocab++;
        if (item.mastered) masteredVocab++;
        if (item.nextReviewAt && new Date(item.nextReviewAt) <= now) {
          dueVocabCount++;
        }
      } else {
        dueVocabCount++;
      }
    });

    return {
      totalVerbs: verbKeys.length,
      totalVocab: vocabKeys.length,
      learnedVerbs,
      learnedVocab,
      difficultVerbs,
      difficultVocab,
      dueVerbsCount,
      dueVocabCount,
      masteredVerbs,
      masteredVocab,
    };
  }

  // Get difficult and due lists
  public static getDifficultKeys(): string[] {
    const progress = this.loadProgress();
    return Object.keys(progress).filter((key) => progress[key].difficulty === "difficult");
  }

  public static getDueKeys(): string[] {
    const progress = this.loadProgress();
    const now = new Date();
    return Object.keys(progress).filter((key) => {
      const item = progress[key];
      return item.nextReviewAt && new Date(item.nextReviewAt) <= now;
    });
  }

  // Last session result
  public static getLastSessionResult(): LastSessionResult | null {
    const raw = localStorage.getItem(LAST_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  public static saveLastSessionResult(result: LastSessionResult): void {
    localStorage.setItem(LAST_SESSION_KEY, JSON.stringify(result));
  }

  public static getProgress(): Record<string, ProgressItem> {
    return this.loadProgress();
  }

  // Reset all progress
  public static resetProgress(): void {
    localStorage.removeItem(PROGRESS_KEY);
    localStorage.removeItem(LAST_SESSION_KEY);
  }

  // Export full backup of progress
  public static getBackupData(): any {
    return {
      progress: this.loadProgress(),
      lastSession: this.getLastSessionResult(),
    };
  }

  // Import full backup of progress
  public static importBackupData(data: any): boolean {
    try {
      if (data && typeof data === "object") {
        if (data.progress) {
          this.saveProgress(data.progress);
        }
        if (data.lastSession) {
          this.saveLastSessionResult(data.lastSession);
        }
        return true;
      }
      return false;
    } catch (e) {
      console.error("Error importing backup progress", e);
      return false;
    }
  }
}
