import { Verb, VerbCategory, Vocabulary } from "../types";
import {
  ContentFamily,
  createNextContentId,
  getContentIdentityKey,
  getGermanContentTerm,
  getPotentialDuplicateKey,
  inferContentFamily,
  sameContentId,
} from "./contentIdentityService";
import {
  AppliedImport,
  applyContentImportPreview,
  ExistingUpdateDecision,
  ImportPreviewReport,
  ImportableContent,
  PotentialDuplicateDecision,
} from "./contentImportService";
import { DATA_VERSION } from "./dataVersion";

const CUSTOM_VERBS_KEY = "dmt_custom_verbs";
const CUSTOM_VOCAB_KEY = "dmt_custom_vocab";
const OVERRIDE_VERBS_KEY = "dmt_override_verbs";
const OVERRIDE_VOCAB_KEY = "dmt_override_vocab";
export const CONTENT_STORE_KEY = "dmt_content_store_v2";

const VERSIONED_DATA_PATHS = new Set([
  "/data/verbs.json",
  "/data/nouns.json",
  "/data/adjectives.json",
  "/data/phrases.json",
  "/data/other-vocabulary.json",
]);

function dataUrl(path: string): string {
  return VERSIONED_DATA_PATHS.has(path) ? `${path}?v=${DATA_VERSION}` : path;
}

export type SaveContentReason = "exact_duplicate" | "id_conflict" | "invalid";

export interface SaveContentResult {
  success: boolean;
  action: "created" | "updated" | "blocked";
  reason?: SaveContentReason;
  existingId?: number | string;
  message?: string;
  potentialDuplicateIds?: Array<number | string>;
}

export interface LocalContentStoreCore {
  version: 2;
  customVerbs: Verb[];
  customVocab: Vocabulary[];
  overrideVerbs: Record<string, Verb>;
  overrideVocab: Record<string, Vocabulary>;
}

export interface LocalContentStore extends LocalContentStoreCore {
  lastImportBackup?: {
    createdAt: string;
    data: LocalContentStoreCore;
  };
}

function emptyStore(): LocalContentStore {
  return { version: 2, customVerbs: [], customVocab: [], overrideVerbs: {}, overrideVocab: {} };
}

function parseStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.error(`[DataService] Invalid local storage value for ${key}`, error);
    return fallback;
  }
}

function cloneStoreCore(store: LocalContentStore): LocalContentStoreCore {
  return {
    version: 2,
    customVerbs: store.customVerbs.map((item) => ({ ...item })),
    customVocab: store.customVocab.map((item) => ({ ...item })),
    overrideVerbs: { ...store.overrideVerbs },
    overrideVocab: { ...store.overrideVocab },
  };
}

export class DataService {
  private static cachedVerbs: Verb[] = [];
  private static cachedVocab: Vocabulary[] = [];
  private static cachedVerbCategories: VerbCategory[] = [];
  private static dataFileCache = new Map<string, unknown[]>();
  private static pendingDataFiles = new Map<string, Promise<unknown[]>>();

  private static clearCaches(): void {
    this.cachedVerbs = [];
    this.cachedVocab = [];
  }

  private static async loadJsonArray<T>(path: string): Promise<T[]> {
    const cached = this.dataFileCache.get(path);
    if (cached) return cached as T[];
    const pending = this.pendingDataFiles.get(path);
    if (pending) return pending as Promise<T[]>;

    const request = (async () => {
      const response = await fetch(dataUrl(path), { cache: "no-store" });
      if (!response.ok) return [];
      const data = await response.json();
      const items = Array.isArray(data) ? data : [];
      this.dataFileCache.set(path, items);
      return items;
    })().finally(() => this.pendingDataFiles.delete(path));
    this.pendingDataFiles.set(path, request);
    return request as Promise<T[]>;
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

  public static getLocalContentStore(): LocalContentStore {
    const current = parseStorage<LocalContentStore | null>(CONTENT_STORE_KEY, null);
    if (current?.version === 2) {
      return {
        ...emptyStore(),
        ...current,
        customVerbs: Array.isArray(current.customVerbs) ? current.customVerbs : [],
        customVocab: Array.isArray(current.customVocab) ? current.customVocab : [],
        overrideVerbs: current.overrideVerbs && typeof current.overrideVerbs === "object" ? current.overrideVerbs : {},
        overrideVocab: current.overrideVocab && typeof current.overrideVocab === "object" ? current.overrideVocab : {},
      };
    }
    return {
      version: 2,
      customVerbs: parseStorage<Verb[]>(CUSTOM_VERBS_KEY, []),
      customVocab: parseStorage<Vocabulary[]>(CUSTOM_VOCAB_KEY, []),
      overrideVerbs: parseStorage<Record<string, Verb>>(OVERRIDE_VERBS_KEY, {}),
      overrideVocab: parseStorage<Record<string, Vocabulary>>(OVERRIDE_VOCAB_KEY, {}),
    };
  }

  public static replaceLocalContentStore(store: LocalContentStore, keepImportBackup = false): void {
    const next: LocalContentStore = {
      ...emptyStore(),
      ...store,
      version: 2,
      customVerbs: [...store.customVerbs],
      customVocab: [...store.customVocab],
      overrideVerbs: { ...store.overrideVerbs },
      overrideVocab: { ...store.overrideVocab },
    };
    if (keepImportBackup) {
      const previous = this.getLocalContentStore();
      next.lastImportBackup = { createdAt: new Date().toISOString(), data: cloneStoreCore(previous) };
    }
    localStorage.setItem(CONTENT_STORE_KEY, JSON.stringify(next));
    this.clearCaches();
  }

  private static mergeLocalItems<T extends Verb | Vocabulary>(
    defaults: T[],
    overrides: Record<string, T>,
    customs: T[],
    familyFor: (item: T) => ContentFamily
  ): T[] {
    const mergedDefaults = defaults.map((base) => {
      const override = overrides[String(base.id)];
      if (!override) return base;
      if ((override as any).isDeleted) return { ...base, ...override };
      const family = familyFor(base);
      const baseIdentity = getContentIdentityKey(base, family);
      const overrideIdentity = getContentIdentityKey(override, family);
      if (overrideIdentity && overrideIdentity !== baseIdentity) {
        console.error(`[DataService] Ignoring unsafe override for id ${base.id}: German identity changed.`);
        return base;
      }
      return { ...base, ...override, id: base.id };
    });

    const byId = new Map<string, T>();
    const byIdentity = new Map<string, T>();
    mergedDefaults.forEach((item) => {
      byId.set(String(item.id), item);
      const identity = getContentIdentityKey(item, familyFor(item));
      if (identity) byIdentity.set(identity, item);
    });

    const working = [...mergedDefaults];
    customs.forEach((raw) => {
      const family = familyFor(raw);
      const identity = getContentIdentityKey(raw, family);
      const id = raw.id || createNextContentId(working, family);
      const item = { ...raw, id, isCustom: true } as T;
      const idMatch = byId.get(String(id));
      if (idMatch && getContentIdentityKey(idMatch, familyFor(idMatch)) !== identity) {
        console.error(`[DataService] Ignoring custom item with conflicting id ${id}.`);
        return;
      }
      const identityMatch = byIdentity.get(identity);
      if (identityMatch && !sameContentId(identityMatch.id, id)) {
        console.error(`[DataService] Ignoring duplicate custom identity ${identity}.`);
        return;
      }
      if (idMatch) {
        const index = working.findIndex((candidate) => sameContentId(candidate.id, id));
        working[index] = item;
      } else {
        working.push(item);
      }
      byId.set(String(id), item);
      if (identity) byIdentity.set(identity, item);
    });
    return working.filter((item) => !(item as any).isDeleted);
  }

  public static async getVerbs(): Promise<Verb[]> {
    if (this.cachedVerbs.length) return this.cachedVerbs;
    try {
      const defaults = await this.loadJsonArray<Verb>("/data/verbs.json");
      const store = this.getLocalContentStore();
      const result = this.mergeLocalItems(defaults, store.overrideVerbs, store.customVerbs, () => "verbs");
      this.cachedVerbs = result;
      return result;
    } catch (error) {
      console.error("Error fetching or parsing verbs.json", error);
      const customs = this.getLocalContentStore().customVerbs;
      this.cachedVerbs = customs;
      return customs;
    }
  }

  public static async getVerbCategories(): Promise<VerbCategory[]> {
    try {
      const response = await fetch("/data/verb-categories.json", { cache: "no-store" });
      if (!response.ok) return [];
      const categories: VerbCategory[] = await response.json();
      this.cachedVerbCategories = categories.filter((category) => category.enabled !== false);
      return this.cachedVerbCategories;
    } catch (error) {
      console.error("Error fetching or parsing verb-categories.json", error);
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

  public static async getVocabulary(): Promise<Vocabulary[]> {
    if (this.cachedVocab.length) return this.cachedVocab;
    try {
      let defaults = await this.loadSplitVocabulary();
      if (!defaults.length) {
        defaults = await this.loadJsonArray<Vocabulary>("/data/vocabulary.json");
      }
      const store = this.getLocalContentStore();
      const result = this.mergeLocalItems(
        defaults,
        store.overrideVocab,
        store.customVocab,
        (item) => inferContentFamily(item)
      );
      this.cachedVocab = result;
      return result;
    } catch (error) {
      console.error("Error fetching or parsing vocabulary data", error);
      const customs = this.getLocalContentStore().customVocab;
      this.cachedVocab = customs;
      return customs;
    }
  }

  private static potentialDuplicates<T extends Verb | Vocabulary>(
    item: T,
    existing: T[],
    family: ContentFamily,
    excludedId?: string | number
  ): Array<string | number> {
    const key = getPotentialDuplicateKey(item, family);
    return existing
      .filter((candidate) => !sameContentId(candidate.id, excludedId))
      .filter((candidate) => {
        const candidateFamily = family === "verbs" ? "verbs" : inferContentFamily(candidate as Vocabulary);
        return getPotentialDuplicateKey(candidate, candidateFamily) === key &&
          getContentIdentityKey(candidate, candidateFamily) !== getContentIdentityKey(item, family);
      })
      .map((candidate) => candidate.id);
  }

  public static async saveVerb(verb: Verb): Promise<SaveContentResult> {
    const identity = getContentIdentityKey(verb, "verbs");
    if (!identity || !String(verb.arabic || "").trim()) {
      return { success: false, action: "blocked", reason: "invalid", message: "Verb requires infinitiv and Arabic meaning." };
    }
    const existing = await this.getVerbs();
    const idMatch = verb.id ? existing.find((item) => sameContentId(item.id, verb.id)) : undefined;
    if (idMatch && getContentIdentityKey(idMatch, "verbs") !== identity) {
      return { success: false, action: "blocked", reason: "id_conflict", existingId: idMatch.id, message: "This id belongs to a different verb." };
    }
    const identityMatch = existing.find((item) => getContentIdentityKey(item, "verbs") === identity && !sameContentId(item.id, verb.id));
    if (identityMatch) {
      return { success: false, action: "blocked", reason: "exact_duplicate", existingId: identityMatch.id, message: `Verb already exists with id ${identityMatch.id}.` };
    }

    const store = this.getLocalContentStore();
    const potentialDuplicateIds = this.potentialDuplicates(verb, existing, "verbs", verb.id);
    if (idMatch) {
      const updated = { ...idMatch, ...verb, id: idMatch.id, isCustom: idMatch.isCustom };
      if (idMatch.isCustom) {
        store.customVerbs = store.customVerbs.map((item) => sameContentId(item.id, idMatch.id) ? updated : item);
      } else {
        store.overrideVerbs[String(idMatch.id)] = updated;
      }
      this.replaceLocalContentStore(store);
      return { success: true, action: "updated", existingId: idMatch.id, potentialDuplicateIds };
    }

    const id = createNextContentId(existing, "verbs") as number;
    store.customVerbs.push({ ...verb, id, isCustom: true });
    this.replaceLocalContentStore(store);
    return { success: true, action: "created", existingId: id, potentialDuplicateIds };
  }

  public static async saveVocabulary(item: Vocabulary): Promise<SaveContentResult> {
    const family = inferContentFamily(item);
    const identity = getContentIdentityKey(item, family);
    if (!identity || !String(item.arabic || "").trim()) {
      return { success: false, action: "blocked", reason: "invalid", message: "Vocabulary requires a German term and Arabic meaning." };
    }
    const allExisting = await this.getVocabulary();
    const familyItems = allExisting.filter((candidate) => inferContentFamily(candidate) === family);
    const idMatch = item.id ? allExisting.find((candidate) => sameContentId(candidate.id, item.id)) : undefined;
    if (idMatch) {
      const idFamily = inferContentFamily(idMatch);
      if (idFamily !== family || getContentIdentityKey(idMatch, idFamily) !== identity) {
        return { success: false, action: "blocked", reason: "id_conflict", existingId: idMatch.id, message: "This id belongs to a different vocabulary identity." };
      }
    }
    const identityMatch = familyItems.find((candidate) => getContentIdentityKey(candidate, family) === identity && !sameContentId(candidate.id, item.id));
    if (identityMatch) {
      return { success: false, action: "blocked", reason: "exact_duplicate", existingId: identityMatch.id, message: `Vocabulary already exists with id ${identityMatch.id}.` };
    }

    const store = this.getLocalContentStore();
    const potentialDuplicateIds = this.potentialDuplicates(item, allExisting, family, item.id);
    if (idMatch) {
      const updated = { ...idMatch, ...item, id: idMatch.id, isCustom: idMatch.isCustom };
      if (idMatch.isCustom) {
        store.customVocab = store.customVocab.map((candidate) => sameContentId(candidate.id, idMatch.id) ? updated : candidate);
      } else {
        store.overrideVocab[String(idMatch.id)] = updated;
      }
      this.replaceLocalContentStore(store);
      return { success: true, action: "updated", existingId: idMatch.id, potentialDuplicateIds };
    }

    const id = createNextContentId(familyItems, family);
    store.customVocab.push({ ...item, id, isCustom: true });
    this.replaceLocalContentStore(store);
    return { success: true, action: "created", existingId: id, potentialDuplicateIds };
  }

  public static async applyImportPreview<T extends ImportableContent>(
    preview: ImportPreviewReport<T>,
    potentialDecisions: Record<number, PotentialDuplicateDecision> = {},
    updateDecisions: Record<number, ExistingUpdateDecision> = {}
  ): Promise<AppliedImport<T>> {
    const allExisting = preview.family === "verbs"
      ? await this.getVerbs()
      : (await this.getVocabulary()).filter((item) => inferContentFamily(item) === preview.family);
    const applied = applyContentImportPreview(allExisting as T[], preview, potentialDecisions, updateDecisions, true);
    const store = this.getLocalContentStore();

    applied.changes.forEach((change) => {
      const previous = allExisting.find((item) => sameContentId(item.id, change.item.id));
      if (preview.family === "verbs") {
        const verb = change.item as Verb;
        if (change.action === "created" || previous?.isCustom) {
          const index = store.customVerbs.findIndex((item) => sameContentId(item.id, verb.id));
          if (index >= 0) store.customVerbs[index] = { ...verb, isCustom: true };
          else store.customVerbs.push({ ...verb, isCustom: true });
        } else {
          store.overrideVerbs[String(verb.id)] = { ...verb, isCustom: false };
        }
      } else {
        const vocabulary = change.item as Vocabulary;
        if (change.action === "created" || previous?.isCustom) {
          const index = store.customVocab.findIndex((item) => sameContentId(item.id, vocabulary.id));
          if (index >= 0) store.customVocab[index] = { ...vocabulary, isCustom: true };
          else store.customVocab.push({ ...vocabulary, isCustom: true });
        } else {
          store.overrideVocab[String(vocabulary.id)] = { ...vocabulary, isCustom: false };
        }
      }
    });

    this.replaceLocalContentStore(store, true);
    return applied;
  }

  public static async deleteVerb(id: number, isCustom?: boolean): Promise<void> {
    const store = this.getLocalContentStore();
    if (isCustom) store.customVerbs = store.customVerbs.filter((item) => !sameContentId(item.id, id));
    else store.overrideVerbs[String(id)] = { id, isDeleted: true } as any;
    this.replaceLocalContentStore(store);
  }

  public static async deleteVocabulary(id: number | string, isCustom?: boolean): Promise<void> {
    const store = this.getLocalContentStore();
    if (isCustom) store.customVocab = store.customVocab.filter((item) => !sameContentId(item.id, id));
    else store.overrideVocab[String(id)] = { id, isDeleted: true } as any;
    this.replaceLocalContentStore(store);
  }

  public static isVerbDeleted(id: number): boolean {
    return Boolean((this.getLocalContentStore().overrideVerbs[String(id)] as any)?.isDeleted);
  }

  public static isVocabDeleted(id: number | string): boolean {
    return Boolean((this.getLocalContentStore().overrideVocab[String(id)] as any)?.isDeleted);
  }

  public static resetToDefault(): void {
    localStorage.removeItem(CONTENT_STORE_KEY);
    localStorage.removeItem(CUSTOM_VERBS_KEY);
    localStorage.removeItem(CUSTOM_VOCAB_KEY);
    localStorage.removeItem(OVERRIDE_VERBS_KEY);
    localStorage.removeItem(OVERRIDE_VOCAB_KEY);
    this.clearCaches();
  }

  public static describeItem(item: Verb | Vocabulary, family: ContentFamily): string {
    return getGermanContentTerm(item, family);
  }
}
