import { Verb, Vocabulary } from "../types";
import { DataService, LocalContentStore } from "./dataService";
import { ProgressService } from "./progressService";
import { MistakeReviewService } from "./mistakeReviewService";
import {
  ContentFamily,
  getContentIdentityKey,
  inferContentFamily,
} from "./contentIdentityService";
import {
  AppliedImport,
  ExistingUpdateDecision,
  ImportPreviewReport,
  ImportableContent,
  PotentialDuplicateDecision,
  previewContentImport,
  validateContentItem,
} from "./contentImportService";
import {
  B2_GRAMMAR_PROGRESS_KEY,
  B2GrammarProgressService,
} from "../features/b2-grammar/b2GrammarProgressService";

export interface ValidationResult {
  success: boolean;
  error?: string;
}

export interface BackupPreviewResult extends ValidationResult {
  backup?: any;
  contentStore?: LocalContentStore;
  summary?: {
    customVerbs: number;
    customVocabulary: number;
    verbOverrides: number;
    vocabularyOverrides: number;
    progressItems: number;
    mistakes: number;
    dailySets: number;
    grammarProgressItems: number;
  };
}

export interface ProductionExportPreview extends ValidationResult {
  files?: Record<"verbs.json" | "nouns.json" | "adjectives.json" | "phrases.json" | "other-vocabulary.json", ImportableContent[]>;
  counts?: Record<ContentFamily, number>;
  warnings?: string[];
}

const BACKUP_STORAGE_KEYS = [
  "dmt_content_store_v2",
  "dmt_settings",
  "dmt_progress",
  "dmt_last_session",
  "deutsch-memory-trainer-mistakes",
  "deutschTrainerDailyStudySets",
  B2_GRAMMAR_PROGRESS_KEY,
];

function familyDataName(family: ContentFamily): keyof NonNullable<ProductionExportPreview["files"]> {
  if (family === "verbs") return "verbs.json";
  if (family === "nouns") return "nouns.json";
  if (family === "adjectives") return "adjectives.json";
  if (family === "phrases") return "phrases.json";
  return "other-vocabulary.json";
}

function stripLocalFields<T extends ImportableContent>(item: T): T {
  const clean = { ...item } as any;
  delete clean.isCustom;
  delete clean.isDeleted;
  return clean;
}

function legacyStoreFromBackup(backup: any): LocalContentStore {
  if (backup?.content_store?.version === 2) return backup.content_store;
  return {
    version: 2,
    customVerbs: Array.isArray(backup?.custom_verbs) ? backup.custom_verbs : [],
    customVocab: Array.isArray(backup?.custom_vocab) ? backup.custom_vocab : [],
    overrideVerbs: backup?.override_verbs && typeof backup.override_verbs === "object" ? backup.override_verbs : {},
    overrideVocab: backup?.override_vocab && typeof backup.override_vocab === "object" ? backup.override_vocab : {},
  };
}

export class ImportExportService {
  public static validateVerbsJSON(data: unknown): ValidationResult {
    const preview = previewContentImport(data, [], "verbs");
    if (preview.invalidItems) return { success: false, error: preview.items.find((item) => item.action === "invalid")?.reason };
    if (preview.idConflicts) return { success: false, error: preview.items.find((item) => item.action === "id_conflict")?.reason };
    if (preview.exactDuplicates) return { success: false, error: "Duplicate verb identity or id inside the file." };
    return { success: true };
  }

  public static validateVocabularyJSON(data: unknown, family?: Exclude<ContentFamily, "verbs">): ValidationResult {
    if (!Array.isArray(data)) return { success: false, error: "The JSON root must be an array." };
    if (family) {
      const preview = previewContentImport(data, [], family);
      if (preview.invalidItems || preview.idConflicts || preview.exactDuplicates) {
        const problem = preview.items.find((item) => ["invalid", "id_conflict", "exact_duplicate"].includes(item.action));
        return { success: false, error: problem?.reason || "Invalid or duplicate vocabulary data." };
      }
      return { success: true };
    }
    for (let index = 0; index < data.length; index++) {
      const item = data[index] as Vocabulary;
      const inferred = inferContentFamily(item);
      const validation = validateContentItem(item, inferred);
      if ("reason" in validation) return { success: false, error: `Item ${index}: ${validation.reason}` };
    }
    return { success: true };
  }

  public static async previewImport<T extends ImportableContent>(
    data: unknown,
    family: ContentFamily
  ): Promise<ImportPreviewReport<T>> {
    if (family === "verbs") {
      const existing = await DataService.getVerbs();
      return previewContentImport(data, existing, family, existing) as ImportPreviewReport<T>;
    }
    const allVocabulary = await DataService.getVocabulary();
    const existing = allVocabulary.filter((item) => inferContentFamily(item) === family);
    return previewContentImport(data, existing, family, allVocabulary) as ImportPreviewReport<T>;
  }

  public static async applyImport<T extends ImportableContent>(
    preview: ImportPreviewReport<T>,
    potentialDecisions: Record<number, PotentialDuplicateDecision> = {},
    updateDecisions: Record<number, ExistingUpdateDecision> = {}
  ): Promise<AppliedImport<T>> {
    return DataService.applyImportPreview(preview, potentialDecisions, updateDecisions);
  }

  public static async importVerbs(verbs: Verb[]): Promise<AppliedImport<Verb>> {
    const preview = await this.previewImport<Verb>(verbs, "verbs");
    const updates = Object.fromEntries(preview.items.filter((item) => item.action === "update").map((item) => [item.index, "update"])) as Record<number, ExistingUpdateDecision>;
    return this.applyImport(preview, {}, updates);
  }

  public static async importVocabulary(vocabulary: Vocabulary[]): Promise<AppliedImport<Vocabulary>[]> {
    const groups = new Map<Exclude<ContentFamily, "verbs">, Vocabulary[]>();
    vocabulary.forEach((item) => {
      const family = inferContentFamily(item) as Exclude<ContentFamily, "verbs">;
      groups.set(family, [...(groups.get(family) || []), item]);
    });
    const results: AppliedImport<Vocabulary>[] = [];
    for (const [family, items] of groups) {
      const preview = await this.previewImport<Vocabulary>(items, family);
      const updates = Object.fromEntries(preview.items.filter((item) => item.action === "update").map((item) => [item.index, "update"])) as Record<number, ExistingUpdateDecision>;
      results.push(await this.applyImport(preview, {}, updates));
    }
    return results;
  }

  public static downloadJSON(data: unknown, fileName: string): void {
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`;
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", jsonString);
    downloadAnchor.setAttribute("download", fileName);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  public static createFullBackup(): any {
    const contentStore = DataService.getLocalContentStore();
    const settings = localStorage.getItem("dmt_settings");
    const dailySets = localStorage.getItem("deutschTrainerDailyStudySets");
    const progressBackup = ProgressService.getBackupData();
    const mistakes = MistakeReviewService.exportMistakes();
    const b2GrammarProgress = B2GrammarProgressService.getBackupData();
    return {
      version: 2,
      timestamp: new Date().toISOString(),
      settings: settings ? JSON.parse(settings) : null,
      content_store: contentStore,
      custom_verbs: contentStore.customVerbs,
      custom_vocab: contentStore.customVocab,
      override_verbs: contentStore.overrideVerbs,
      override_vocab: contentStore.overrideVocab,
      progress: progressBackup.progress,
      lastSession: progressBackup.lastSession,
      mistakes,
      dailyStudySets: dailySets ? JSON.parse(dailySets) : null,
      b2GrammarProgress,
    };
  }

  public static exportFullBackup(): void {
    const backup = this.createFullBackup();
    this.downloadJSON(backup, "deutsch_memory_trainer_backup.json");
  }

  public static async previewFullBackup(backup: any): Promise<BackupPreviewResult> {
    if (!backup || typeof backup !== "object" || Array.isArray(backup)) {
      return { success: false, error: "Invalid backup file structure." };
    }
    const contentStore = legacyStoreFromBackup(backup);
    if (!Array.isArray(contentStore.customVerbs) || !Array.isArray(contentStore.customVocab)) {
      return { success: false, error: "Backup custom content must use arrays." };
    }
    if (!contentStore.overrideVerbs || !contentStore.overrideVocab) {
      return { success: false, error: "Backup override maps are missing." };
    }

    const productionVerbs = (await DataService.getVerbs()).filter((item) => !item.isCustom);
    const productionVocabulary = (await DataService.getVocabulary()).filter((item) => !item.isCustom);
    const verbCheck = previewContentImport(contentStore.customVerbs, productionVerbs, "verbs");
    if (verbCheck.invalidItems || verbCheck.idConflicts || verbCheck.exactDuplicates) {
      return { success: false, error: "Backup contains invalid or duplicate custom verbs." };
    }
    if (verbCheck.updates) {
      return { success: false, error: "Backup custom verbs overlap production verb identities." };
    }
    for (const family of ["nouns", "adjectives", "phrases", "other-vocabulary"] as const) {
      const familyItems = contentStore.customVocab.filter((item) => inferContentFamily(item) === family);
      const productionFamily = productionVocabulary.filter((item) => inferContentFamily(item) === family);
      const check = previewContentImport(familyItems, productionFamily, family, productionVocabulary);
      if (check.invalidItems || check.idConflicts || check.exactDuplicates) {
        return { success: false, error: `Backup contains invalid or duplicate ${family}.` };
      }
      if (check.updates) {
        return { success: false, error: `Backup custom ${family} overlap production identities.` };
      }
    }

    const customIds = new Map<string, string>();
    let repeatedCustomId = "";
    [...contentStore.customVerbs, ...contentStore.customVocab].forEach((item) => {
      const id = String(item.id);
      if (customIds.has(id)) repeatedCustomId = id;
      customIds.set(id, getContentIdentityKey(item, "infinitiv" in item ? "verbs" : inferContentFamily(item as Vocabulary)));
    });
    if (repeatedCustomId) {
      return { success: false, error: `Backup repeats custom id ${repeatedCustomId}.` };
    }

    const overrideVerbs = Object.values(contentStore.overrideVerbs).filter((item: any) => !item?.isDeleted);
    const overrideVocab = Object.values(contentStore.overrideVocab).filter((item: any) => !item?.isDeleted);
    if (overrideVerbs.some((item) => !getContentIdentityKey(item, "verbs"))) {
      return { success: false, error: "Backup contains a verb override without infinitiv." };
    }
    if (overrideVocab.some((item) => !getContentIdentityKey(item, inferContentFamily(item)))) {
      return { success: false, error: "Backup contains a vocabulary override without German identity." };
    }
    if (overrideVerbs.some((item) => {
      const base = productionVerbs.find((candidate) => String(candidate.id) === String(item.id));
      return !base || getContentIdentityKey(base, "verbs") !== getContentIdentityKey(item, "verbs");
    })) {
      return { success: false, error: "Backup contains a verb override with an unknown id or changed identity." };
    }
    if (overrideVocab.some((item) => {
      const base = productionVocabulary.find((candidate) => String(candidate.id) === String(item.id));
      if (!base) return true;
      const family = inferContentFamily(base);
      return getContentIdentityKey(base, family) !== getContentIdentityKey(item, family);
    })) {
      return { success: false, error: "Backup contains a vocabulary override with an unknown id or changed identity." };
    }
    if (backup.progress && (typeof backup.progress !== "object" || Array.isArray(backup.progress))) {
      return { success: false, error: "Backup progress must be an object." };
    }
    if (backup.mistakes && !Array.isArray(backup.mistakes)) {
      return { success: false, error: "Backup mistakes must be an array." };
    }
    if (backup.b2GrammarProgress && !B2GrammarProgressService.validateBackup(backup.b2GrammarProgress)) {
      return { success: false, error: "Backup B2 grammar progress is invalid." };
    }

    return {
      success: true,
      backup,
      contentStore,
      summary: {
        customVerbs: contentStore.customVerbs.length,
        customVocabulary: contentStore.customVocab.length,
        verbOverrides: Object.keys(contentStore.overrideVerbs).length,
        vocabularyOverrides: Object.keys(contentStore.overrideVocab).length,
        progressItems: Object.keys(backup.progress || {}).length,
        mistakes: Array.isArray(backup.mistakes) ? backup.mistakes.length : 0,
        dailySets: Object.keys(backup.dailyStudySets?.sets || {}).length,
        grammarProgressItems: Object.keys(backup.b2GrammarProgress?.exercises || {}).length,
      },
    };
  }

  public static applyFullBackup(preview: BackupPreviewResult): ValidationResult {
    if (!preview.success || !preview.backup || !preview.contentStore) {
      return { success: false, error: preview.error || "Backup has not passed preview validation." };
    }
    const before = new Map(BACKUP_STORAGE_KEYS.map((key) => [key, localStorage.getItem(key)]));
    try {
      const backup = preview.backup;
      DataService.replaceLocalContentStore(preview.contentStore, true);
      if (backup.settings) localStorage.setItem("dmt_settings", JSON.stringify(backup.settings));
      if (backup.mistakes) localStorage.setItem("deutsch-memory-trainer-mistakes", JSON.stringify(backup.mistakes));
      if (backup.progress) localStorage.setItem("dmt_progress", JSON.stringify(backup.progress));
      if (backup.lastSession) localStorage.setItem("dmt_last_session", JSON.stringify(backup.lastSession));
      if (backup.dailyStudySets) localStorage.setItem("deutschTrainerDailyStudySets", JSON.stringify(backup.dailyStudySets));
      if (backup.b2GrammarProgress && !B2GrammarProgressService.importBackup(backup.b2GrammarProgress)) {
        throw new Error("B2 grammar progress did not pass validation.");
      }
      return { success: true };
    } catch (error: any) {
      before.forEach((value, key) => {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      });
      return { success: false, error: `Backup import failed and was rolled back: ${error.message}` };
    }
  }

  public static async importFullBackup(backup: any): Promise<ValidationResult> {
    const preview = await this.previewFullBackup(backup);
    return this.applyFullBackup(preview);
  }

  public static async previewProductionExport(): Promise<ProductionExportPreview> {
    const verbs = (await DataService.getVerbs()).map(stripLocalFields);
    const vocabulary = (await DataService.getVocabulary()).map(stripLocalFields);
    const files = {
      "verbs.json": verbs,
      "nouns.json": vocabulary.filter((item) => inferContentFamily(item as Vocabulary) === "nouns"),
      "adjectives.json": vocabulary.filter((item) => inferContentFamily(item as Vocabulary) === "adjectives"),
      "phrases.json": vocabulary.filter((item) => inferContentFamily(item as Vocabulary) === "phrases"),
      "other-vocabulary.json": vocabulary.filter((item) => inferContentFamily(item as Vocabulary) === "other-vocabulary"),
    } as NonNullable<ProductionExportPreview["files"]>;

    const warnings: string[] = [];
    const counts = {} as Record<ContentFamily, number>;
    for (const family of ["verbs", "nouns", "adjectives", "phrases", "other-vocabulary"] as const) {
      const items = files[familyDataName(family)];
      const check = previewContentImport(items, [], family);
      counts[family] = items.length;
      if (check.invalidItems || check.idConflicts || check.exactDuplicates) {
        return { success: false, error: `${family} failed production validation.`, counts, warnings };
      }
      if (check.potentialDuplicates) warnings.push(`${family}: ${check.potentialDuplicates} potential duplicate(s).`);
    }
    return { success: true, files, counts, warnings };
  }

  public static downloadProductionFiles(preview: ProductionExportPreview): ValidationResult {
    if (!preview.success || !preview.files) return { success: false, error: preview.error || "Production preview is invalid." };
    Object.entries(preview.files).forEach(([fileName, data]) => this.downloadJSON(data, fileName));
    return { success: true };
  }
}
