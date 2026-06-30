import { Verb, Vocabulary } from "../types";
import { DataService } from "./dataService";
import { ProgressService } from "./progressService";
import { MistakeReviewService } from "./mistakeReviewService";

export interface ValidationResult {
  success: boolean;
  error?: string;
}

export class ImportExportService {
  // Validate verbs JSON
  public static validateVerbsJSON(data: any): ValidationResult {
    if (!Array.isArray(data)) {
      return { success: false, error: "Not an array. The JSON file must be an array of verbs." };
    }

    const seenIds = new Set<number>();

    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      if (typeof item !== "object" || item === null) {
        return { success: false, error: `Item at index ${i} is not a valid object.` };
      }

      // Check required fields
      if (item.id === undefined) {
        return { success: false, error: `Item at index ${i} is missing the required "id" field.` };
      }
      if (!item.infinitiv) {
        return { success: false, error: `Item at index ${i} (ID: ${item.id}) is missing the "infinitiv" field.` };
      }
      if (!item.arabic) {
        return { success: false, error: `Item at index ${i} (ID: ${item.id}) is missing the "arabic" field.` };
      }

      if (seenIds.has(item.id)) {
        return { success: false, error: `Duplicate ID detected: ${item.id} appears more than once.` };
      }
      seenIds.add(item.id);
    }

    return { success: true };
  }

  // Validate vocabulary JSON
  public static validateVocabularyJSON(data: any): ValidationResult {
    if (!Array.isArray(data)) {
      return { success: false, error: "Not an array. The JSON file must be an array of vocabulary items." };
    }

    const seenIds = new Set<number>();

    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      if (typeof item !== "object" || item === null) {
        return { success: false, error: `Item at index ${i} is not a valid object.` };
      }

      // Check required fields
      if (item.id === undefined) {
        return { success: false, error: `Item at index ${i} is missing the required "id" field.` };
      }
      if (!item.term) {
        return { success: false, error: `Item at index ${i} (ID: ${item.id}) is missing the "term" field.` };
      }
      if (!item.arabic) {
        return { success: false, error: `Item at index ${i} (ID: ${item.id}) is missing the "arabic" field.` };
      }

      if (seenIds.has(item.id)) {
        return { success: false, error: `Duplicate ID detected: ${item.id} appears more than once.` };
      }
      seenIds.add(item.id);
    }

    return { success: true };
  }

  // Import verbs array into custom/override storage
  public static async importVerbs(verbs: Verb[]): Promise<void> {
    const existing = await DataService.getVerbs();
    const existingIds = new Set(existing.map((v) => v.id));

    // Save each imported verb. If ID already exists and it's not custom, we save as override.
    // If it's custom or doesn't exist, we save as custom.
    for (const verb of verbs) {
      if (existingIds.has(verb.id)) {
        // override existing
        const isCustom = existing.find((v) => v.id === verb.id)?.isCustom;
        await DataService.saveVerb({ ...verb, isCustom });
      } else {
        // new custom item
        await DataService.saveVerb({ ...verb, isCustom: true });
      }
    }
  }

  // Import vocabulary array
  public static async importVocabulary(vocab: Vocabulary[]): Promise<void> {
    const existing = await DataService.getVocabulary();
    const existingIds = new Set(existing.map((v) => v.id));

    for (const item of vocab) {
      if (existingIds.has(item.id)) {
        const isCustom = existing.find((v) => v.id === item.id)?.isCustom;
        await DataService.saveVocabulary({ ...item, isCustom });
      } else {
        await DataService.saveVocabulary({ ...item, isCustom: true });
      }
    }
  }

  // Trigger JSON file download
  public static downloadJSON(data: any, fileName: string): void {
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(data, null, 2)
    )}`;
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", jsonString);
    downloadAnchor.setAttribute("download", fileName);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  // Full backup download
  public static exportFullBackup(): void {
    const customVerbs = localStorage.getItem("dmt_custom_verbs");
    const customVocab = localStorage.getItem("dmt_custom_vocab");
    const overrideVerbs = localStorage.getItem("dmt_override_verbs");
    const overrideVocab = localStorage.getItem("dmt_override_vocab");
    const settings = localStorage.getItem("dmt_settings");
    const progressBackup = ProgressService.getBackupData();
    const mistakes = MistakeReviewService.exportMistakes();

    const backup = {
      version: 1,
      timestamp: new Date().toISOString(),
      settings: settings ? JSON.parse(settings) : null,
      custom_verbs: customVerbs ? JSON.parse(customVerbs) : [],
      custom_vocab: customVocab ? JSON.parse(customVocab) : [],
      override_verbs: overrideVerbs ? JSON.parse(overrideVerbs) : {},
      override_vocab: overrideVocab ? JSON.parse(overrideVocab) : {},
      progress: progressBackup.progress,
      lastSession: progressBackup.lastSession,
      mistakes,
    };

    this.downloadJSON(backup, "deutsch_memory_trainer_backup.json");
  }

  // Import full backup
  public static importFullBackup(backup: any): ValidationResult {
    try {
      if (!backup || typeof backup !== "object") {
        return { success: false, error: "Invalid backup file structure." };
      }

      if (backup.custom_verbs) {
        localStorage.setItem("dmt_custom_verbs", JSON.stringify(backup.custom_verbs));
      }
      if (backup.custom_vocab) {
        localStorage.setItem("dmt_custom_vocab", JSON.stringify(backup.custom_vocab));
      }
      if (backup.override_verbs) {
        localStorage.setItem("dmt_override_verbs", JSON.stringify(backup.override_verbs));
      }
      if (backup.override_vocab) {
        localStorage.setItem("dmt_override_vocab", JSON.stringify(backup.override_vocab));
      }
      if (backup.settings) {
        localStorage.setItem("dmt_settings", JSON.stringify(backup.settings));
      }
      if (backup.mistakes) {
        MistakeReviewService.importMistakes(backup.mistakes);
      }

      if (backup.progress || backup.lastSession) {
        ProgressService.importBackupData({
          progress: backup.progress,
          lastSession: backup.lastSession,
        });
      }

      return { success: true };
    } catch (e: any) {
      return { success: false, error: `Backup import failed: ${e.message}` };
    }
  }
}
