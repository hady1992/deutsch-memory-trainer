import { Verb, VerbCategory, Vocabulary } from "../types";

const CUSTOM_VERBS_KEY = "dmt_custom_verbs";
const CUSTOM_VOCAB_KEY = "dmt_custom_vocab";
const OVERRIDE_VERBS_KEY = "dmt_override_verbs";
const OVERRIDE_VOCAB_KEY = "dmt_override_vocab";

export class DataService {
  private static cachedVerbs: Verb[] = [];
  private static cachedVocab: Vocabulary[] = [];
  private static cachedVerbCategories: VerbCategory[] = [];

  private static async loadJsonArray<T>(path: string): Promise<T[]> {
    const response = await fetch(path);
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  }

  private static numericId(value: number | string | undefined): number {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  }

  private static normalizeVocabularyItem(item: Vocabulary): Vocabulary {
    const firstExample = item.examples?.[0];
    const term = item.term || item.phrase || item.singular || item.rawTerm || "";
    const type = item.type || item.originalType || item.dataMeta?.family || "Wort";
    return {
      ...item,
      term,
      type,
      level: item.level || "B1/B2",
      example_de: item.example_de || firstExample?.de,
      example_ar: item.example_ar || firstExample?.ar,
      plural: item.plural || item.pluralRaw,
      vocabMeta: item.vocabMeta || {
        generated: Boolean(item.dataMeta?.generated || item.dataMeta?.generatedFrom),
        needsReview: Boolean(item.needsReview ?? item.dataMeta?.needsReview ?? item.dataMeta?.needsHumanReview),
        source: String(item.dataMeta?.source || item.dataMeta?.generatedFrom || "split-vocabulary-v3"),
      },
    };
  }

  // Load merged list of verbs
  public static async getVerbs(): Promise<Verb[]> {
    try {
      // 1. Fetch defaults
      const response = await fetch("/data/verbs.json");
      let defaultVerbs: Verb[] = [];
      if (response.ok) {
        defaultVerbs = await response.json();
      }

      // 2. Load overrides
      const overrideVerbsRaw = localStorage.getItem(OVERRIDE_VERBS_KEY);
      const overrideVerbs: Record<number, Verb> = overrideVerbsRaw ? JSON.parse(overrideVerbsRaw) : {};

      // 3. Load custom items
      const customVerbsRaw = localStorage.getItem(CUSTOM_VERBS_KEY);
      const customVerbs: Verb[] = customVerbsRaw ? JSON.parse(customVerbsRaw) : [];

      // 4. Merge default and overrides
      const mergedDefaults = defaultVerbs.map((verb) => {
        if (overrideVerbs[verb.id]) {
          return { ...verb, ...overrideVerbs[verb.id] };
        }
        return verb;
      });

      // 5. Combine with custom items, avoiding duplicate IDs
      // Ensure custom items have proper IDs if not set
      let maxId = Math.max(0, ...mergedDefaults.map((v) => v.id), ...customVerbs.map((v) => v.id));
      const finalizedCustom = customVerbs.map((verb) => {
        if (!verb.id) {
          maxId++;
          return { ...verb, id: maxId, isCustom: true };
        }
        return { ...verb, isCustom: true };
      });

      // Combine and filter duplicates by ID
      const allVerbsMap = new Map<number, Verb>();
      mergedDefaults.forEach((v) => allVerbsMap.set(v.id, v));
      finalizedCustom.forEach((v) => allVerbsMap.set(v.id, v));

      const result = Array.from(allVerbsMap.values()).filter((v) => !(v as any).isDeleted);
      this.cachedVerbs = result;
      console.log(`[DataService] Loaded ${result.length} verbs (Source: real JSON from /data/verbs.json + custom/overrides)`);
      return result;
    } catch (e) {
      console.error("Error fetching or parsing verbs.json", e);
      // Fallback to overrides and customs only
      const customVerbsRaw = localStorage.getItem(CUSTOM_VERBS_KEY);
      const customVerbs: Verb[] = customVerbsRaw ? JSON.parse(customVerbsRaw) : [];
      this.cachedVerbs = customVerbs;
      console.log(`[DataService] Loaded ${customVerbs.length} verbs (Source: fallback to local custom data)`);
      return customVerbs;
    }
  }

  public static async getVerbCategories(): Promise<VerbCategory[]> {
    try {
      const response = await fetch("/data/verb-categories.json");
      if (!response.ok) {
        this.cachedVerbCategories = [];
        return [];
      }
      const categories: VerbCategory[] = await response.json();
      this.cachedVerbCategories = categories.filter((category) => category.enabled !== false);
      return this.cachedVerbCategories;
    } catch (e) {
      console.error("Error fetching or parsing verb-categories.json", e);
      this.cachedVerbCategories = [];
      return [];
    }
  }

  public static async loadNouns(): Promise<Vocabulary[]> {
    return this.loadJsonArray<Vocabulary>("/data/nouns.json");
  }

  public static async loadAdjectives(): Promise<Vocabulary[]> {
    return this.loadJsonArray<Vocabulary>("/data/adjectives.json");
  }

  public static async loadPhrases(): Promise<Vocabulary[]> {
    return this.loadJsonArray<Vocabulary>("/data/phrases.json");
  }

  public static async loadOtherVocabulary(): Promise<Vocabulary[]> {
    return this.loadJsonArray<Vocabulary>("/data/other-vocabulary.json");
  }

  private static async loadSplitVocabulary(): Promise<Vocabulary[]> {
    const [nouns, adjectives, phrases, other] = await Promise.all([
      this.loadNouns(),
      this.loadAdjectives(),
      this.loadPhrases(),
      this.loadOtherVocabulary(),
    ]);
    return [...nouns, ...adjectives, ...phrases, ...other].map((item) => this.normalizeVocabularyItem(item));
  }

  // Load merged list of vocabulary
  public static async getVocabulary(): Promise<Vocabulary[]> {
    try {
      // 1. Fetch split v3 defaults first; keep vocabulary.json as fallback only.
      let defaultVocab: Vocabulary[] = await this.loadSplitVocabulary();
      let sourceLabel = "split v3 JSON from /data";

      if (defaultVocab.length === 0) {
        const response = await fetch("/data/vocabulary.json");
        if (response.ok) {
          const legacyData = await response.json();
          defaultVocab = Array.isArray(legacyData) ? legacyData : [];
          sourceLabel = "legacy /data/vocabulary.json fallback";
        }
      }

      // 2. Load overrides
      const overrideVocabRaw = localStorage.getItem(OVERRIDE_VOCAB_KEY);
      const overrideVocab: Record<string, Vocabulary> = overrideVocabRaw ? JSON.parse(overrideVocabRaw) : {};

      // 3. Load custom items
      const customVocabRaw = localStorage.getItem(CUSTOM_VOCAB_KEY);
      const customVocab: Vocabulary[] = customVocabRaw ? JSON.parse(customVocabRaw) : [];

      // 4. Merge default and overrides
      const mergedDefaults = defaultVocab.map((item) => {
        const key = String(item.id);
        if (overrideVocab[key]) {
          return { ...item, ...overrideVocab[key] };
        }
        return item;
      });

      // 5. Combine with custom items, avoiding duplicate IDs
      let maxId = Math.max(0, ...mergedDefaults.map((v) => this.numericId(v.id)), ...customVocab.map((v) => this.numericId(v.id)));
      const finalizedCustom = customVocab.map((item) => {
        if (!item.id) {
          maxId++;
          return { ...item, id: maxId, isCustom: true };
        }
        return { ...item, isCustom: true };
      });

      // Combine and filter duplicates by ID
      const allVocabMap = new Map<string, Vocabulary>();
      mergedDefaults.forEach((v) => allVocabMap.set(String(v.id), v));
      finalizedCustom.forEach((v) => allVocabMap.set(String(v.id), v));

      const result = Array.from(allVocabMap.values()).filter((v) => !(v as any).isDeleted);
      this.cachedVocab = result;
      console.log(`[DataService] Loaded ${result.length} vocabulary items (Source: ${sourceLabel} + custom/overrides)`);
      return result;
    } catch (e) {
      console.error("Error fetching or parsing vocabulary data", e);
      const customVocabRaw = localStorage.getItem(CUSTOM_VOCAB_KEY);
      const customVocab: Vocabulary[] = customVocabRaw ? JSON.parse(customVocabRaw) : [];
      this.cachedVocab = customVocab;
      console.log(`[DataService] Loaded ${customVocab.length} vocabulary items (Source: fallback to local custom data)`);
      return customVocab;
    }
  }

  // Save Verb (Custom, New, or Overridden default)
  public static async saveVerb(verb: Verb): Promise<void> {
    if (verb.isCustom) {
      // It's a user-added custom item
      const customVerbsRaw = localStorage.getItem(CUSTOM_VERBS_KEY);
      let customVerbs: Verb[] = customVerbsRaw ? JSON.parse(customVerbsRaw) : [];
      
      if (verb.id) {
        // Edit existing custom
        customVerbs = customVerbs.map((v) => (v.id === verb.id ? verb : v));
      } else {
        // Add new custom
        const verbs = await this.getVerbs();
        const maxId = Math.max(0, ...verbs.map((v) => v.id));
        verb.id = maxId + 1;
        verb.isCustom = true;
        customVerbs.push(verb);
      }
      localStorage.setItem(CUSTOM_VERBS_KEY, JSON.stringify(customVerbs));
    } else {
      // It's a default item being edited (override)
      const overrideVerbsRaw = localStorage.getItem(OVERRIDE_VERBS_KEY);
      const overrideVerbs: Record<number, Verb> = overrideVerbsRaw ? JSON.parse(overrideVerbsRaw) : {};
      overrideVerbs[verb.id] = verb;
      localStorage.setItem(OVERRIDE_VERBS_KEY, JSON.stringify(overrideVerbs));
    }
  }

  // Save Vocabulary (Custom, New, or Overridden default)
  public static async saveVocabulary(item: Vocabulary): Promise<void> {
    if (item.isCustom) {
      const customVocabRaw = localStorage.getItem(CUSTOM_VOCAB_KEY);
      let customVocab: Vocabulary[] = customVocabRaw ? JSON.parse(customVocabRaw) : [];
      
      if (item.id) {
        // Edit existing custom
        customVocab = customVocab.map((v) => (v.id === item.id ? item : v));
      } else {
        // Add new custom
        const vocab = await this.getVocabulary();
        const maxId = Math.max(0, ...vocab.map((v) => this.numericId(v.id)));
        item.id = maxId + 1;
        item.isCustom = true;
        customVocab.push(item);
      }
      localStorage.setItem(CUSTOM_VOCAB_KEY, JSON.stringify(customVocab));
    } else {
      // It's a default item override
      const overrideVocabRaw = localStorage.getItem(OVERRIDE_VOCAB_KEY);
      const overrideVocab: Record<string, Vocabulary> = overrideVocabRaw ? JSON.parse(overrideVocabRaw) : {};
      overrideVocab[String(item.id)] = item;
      localStorage.setItem(OVERRIDE_VOCAB_KEY, JSON.stringify(overrideVocab));
    }
  }

  // Delete an item
  public static async deleteVerb(id: number, isCustom?: boolean): Promise<void> {
    if (isCustom) {
      const customVerbsRaw = localStorage.getItem(CUSTOM_VERBS_KEY);
      if (customVerbsRaw) {
        const customVerbs: Verb[] = JSON.parse(customVerbsRaw);
        const filtered = customVerbs.filter((v) => v.id !== id);
        localStorage.setItem(CUSTOM_VERBS_KEY, JSON.stringify(filtered));
      }
    } else {
      // For default items, we "delete" them by adding them to a deleted list in overrides
      const overrideVerbsRaw = localStorage.getItem(OVERRIDE_VERBS_KEY);
      const overrideVerbs: Record<number, any> = overrideVerbsRaw ? JSON.parse(overrideVerbsRaw) : {};
      // We can mark it as deleted so we filter it out during merge
      overrideVerbs[id] = { id, isDeleted: true };
      localStorage.setItem(OVERRIDE_VERBS_KEY, JSON.stringify(overrideVerbs));
    }
  }

  public static async deleteVocabulary(id: number | string, isCustom?: boolean): Promise<void> {
    if (isCustom) {
      const customVocabRaw = localStorage.getItem(CUSTOM_VOCAB_KEY);
      if (customVocabRaw) {
        const customVocab: Vocabulary[] = JSON.parse(customVocabRaw);
        const filtered = customVocab.filter((v) => String(v.id) !== String(id));
        localStorage.setItem(CUSTOM_VOCAB_KEY, JSON.stringify(filtered));
      }
    } else {
      const overrideVocabRaw = localStorage.getItem(OVERRIDE_VOCAB_KEY);
      const overrideVocab: Record<string, any> = overrideVocabRaw ? JSON.parse(overrideVocabRaw) : {};
      overrideVocab[String(id)] = { id, isDeleted: true };
      localStorage.setItem(OVERRIDE_VOCAB_KEY, JSON.stringify(overrideVocab));
    }
  }

  // Helper to check if item is deleted in overrides
  public static isVerbDeleted(id: number): boolean {
    const overrideVerbsRaw = localStorage.getItem(OVERRIDE_VERBS_KEY);
    if (overrideVerbsRaw) {
      const overrideVerbs: Record<number, any> = JSON.parse(overrideVerbsRaw);
      return !!overrideVerbs[id]?.isDeleted;
    }
    return false;
  }

  public static isVocabDeleted(id: number | string): boolean {
    const overrideVocabRaw = localStorage.getItem(OVERRIDE_VOCAB_KEY);
    if (overrideVocabRaw) {
      const overrideVocab: Record<string, any> = JSON.parse(overrideVocabRaw);
      return !!overrideVocab[String(id)]?.isDeleted;
    }
    return false;
  }

  // Clear all overrides and customs
  public static resetToDefault(): void {
    localStorage.removeItem(CUSTOM_VERBS_KEY);
    localStorage.removeItem(CUSTOM_VOCAB_KEY);
    localStorage.removeItem(OVERRIDE_VERBS_KEY);
    localStorage.removeItem(OVERRIDE_VOCAB_KEY);
  }
}
