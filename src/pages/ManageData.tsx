import React, { useState, useEffect } from "react";
import {
  ArrowLeft,
  Database,
  Plus,
  Search,
  Trash2,
  Edit2,
  Copy,
  Download,
  Upload,
  CheckCircle,
  AlertCircle,
  X,
  BookOpen,
  Bookmark,
} from "lucide-react";
import { DataService } from "../services/dataService";
import { ImportExportService, ValidationResult } from "../services/importExportService";
import {
  detectArticle,
  detectAuxiliary,
  detectCleanTerm,
  detectGender,
  detectPlural,
  detectSeparable,
  detectVerbPrefix,
} from "../services/dataEnrichmentService.js";
import {
  getVocabularyFamily,
  getVocabularyFullTerm,
  getVocabularyNeedsReview,
  getVocabularyTypeLabel,
  VocabularyFamily,
} from "../services/vocabularyTrainingService";
import { UserSettings, Verb, VerbTenses, Vocabulary, TenseExamples, TenseKey } from "../types";

interface ManageDataProps {
  onNavigate: (page: string) => void;
  settings: UserSettings;
}

type VocabTabType = "nouns" | "adjectives" | "phrases" | "general_vocab";
type TabType = "verbs" | VocabTabType | "import_export";

const TENSE_COLUMNS: Array<{ key: TenseKey; label: string }> = [
  { key: "praesens", label: "Präsens" },
  { key: "praeteritum", label: "Präteritum" },
  { key: "perfekt", label: "Perfekt" },
  { key: "plusquamperfekt", label: "Plusquamperfekt" },
  { key: "futur1", label: "Futur I" },
  { key: "futur2", label: "Futur II" },
];

const PRONOUN_ROWS = [
  { key: "ich", label: "ich" },
  { key: "du", label: "du" },
  { key: "er_sie_es", label: "er/sie/es" },
  { key: "wir", label: "wir" },
  { key: "ihr", label: "ihr" },
  { key: "sie_Sie", label: "sie/Sie" },
];

function createEmptyTenses(): VerbTenses {
  return TENSE_COLUMNS.reduce((acc, tense) => {
    acc[tense.key] = PRONOUN_ROWS.reduce<Record<string, string>>((forms, pronoun) => {
      forms[pronoun.key] = "";
      return forms;
    }, {});
    return acc;
  }, {} as VerbTenses);
}

function normalizeTenses(tenses?: VerbTenses): VerbTenses {
  const empty = createEmptyTenses();
  TENSE_COLUMNS.forEach((tense) => {
    empty[tense.key] = {
      ...(empty[tense.key] || {}),
      ...(tenses?.[tense.key] || {}),
    };
  });
  return empty;
}

function createEmptyTenseExamples(): TenseExamples {
  return TENSE_COLUMNS.reduce((acc, tense) => {
    acc[tense.key] = { de: "", ar: "" };
    return acc;
  }, {} as TenseExamples);
}

function normalizeTenseExamples(examples?: TenseExamples): TenseExamples {
  const empty = createEmptyTenseExamples();
  TENSE_COLUMNS.forEach((tense) => {
    empty[tense.key] = {
      ...(empty[tense.key] || {}),
      ...(examples?.[tense.key] || {}),
    };
  });
  return empty;
}

function hasAnyTenseExamples(examples?: TenseExamples): boolean {
  return Boolean(
    examples &&
      TENSE_COLUMNS.some((tense) => {
        const item = examples[tense.key];
        return Boolean(item?.de?.trim() || item?.ar?.trim());
      })
  );
}

function parseListInput(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function listToInput(value?: string[]): string {
  return Array.isArray(value) ? value.join(", ") : "";
}

export default function ManageData({ onNavigate, settings }: ManageDataProps) {
  const [activeTab, setActiveTab] = useState<TabType>("verbs");
  const [verbs, setVerbs] = useState<Verb[]>([]);
  const [vocabList, setVocabList] = useState<Vocabulary[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dataFilter, setDataFilter] = useState("all");

  // Verb Form State
  const [showVerbForm, setShowVerbForm] = useState(false);
  const [editingVerb, setEditingVerb] = useState<Verb | null>(null);
  const [verbForm, setVerbForm] = useState({
    infinitiv: "",
    arabic: "",
    praesens: "",
    praeteritum: "",
    perfekt: "",
    example_de: "",
    example_ar: "",
    level: "B1/B2",
    type: "unregelmäßig",
    auxiliary: "",
    separable: false,
    prefix: "",
    tags: "",
    notes_ar: "",
    needsReview: true,
    dataSource: "manual",
    generated: false,
    tenses: undefined as VerbTenses | undefined,
    tenseExamples: undefined as TenseExamples | undefined,
    tensesNeedsReview: true,
    tensesSource: "manual",
    tensesGenerated: false,
  });

  // Vocab Form State
  const [showVocabForm, setShowVocabForm] = useState(false);
  const [editingVocab, setEditingVocab] = useState<Vocabulary | null>(null);
  const [vocabForm, setVocabForm] = useState({
    term: "",
    arabic: "",
    type: "Nomen",
    chapter: 1,
    chapterTitle: "",
    section: "",
    example_de: "",
    example_ar: "",
    level: "B1/B2",
    article: "",
    gender: "",
    plural: "",
    cleanTerm: "",
    synonyms: "",
    tags: "",
    notes_ar: "",
    needsReview: true,
    dataSource: "manual",
    generated: false,
  });

  // Import feedback
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const isRtl = settings.language === "ar";
  const ui = isRtl
    ? {
        dashboard: "لوحة التحكم",
        title: "إدارة البيانات",
        verbs: "الأفعال",
        vocab: "المفردات",
        nouns: "الأسماء",
        adjectives: "الصفات",
        phrases: "العبارات",
        generalVocabulary: "المفردات العامة",
        backupImport: "النسخ والاستيراد",
        searchVerb: "ابحث عن فعل...",
        searchVocab: "ابحث عن كلمة...",
        allTypes: "كل الأنواع",
        irregular: "غير منتظم",
        regular: "منتظم",
        addVerb: "إضافة فعل",
        addWord: "إضافة كلمة",
        exportTitle: "تصدير البيانات",
        exportDesc: "احفظ بياناتك أو نزّل قوائم المفردات والأفعال للأرشفة خارج التطبيق.",
        importTitle: "استيراد البيانات",
        importDesc: "اختر ملف JSON لإضافة بيانات جديدة أو استعادة نسخة احتياطية. يتم فحص الملف قبل إدخاله.",
        exportCustomVerbs: "تصدير الأفعال التي أضفتها فقط",
        exportCustomVocab: "تصدير المفردات التي أضفتها فقط",
        exportAllVerbs: "تصدير كل الأفعال (الأساسية + المخصصة)",
        exportAllVocab: "تصدير كل المفردات (الأساسية + المخصصة)",
        exportBackup: "تصدير نسخة احتياطية كاملة مع التقدم",
        importVerbs: "استيراد ملف أفعال JSON",
        importVocab: "استيراد ملف مفردات JSON",
        importBackup: "استعادة نسخة احتياطية كاملة",
        chooseFile: "اختيار ملف...",
        chooseBackup: "اختيار ملف النسخة الاحتياطية...",
        noVerbs: "لا توجد أفعال مطابقة. أضف فعلاً جديداً أو غيّر البحث/الفلتر.",
        noVocab: "لا توجد مفردات مطابقة. أضف كلمة جديدة أو غيّر البحث/الفلتر.",
        meaning: "المعنى",
        actions: "إجراءات",
        copyEdit: "نسخ وتعديل",
        edit: "تعديل",
        delete: "حذف",
        editVerb: "تعديل الفعل",
        newVerb: "إضافة فعل جديد",
        editVocab: "تعديل المفردة",
        newVocab: "إضافة كلمة جديدة",
        germanTerm: "المصطلح الألماني *",
        arabicMeaning: "المعنى العربي *",
        wordType: "نوع الكلمة",
        germanExample: "مثال ألماني",
        arabicExample: "مثال عربي",
        cancel: "إلغاء",
        clear: "تفريغ",
        save: "حفظ",
        infinitive: "المصدر *",
        forms: "الصيغ",
        entryType: "نوع الإدخال",
        custom: "مخصص",
        standard: "أساسي",
        praesens: "المضارع",
        praeteritum: "الماضي البسيط",
        perfekt: "الماضي التام",
        level: "المستوى",
        verbType: "نوع الفعل",
        term: "المصطلح",
        chapter: "الفصل",
        chapterTitle: "عنوان الفصل",
        section: "القسم",
        chapterType: "الفصل / النوع",
        typePrefix: "النوع",
        chapterPrefix: "فصل",
        noun: "اسم",
        verbWord: "فعل",
        adjective: "صفة",
        phrase: "عبارة",
        other: "أخرى",
        infinitivePlaceholder: "مثلاً: abbrechen",
        praesensPlaceholder: "مثلاً: er bricht ab",
        praeteritumPlaceholder: "مثلاً: brach ab",
        perfektPlaceholder: "مثلاً: hat abgebrochen",
        termPlaceholder: "مثلاً: die Klimaanlage, -n",
        chapterTitlePlaceholder: "مثلاً: Hier arbeite ich.",
        sectionPlaceholder: "مثلاً: Arbeitsräume",
        germanExamplePlaceholder: "مثلاً: Ich breche das Gespräch ab.",
        vocabGermanExamplePlaceholder: "مثلاً: Geben Sie bitte ein Beispiel.",
        confirmDeleteVerb: (name: string) => `هل تريد حذف الفعل "${name}" نهائياً؟`,
        confirmDeleteVocab: (name: string) => `هل تريد حذف الكلمة "${name}" نهائياً؟`,
        importError: (error?: string) => `خطأ أثناء الاستيراد: ${error || "ملف غير صالح"}`,
        backupImportError: (error?: string) => `خطأ أثناء استيراد النسخة الاحتياطية: ${error || "ملف غير صالح"}`,
        verbsImported: (count: number) => `تم استيراد ${count} فعل بنجاح.`,
        vocabImported: (count: number) => `تم استيراد ${count} مفردة بنجاح.`,
        backupRestored: "تمت استعادة النسخة الاحتياطية بنجاح.",
        parseError: (error?: string) => `تعذر قراءة الملف: ${error || "صيغة JSON غير صالحة"}`,
        copySuffix: "نسخة",
        auxiliary: "الفعل المساعد",
        separable: "فعل قابل للفصل",
        notSeparable: "غير قابل للفصل",
        prefix: "السابقة",
        tags: "وسوم",
        notesAr: "ملاحظات عربية",
        needsReview: "يحتاج مراجعة",
        markReviewed: "تمت المراجعة",
        createTenseTable: "إنشاء جدول أزمنة فارغ",
        tenseGrid: "محرر شبكة الأزمنة",
        tenseExamples: "أمثلة حسب الزمن",
        technicalMeta: "معلومات تقنية",
        tensesNeedsReview: "أزمنة تحتاج مراجعة",
        tensesGenerated: "الأزمنة مولدة تلقائياً",
        tensesSource: "مصدر الأزمنة",
        exportUpdatedVerbsJson: "تصدير verbs.json المحدّث",
        exportUpdatedVocabJson: "تصدير vocabulary.json المحدّث",
        article: "أداة التعريف",
        gender: "الجنس",
        plural: "الجمع",
        cleanTerm: "الكلمة النظيفة",
        synonyms: "مرادفات",
        generated: "مولّد تلقائياً",
        source: "المصدر",
        autoDetect: "اكتشاف تلقائي",
        pronoun: "الضمير",
        verbColumn: "الفعل",
        dataFilter: "فلتر البيانات",
        allData: "كل البيانات",
        needsReviewFilter: "يحتاج مراجعة",
        reviewedFilter: "تمت المراجعة",
        separableFilter: "قابل للفصل",
        hasTensesFilter: "لديه جدول أزمنة",
        hasExamplesFilter: "لديه أمثلة",
        hasArticleFilter: "لديه أداة تعريف",
        hasPluralFilter: "لديه جمع",
        defaultDeleteBlocked: "لا يمكن حذف عناصر JSON الأساسية من هنا. انسخها كعنصر مخصص أو عدّلها كتجاوز محلي.",
      }
    : {
        dashboard: "Dashboard",
        title: "Daten-Manager",
        verbs: "Verben",
        vocab: "Wortschatz",
        nouns: "Nomen",
        adjectives: "Adjektive",
        phrases: "Phrasen",
        generalVocabulary: "Allgemeiner Wortschatz",
        backupImport: "Sicherung & Import",
        searchVerb: "Verb suchen...",
        searchVocab: "Wort suchen...",
        allTypes: "Alle Typen",
        irregular: "Unregelmäßig",
        regular: "Regelmäßig",
        addVerb: "Verb hinzufügen",
        addWord: "Wort hinzufügen",
        exportTitle: "Daten-Export (Herunterladen)",
        exportDesc: "Sichere deine erstellten Daten oder lade die vollständigen Vokabellisten zur externen Archivierung herunter.",
        importTitle: "Daten-Import (Hochladen)",
        importDesc: "Wähle eine JSON-Datei aus, um deinen Wortschatz zu erweitern oder einen früheren Spielstand wiederherzustellen. Die importierten Daten werden validiert.",
        exportCustomVerbs: "Nur selbst hinzugefügte Verben exportieren",
        exportCustomVocab: "Nur selbst hinzugefügten Wortschatz exportieren",
        exportAllVerbs: "Alle Verben (Standard + Custom) exportieren",
        exportAllVocab: "Gesamten Wortschatz (Standard + Custom) exportieren",
        exportBackup: "Vollständiges Backup (inkl. Lernfortschritt) exportieren",
        importVerbs: "Verben JSON importieren",
        importVocab: "Wortschatz JSON importieren",
        importBackup: "Vollständiges Backup einspielen (Wiederherstellung)",
        chooseFile: "Datei auswählen...",
        chooseBackup: "Backup-Datei auswählen...",
        noVerbs: "Keine Verben gefunden. Füge ein neues Verb hinzu oder passe deinen Suchfilter an.",
        noVocab: "Keine Vokabeln gefunden. Füge ein neues Wort hinzu oder passe deinen Suchfilter an.",
        meaning: "Bedeutung",
        actions: "Aktionen",
        copyEdit: "Duplizieren & bearbeiten",
        edit: "Bearbeiten",
        delete: "Löschen",
        editVerb: "Verb bearbeiten",
        newVerb: "Neues Verb hinzufügen",
        editVocab: "Wortschatz bearbeiten",
        newVocab: "Neues Wort hinzufügen",
        germanTerm: "Deutscher Begriff *",
        arabicMeaning: "Arabische Bedeutung *",
        wordType: "Wortart",
        germanExample: "Deutsches Beispiel",
        arabicExample: "Arabisches Beispiel",
        cancel: "Abbrechen",
        clear: "Leeren",
        save: "Speichern",
        infinitive: "Infinitiv *",
        forms: "Formen",
        entryType: "Eintragstyp",
        custom: "Custom",
        standard: "Standard",
        praesens: "Präsens",
        praeteritum: "Präteritum",
        perfekt: "Perfekt",
        level: "Level",
        verbType: "Typ",
        term: "Begriff",
        chapter: "Kapitel",
        chapterTitle: "Kapitel-Titel",
        section: "Bereich / Section",
        chapterType: "Kapitel / Typ",
        typePrefix: "Typ",
        chapterPrefix: "Kap.",
        noun: "Nomen",
        verbWord: "Verb",
        adjective: "Adjektiv",
        phrase: "Phrase",
        other: "Andere",
        infinitivePlaceholder: "z.B. abbrechen",
        praesensPlaceholder: "z.B. er bricht ab",
        praeteritumPlaceholder: "z.B. brach ab",
        perfektPlaceholder: "z.B. hat abgebrochen",
        termPlaceholder: "z.B. die Klimaanlage, -n",
        chapterTitlePlaceholder: "Hier arbeite ich.",
        sectionPlaceholder: "Arbeitsräume",
        germanExamplePlaceholder: "Ich breche das Gespräch ab.",
        vocabGermanExamplePlaceholder: "Geben Sie bitte ein Beispiel.",
        confirmDeleteVerb: (name: string) => `Möchtest du das Verb "${name}" wirklich löschen?`,
        confirmDeleteVocab: (name: string) => `Möchtest du das Wort "${name}" wirklich löschen?`,
        importError: (error?: string) => `Fehler beim Import: ${error || "ungültige Datei"}`,
        backupImportError: (error?: string) => `Fehler beim Backup-Import: ${error || "ungültige Datei"}`,
        verbsImported: (count: number) => `${count} Verben erfolgreich importiert!`,
        vocabImported: (count: number) => `${count} Vokabeln erfolgreich importiert!`,
        backupRestored: "Backup erfolgreich wiederhergestellt!",
        parseError: (error?: string) => `Fehler beim Parsen der Datei: ${error || "ungültiges JSON"}`,
        copySuffix: "Kopie",
        auxiliary: "Auxiliary",
        separable: "Separable",
        notSeparable: "Not separable",
        prefix: "Prefix",
        tags: "Tags",
        notesAr: "Arabic notes",
        needsReview: "Needs review",
        markReviewed: "Mark as reviewed",
        createTenseTable: "Create empty tense table",
        tenseGrid: "Tense grid editor",
        tenseExamples: "Examples by tense",
        technicalMeta: "Technical metadata",
        tensesNeedsReview: "Tenses need review",
        tensesGenerated: "Tenses generated",
        tensesSource: "Tenses source",
        exportUpdatedVerbsJson: "Export updated verbs.json",
        exportUpdatedVocabJson: "Export updated vocabulary.json",
        article: "Article",
        gender: "Gender",
        plural: "Plural",
        cleanTerm: "Clean term",
        synonyms: "Synonyms",
        generated: "Generated",
        source: "Source",
        autoDetect: "Auto-detect",
        pronoun: "Pronoun",
        verbColumn: "Verb",
        dataFilter: "Data filter",
        allData: "All data",
        needsReviewFilter: "Needs review",
        reviewedFilter: "Reviewed",
        separableFilter: "Separable",
        hasTensesFilter: "Has tense table",
        hasExamplesFilter: "Has examples",
        hasArticleFilter: "Has article",
        hasPluralFilter: "Has plural",
        defaultDeleteBlocked: "Default JSON items cannot be deleted here. Duplicate them as custom items or edit them as local overrides.",
      };

  const getWordTypeLabel = (type?: string) => {
    const labels: Record<string, string> = {
      Nomen: ui.noun,
      Verb: ui.verbWord,
      Adjektiv: ui.adjective,
      Phrase: ui.phrase,
      Andere: ui.other,
    };
    return type ? labels[type] || type : "-";
  };

  const getManageVocabTerm = (item: Vocabulary) => getVocabularyFullTerm(item) || item.term || "";

  const vocabTabConfigs: Array<{ id: VocabTabType; label: string; family: VocabularyFamily }> = [
    { id: "nouns", label: ui.nouns, family: "noun" },
    { id: "adjectives", label: ui.adjectives, family: "adjective" },
    { id: "phrases", label: ui.phrases, family: "phrase" },
    { id: "general_vocab", label: ui.generalVocabulary, family: "other" },
  ];
  const activeVocabTab = vocabTabConfigs.find((tab) => tab.id === activeTab);
  const isVocabTab = Boolean(activeVocabTab);
  const activeVocabItems = activeVocabTab
    ? vocabList.filter((item) => getVocabularyFamily(item) === activeVocabTab.family)
    : [];

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    const v = await DataService.getVerbs();
    const vc = await DataService.getVocabulary();
    setVerbs(v);
    setVocabList(vc);
    setLoading(false);
  };

  // Verb Actions
  const handleSaveVerb = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verbForm.infinitiv || !verbForm.arabic) return;

    const toSave: Verb = {
      id: editingVerb?.id || 0,
      infinitiv: verbForm.infinitiv,
      arabic: verbForm.arabic,
      praesens: verbForm.praesens,
      praeteritum: verbForm.praeteritum,
      perfekt: verbForm.perfekt,
      example_de: verbForm.example_de,
      example_ar: verbForm.example_ar,
      level: verbForm.level,
      type: verbForm.type,
      isCustom: editingVerb ? editingVerb.isCustom : true,
      tenses: verbForm.tenses,
      tenseExamples: verbForm.tenseExamples,
      auxiliary: verbForm.auxiliary as Verb["auxiliary"],
      separable: verbForm.separable,
      prefix: verbForm.prefix,
      tags: parseListInput(verbForm.tags),
      notes_ar: verbForm.notes_ar,
      dataMeta: {
        ...(editingVerb?.dataMeta || {}),
        generated: verbForm.generated,
        needsReview: verbForm.needsReview,
        source: verbForm.dataSource,
      },
      tensesMeta: {
        ...(editingVerb?.tensesMeta || {}),
        generated: verbForm.tensesGenerated,
        needsReview: verbForm.tensesNeedsReview,
        source: verbForm.tensesSource,
      },
    };

    await DataService.saveVerb(toSave);
    setShowVerbForm(false);
    setEditingVerb(null);
    clearVerbForm();
    await loadAllData();
  };

  const handleEditVerb = (v: Verb) => {
    setEditingVerb(v);
    setVerbForm({
      infinitiv: v.infinitiv,
      arabic: v.arabic,
      praesens: v.praesens || "",
      praeteritum: v.praeteritum || "",
      perfekt: v.perfekt || "",
      example_de: v.example_de || "",
      example_ar: v.example_ar || "",
      level: v.level || "B1/B2",
      type: v.type || "unregelmäßig",
      auxiliary: v.auxiliary || detectAuxiliary(v.perfekt || ""),
      separable: v.separable ?? detectSeparable(v.prefix || detectVerbPrefix(v.infinitiv)),
      prefix: v.prefix || detectVerbPrefix(v.infinitiv),
      tags: listToInput(v.tags),
      notes_ar: v.notes_ar || "",
      needsReview: v.dataMeta?.needsReview ?? true,
      dataSource: v.dataMeta?.source || "manual",
      generated: v.dataMeta?.generated ?? false,
      tenses: v.tenses ? normalizeTenses(v.tenses) : undefined,
      tenseExamples: v.tenseExamples ? normalizeTenseExamples(v.tenseExamples) : undefined,
      tensesNeedsReview: v.tensesMeta?.needsReview ?? v.dataMeta?.needsReview ?? true,
      tensesSource: v.tensesMeta?.source || "manual",
      tensesGenerated: v.tensesMeta?.generated ?? false,
    });
    setShowVerbForm(true);
  };

  const handleDuplicateVerb = (v: Verb) => {
    setEditingVerb(null); // save as NEW custom item
    setVerbForm({
      infinitiv: `${v.infinitiv} (${ui.copySuffix})`,
      arabic: v.arabic,
      praesens: v.praesens || "",
      praeteritum: v.praeteritum || "",
      perfekt: v.perfekt || "",
      example_de: v.example_de || "",
      example_ar: v.example_ar || "",
      level: v.level || "B1/B2",
      type: v.type || "unregelmäßig",
      auxiliary: v.auxiliary || detectAuxiliary(v.perfekt || ""),
      separable: v.separable ?? detectSeparable(v.prefix || detectVerbPrefix(v.infinitiv)),
      prefix: v.prefix || detectVerbPrefix(v.infinitiv),
      tags: listToInput(v.tags),
      notes_ar: v.notes_ar || "",
      needsReview: v.dataMeta?.needsReview ?? true,
      dataSource: v.dataMeta?.source || "manual",
      generated: v.dataMeta?.generated ?? false,
      tenses: v.tenses ? normalizeTenses(v.tenses) : undefined,
      tenseExamples: v.tenseExamples ? normalizeTenseExamples(v.tenseExamples) : undefined,
      tensesNeedsReview: v.tensesMeta?.needsReview ?? v.dataMeta?.needsReview ?? true,
      tensesSource: v.tensesMeta?.source || "manual",
      tensesGenerated: v.tensesMeta?.generated ?? false,
    });
    setShowVerbForm(true);
  };

  const handleDeleteVerb = async (v: Verb) => {
    if (!v.isCustom) {
      alert(ui.defaultDeleteBlocked);
      return;
    }
    if (confirm(ui.confirmDeleteVerb(v.infinitiv))) {
      await DataService.deleteVerb(v.id, v.isCustom);
      await loadAllData();
    }
  };

  const clearVerbForm = () => {
    setVerbForm({
      infinitiv: "",
      arabic: "",
      praesens: "",
      praeteritum: "",
      perfekt: "",
      example_de: "",
      example_ar: "",
      level: "B1/B2",
      type: "unregelmäßig",
      auxiliary: "",
      separable: false,
      prefix: "",
      tags: "",
      notes_ar: "",
      needsReview: true,
      dataSource: "manual",
      generated: false,
      tenses: undefined,
      tenseExamples: undefined,
      tensesNeedsReview: true,
      tensesSource: "manual",
      tensesGenerated: false,
    });
  };

  // Vocab Actions
  const handleSaveVocab = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vocabForm.term || !vocabForm.arabic) return;

    const toSave: Vocabulary = {
      id: editingVocab?.id || 0,
      term: vocabForm.term,
      arabic: vocabForm.arabic,
      type: vocabForm.type,
      chapter: Number(vocabForm.chapter),
      chapterTitle: vocabForm.chapterTitle,
      section: vocabForm.section,
      example_de: vocabForm.example_de,
      example_ar: vocabForm.example_ar,
      level: vocabForm.level,
      isCustom: editingVocab ? editingVocab.isCustom : true,
      article: vocabForm.article as Vocabulary["article"],
      gender: vocabForm.gender as Vocabulary["gender"],
      plural: vocabForm.plural,
      cleanTerm: vocabForm.cleanTerm,
      synonyms: parseListInput(vocabForm.synonyms),
      tags: parseListInput(vocabForm.tags),
      notes_ar: vocabForm.notes_ar,
      vocabMeta: {
        ...(editingVocab?.vocabMeta || {}),
        generated: vocabForm.generated,
        needsReview: vocabForm.needsReview,
        source: vocabForm.dataSource,
      },
    };

    await DataService.saveVocabulary(toSave);
    setShowVocabForm(false);
    setEditingVocab(null);
    clearVocabForm();
    await loadAllData();
  };

  const handleEditVocab = (v: Vocabulary) => {
    const term = getManageVocabTerm(v);
    setEditingVocab(v);
    setVocabForm({
      term,
      arabic: v.arabic,
      type: v.type || "Nomen",
      chapter: Number(v.chapter || 1),
      chapterTitle: v.chapterTitle || "",
      section: v.section || "",
      example_de: v.example_de || "",
      example_ar: v.example_ar || "",
      level: v.level || "B1/B2",
      article: v.article || detectArticle(term),
      gender: v.gender || detectGender(v.article || detectArticle(term)),
      plural: v.plural || v.pluralTerm || detectPlural(term),
      cleanTerm: v.cleanTerm || detectCleanTerm(term),
      synonyms: listToInput(v.synonyms),
      tags: listToInput(v.tags),
      notes_ar: v.notes_ar || "",
      needsReview: v.vocabMeta?.needsReview ?? true,
      dataSource: v.vocabMeta?.source || "manual",
      generated: v.vocabMeta?.generated ?? false,
    });
    setShowVocabForm(true);
  };

  const handleDuplicateVocab = (v: Vocabulary) => {
    const term = getManageVocabTerm(v);
    setEditingVocab(null);
    setVocabForm({
      term: `${term} (${ui.copySuffix})`,
      arabic: v.arabic,
      type: v.type || "Nomen",
      chapter: Number(v.chapter || 1),
      chapterTitle: v.chapterTitle || "",
      section: v.section || "",
      example_de: v.example_de || "",
      example_ar: v.example_ar || "",
      level: v.level || "B1/B2",
      article: v.article || detectArticle(term),
      gender: v.gender || detectGender(v.article || detectArticle(term)),
      plural: v.plural || v.pluralTerm || detectPlural(term),
      cleanTerm: v.cleanTerm || detectCleanTerm(term),
      synonyms: listToInput(v.synonyms),
      tags: listToInput(v.tags),
      notes_ar: v.notes_ar || "",
      needsReview: v.vocabMeta?.needsReview ?? true,
      dataSource: v.vocabMeta?.source || "manual",
      generated: v.vocabMeta?.generated ?? false,
    });
    setShowVocabForm(true);
  };

  const handleDeleteVocab = async (v: Vocabulary) => {
    if (!v.isCustom) {
      alert(ui.defaultDeleteBlocked);
      return;
    }
    if (confirm(ui.confirmDeleteVocab(getManageVocabTerm(v)))) {
      await DataService.deleteVocabulary(v.id, v.isCustom);
      await loadAllData();
    }
  };

  const clearVocabForm = () => {
    setVocabForm({
      term: "",
      arabic: "",
      type: "Nomen",
      chapter: 1,
      chapterTitle: "",
      section: "",
      example_de: "",
      example_ar: "",
      level: "B1/B2",
      article: "",
      gender: "",
      plural: "",
      cleanTerm: "",
      synonyms: "",
      tags: "",
      notes_ar: "",
      needsReview: true,
      dataSource: "manual",
      generated: false,
    });
  };

  // Import / Export JSON Actions
  const handleExportCustomVerbs = () => {
    const list = verbs.filter((v) => v.isCustom);
    ImportExportService.downloadJSON(list, "deutsch_memory_trainer_custom_verbs.json");
  };

  const handleExportCustomVocab = () => {
    const list = vocabList.filter((v) => v.isCustom);
    ImportExportService.downloadJSON(list, "deutsch_memory_trainer_custom_vocabulary.json");
  };

  const handleExportMergedVerbs = () => {
    ImportExportService.downloadJSON(verbs, "deutsch_memory_trainer_all_verbs.json");
  };

  const handleExportMergedVocab = () => {
    ImportExportService.downloadJSON(vocabList, "deutsch_memory_trainer_all_vocabulary.json");
  };

  const handleExportUpdatedVerbsJson = () => {
    ImportExportService.downloadJSON(verbs, "verbs.json");
  };

  const handleExportUpdatedVocabularyJson = () => {
    ImportExportService.downloadJSON(vocabList, "vocabulary.json");
  };

  const handleExportBackup = () => {
    ImportExportService.exportFullBackup();
  };

  const handleCreateTenseTable = () => {
    setVerbForm((prev) => ({
      ...prev,
      tenses: createEmptyTenses(),
      tenseExamples: prev.tenseExamples || createEmptyTenseExamples(),
      tensesNeedsReview: true,
    }));
  };

  const handleTenseCellChange = (tense: TenseKey, pronoun: string, value: string) => {
    setVerbForm((prev) => {
      const nextTenses = normalizeTenses(prev.tenses);
      nextTenses[tense] = {
        ...(nextTenses[tense] || {}),
        [pronoun]: value,
      };
      return { ...prev, tenses: nextTenses };
    });
  };

  const handleTenseExampleChange = (tense: TenseKey, lang: "de" | "ar", value: string) => {
    setVerbForm((prev) => {
      const nextExamples = normalizeTenseExamples(prev.tenseExamples);
      nextExamples[tense] = {
        ...(nextExamples[tense] || {}),
        [lang]: value,
      };
      return { ...prev, tenseExamples: nextExamples };
    });
  };

  const handleMarkVerbReviewed = () => {
    setVerbForm((prev) => ({
      ...prev,
      needsReview: false,
      generated: false,
      tensesNeedsReview: false,
      tensesGenerated: false,
    }));
  };

  const handleMarkVocabReviewed = () => {
    setVocabForm((prev) => ({ ...prev, needsReview: false, generated: false }));
  };

  const handleAutoDetectVerb = () => {
    const prefix = detectVerbPrefix(verbForm.infinitiv);
    const auxiliary = detectAuxiliary(verbForm.perfekt);
    setVerbForm((prev) => ({
      ...prev,
      prefix: prev.prefix || prefix,
      separable: prev.separable || detectSeparable(prefix),
      auxiliary: prev.auxiliary || auxiliary,
      tags: prev.tags || [prefix && "trennbar", prev.type, prev.level].filter(Boolean).join(", "),
      dataSource: "auto-detected",
      generated: true,
    }));
  };

  const handleAutoDetectVocab = () => {
    const article = detectArticle(vocabForm.term);
    setVocabForm((prev) => ({
      ...prev,
      article: prev.article || article,
      gender: prev.gender || detectGender(article),
      plural: prev.plural || detectPlural(prev.term),
      cleanTerm: prev.cleanTerm || detectCleanTerm(prev.term),
      dataSource: "auto-detected",
      generated: true,
    }));
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>, type: "verbs" | "vocab" | "backup") => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);

        if (type === "verbs") {
          const check = ImportExportService.validateVerbsJSON(parsed);
          if (!check.success) {
            setFeedback({ success: false, message: ui.importError(check.error) });
            return;
          }
          await ImportExportService.importVerbs(parsed);
          setFeedback({ success: true, message: ui.verbsImported(parsed.length) });
        } else if (type === "vocab") {
          const check = ImportExportService.validateVocabularyJSON(parsed);
          if (!check.success) {
            setFeedback({ success: false, message: ui.importError(check.error) });
            return;
          }
          await ImportExportService.importVocabulary(parsed);
          setFeedback({ success: true, message: ui.vocabImported(parsed.length) });
        } else if (type === "backup") {
          const check = ImportExportService.importFullBackup(parsed);
          if (!check.success) {
            setFeedback({ success: false, message: ui.backupImportError(check.error) });
            return;
          }
          setFeedback({ success: true, message: ui.backupRestored });
        }
        await loadAllData();
      } catch (err: any) {
        setFeedback({ success: false, message: ui.parseError(err.message) });
      }
    };
    reader.readAsText(file);
    // clear input value to allow importing same file again
    e.target.value = "";
  };

  // Filters
  const filteredVerbs = verbs.filter((v) => {
    const matchesSearch =
      v.infinitiv.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.arabic.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === "all" || v.type === typeFilter;
    const hasTenseTable = Boolean(v.tenses && Object.keys(v.tenses).length > 0);
    const matchesData =
      dataFilter === "all" ||
      (dataFilter === "needsReview" && (v.dataMeta?.needsReview || v.tensesMeta?.needsReview)) ||
      (dataFilter === "reviewed" && !v.dataMeta?.needsReview && !v.tensesMeta?.needsReview) ||
      (dataFilter === "separable" && v.separable) ||
      (dataFilter === "hasTenses" && hasTenseTable) ||
      (dataFilter === "hasExamples" && Boolean(v.example_de || v.example_ar || hasAnyTenseExamples(v.tenseExamples)));
    return matchesSearch && matchesType && matchesData;
  });

  const filteredVocab = activeVocabItems.filter((v) => {
    const term = getVocabularyFullTerm(v).toLowerCase();
    const arabic = (v.arabic || "").toLowerCase();
    const typeLabel = getVocabularyTypeLabel(v).toLowerCase();
    const matchesSearch =
      term.includes(searchQuery.toLowerCase()) ||
      arabic.includes(searchQuery.toLowerCase()) ||
      typeLabel.includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === "all" || v.type === typeFilter;
    const matchesData =
      dataFilter === "all" ||
      (dataFilter === "needsReview" && getVocabularyNeedsReview(v)) ||
      (dataFilter === "reviewed" && !getVocabularyNeedsReview(v)) ||
      (dataFilter === "hasExamples" && Boolean(v.example_de || v.example_ar || v.examples?.length)) ||
      (dataFilter === "hasArticle" && Boolean(v.article)) ||
      (dataFilter === "hasPlural" && Boolean(v.plural || v.pluralTerm));
    return matchesSearch && matchesType && matchesData;
  });

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-6" dir={isRtl ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <button
          onClick={() => onNavigate("dashboard")}
          className="inline-flex items-center text-xs uppercase tracking-wider font-bold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className={`${isRtl ? "ml-1.5 rotate-180" : "mr-1.5"}`} size={16} /> {ui.dashboard}
        </button>
        <div className={`flex items-center space-x-2 ${isRtl ? "space-x-reverse" : ""}`}>
          <span className="p-1.5 bg-slate-900 text-white rounded">
            <Database size={16} />
          </span>
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">{ui.title}</span>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className={`flex border-b border-slate-100 overflow-x-auto space-x-4 ${isRtl ? "space-x-reverse" : ""}`}>
        <button
          onClick={() => {
            setActiveTab("verbs");
            setSearchQuery("");
            setTypeFilter("all");
            setDataFilter("all");
          }}
          className={`pb-3 text-sm font-semibold uppercase tracking-wider border-b-2 px-1 transition-all ${
            activeTab === "verbs"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-slate-800"
          }`}
        >
          {ui.verbs} ({verbs.length})
        </button>
        {vocabTabConfigs.map((tab) => {
          const count = vocabList.filter((item) => getVocabularyFamily(item) === tab.family).length;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setSearchQuery("");
                setTypeFilter("all");
                setDataFilter("all");
              }}
              className={`pb-3 text-sm font-semibold uppercase tracking-wider border-b-2 px-1 transition-all ${
                activeTab === tab.id
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-slate-800"
              }`}
            >
              {tab.label} ({count})
            </button>
          );
        })}
        <button
          onClick={() => setActiveTab("import_export")}
          className={`pb-3 text-sm font-semibold uppercase tracking-wider border-b-2 px-1 transition-all ${
            activeTab === "import_export"
              ? "border-emerald-600 text-emerald-600"
              : "border-transparent text-gray-500 hover:text-slate-800"
          }`}
        >
          {ui.backupImport}
        </button>
      </div>

      {/* VERBS TAB */}
      {activeTab === "verbs" && (
        <div className="space-y-6">
          {/* Action Bar */}
          {!showVerbForm && (
            <div className="flex flex-col sm:flex-row gap-3 justify-between items-center bg-slate-50 p-4 rounded-xl">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                <input
                  type="text"
                  placeholder={ui.searchVerb}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-xs font-medium bg-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex w-full sm:w-auto items-center justify-between sm:justify-end gap-3">
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium bg-white focus:outline-none"
                >
                  <option value="all">{ui.allTypes}</option>
                  <option value="unregelmäßig">{ui.irregular}</option>
                  <option value="regelmäßig">{ui.regular}</option>
                </select>

                <select
                  value={dataFilter}
                  onChange={(e) => setDataFilter(e.target.value)}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium bg-white focus:outline-none"
                  aria-label={ui.dataFilter}
                >
                  <option value="all">{ui.allData}</option>
                  <option value="needsReview">{ui.needsReviewFilter}</option>
                  <option value="reviewed">{ui.reviewedFilter}</option>
                  <option value="separable">{ui.separableFilter}</option>
                  <option value="hasTenses">{ui.hasTensesFilter}</option>
                  <option value="hasExamples">{ui.hasExamplesFilter}</option>
                </select>

                <button
                  onClick={() => {
                    clearVerbForm();
                    setEditingVerb(null);
                    setShowVerbForm(true);
                  }}
                  className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider rounded-lg shadow transition-colors cursor-pointer"
                >
                  <Plus className={isRtl ? "ml-1.5" : "mr-1.5"} size={14} /> {ui.addVerb}
                </button>
              </div>
            </div>
          )}

          {/* Add / Edit Verb Form */}
          {showVerbForm && (
            <form
              onSubmit={handleSaveVerb}
              className="bg-white rounded-2xl border border-slate-100 p-6 sm:p-8 space-y-6 shadow-md"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-50 pb-3">
                <h3 className="font-extrabold text-slate-800 text-lg">
                  {editingVerb ? `${ui.editVerb}: "${editingVerb.infinitiv}"` : ui.newVerb}
                </h3>
                <div className={`flex flex-wrap gap-2 ${isRtl ? "sm:justify-end" : "sm:justify-start"}`}>
                  <button
                    type="button"
                    onClick={handleAutoDetectVerb}
                    className="px-3 py-2 border border-blue-100 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
                  >
                    {ui.autoDetect}
                  </button>
                  <button
                    type="button"
                    onClick={handleMarkVerbReviewed}
                    className="px-3 py-2 border border-emerald-100 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
                  >
                    {ui.markReviewed}
                  </button>
                  <button
                    type="button"
                    onClick={handleExportUpdatedVerbsJson}
                    className="px-3 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
                  >
                    {ui.exportUpdatedVerbsJson}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 block uppercase tracking-wider">
                    {ui.infinitive}
                  </label>
                  <input
                    type="text"
                    required
                    dir="ltr"
                    lang="de"
                    value={verbForm.infinitiv}
                    onChange={(e) => setVerbForm({ ...verbForm, infinitiv: e.target.value })}
                    placeholder={ui.infinitivePlaceholder}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium text-left focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 block uppercase tracking-wider">
                    {ui.arabicMeaning}
                  </label>
                  <input
                    type="text"
                    required
                    dir="rtl"
                    value={verbForm.arabic}
                    onChange={(e) => setVerbForm({ ...verbForm, arabic: e.target.value })}
                    placeholder="يقطع / يوقف"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-blue-500 font-arabic"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 block uppercase tracking-wider">
                    {ui.praesens}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    lang="de"
                    value={verbForm.praesens}
                    onChange={(e) => setVerbForm({ ...verbForm, praesens: e.target.value })}
                    placeholder={ui.praesensPlaceholder}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium text-left focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 block uppercase tracking-wider">
                    {ui.praeteritum}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    lang="de"
                    value={verbForm.praeteritum}
                    onChange={(e) => setVerbForm({ ...verbForm, praeteritum: e.target.value })}
                    placeholder={ui.praeteritumPlaceholder}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium text-left focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 block uppercase tracking-wider">
                    {ui.perfekt}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    lang="de"
                    value={verbForm.perfekt}
                    onChange={(e) => setVerbForm({ ...verbForm, perfekt: e.target.value })}
                    placeholder={ui.perfektPlaceholder}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium text-left focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 block uppercase tracking-wider">
                    {ui.level}
                  </label>
                  <select
                    value={verbForm.level}
                    onChange={(e) => setVerbForm({ ...verbForm, level: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium bg-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="B1">B1</option>
                    <option value="B2">B2</option>
                    <option value="B1/B2">B1/B2</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 block uppercase tracking-wider">
                    {ui.verbType}
                  </label>
                  <select
                    value={verbForm.type}
                    onChange={(e) => setVerbForm({ ...verbForm, type: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium bg-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="unregelmäßig">{ui.irregular}</option>
                    <option value="regelmäßig">{ui.regular}</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 block uppercase tracking-wider">
                    {ui.auxiliary}
                  </label>
                  <select
                    value={verbForm.auxiliary}
                    onChange={(e) => setVerbForm({ ...verbForm, auxiliary: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium bg-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="">-</option>
                    <option value="haben">haben</option>
                    <option value="sein">sein</option>
                    <option value="haben/sein">haben/sein</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 block uppercase tracking-wider">
                    {ui.prefix}
                  </label>
                  <input
                    type="text"
                    value={verbForm.prefix}
                    onChange={(e) => setVerbForm({ ...verbForm, prefix: e.target.value })}
                    placeholder="ab"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1 hidden">
                  <label className="text-xs font-bold text-gray-500 block uppercase tracking-wider">
                    {ui.source}
                  </label>
                  <input
                    type="text"
                    value={verbForm.dataSource}
                    onChange={(e) => setVerbForm({ ...verbForm, dataSource: e.target.value })}
                    placeholder="manual"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-blue-500"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs font-bold text-gray-600">
                  <input
                    type="checkbox"
                    checked={verbForm.separable}
                    onChange={(e) => setVerbForm({ ...verbForm, separable: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600"
                  />
                  {ui.separable}
                </label>

                <label className="flex items-center gap-2 text-xs font-bold text-gray-600">
                  <input
                    type="checkbox"
                    checked={verbForm.needsReview}
                    onChange={(e) => setVerbForm({ ...verbForm, needsReview: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600"
                  />
                  {ui.needsReview}
                </label>

                <label className="hidden items-center gap-2 text-xs font-bold text-gray-600">
                  <input
                    type="checkbox"
                    checked={verbForm.generated}
                    onChange={(e) => setVerbForm({ ...verbForm, generated: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600"
                  />
                  {ui.generated}
                </label>

                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-bold text-gray-500 block uppercase tracking-wider">
                    {ui.tags}
                  </label>
                  <input
                    type="text"
                    value={verbForm.tags}
                    onChange={(e) => setVerbForm({ ...verbForm, tags: e.target.value })}
                    placeholder="trennbar, unregelmäßig, B1/B2"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-slate-50">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 block uppercase tracking-wider">
                    {ui.germanExample}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    lang="de"
                    value={verbForm.example_de}
                    onChange={(e) => setVerbForm({ ...verbForm, example_de: e.target.value })}
                    placeholder={ui.germanExamplePlaceholder}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium text-left focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 block uppercase tracking-wider">
                    {ui.arabicExample}
                  </label>
                  <input
                    type="text"
                    dir="rtl"
                    value={verbForm.example_ar}
                    onChange={(e) => setVerbForm({ ...verbForm, example_ar: e.target.value })}
                    placeholder="أنا أقطع الحديث."
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-blue-500 font-arabic"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-bold text-gray-500 block uppercase tracking-wider">
                    {ui.notesAr}
                  </label>
                  <textarea
                    dir="rtl"
                    value={verbForm.notes_ar}
                    onChange={(e) => setVerbForm({ ...verbForm, notes_ar: e.target.value })}
                    className="w-full min-h-20 px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-blue-500 font-arabic"
                  />
                </div>
              </div>

              <details className="pt-4 border-t border-slate-50">
                <summary className="cursor-pointer text-xs font-extrabold uppercase tracking-wider text-slate-600">
                  {ui.technicalMeta}
                </summary>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 block uppercase tracking-wider">
                      {ui.source}
                    </label>
                    <input
                      type="text"
                      value={verbForm.dataSource}
                      onChange={(e) => setVerbForm({ ...verbForm, dataSource: e.target.value })}
                      placeholder="manual"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 block uppercase tracking-wider">
                      {ui.tensesSource}
                    </label>
                    <input
                      type="text"
                      value={verbForm.tensesSource}
                      onChange={(e) => setVerbForm({ ...verbForm, tensesSource: e.target.value })}
                      placeholder="manual"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs font-bold text-gray-600">
                    <input
                      type="checkbox"
                      checked={verbForm.generated}
                      onChange={(e) => setVerbForm({ ...verbForm, generated: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600"
                    />
                    {ui.generated}
                  </label>
                  <label className="flex items-center gap-2 text-xs font-bold text-gray-600">
                    <input
                      type="checkbox"
                      checked={verbForm.tensesNeedsReview}
                      onChange={(e) => setVerbForm({ ...verbForm, tensesNeedsReview: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600"
                    />
                    {ui.tensesNeedsReview}
                  </label>
                  <label className="flex items-center gap-2 text-xs font-bold text-gray-600">
                    <input
                      type="checkbox"
                      checked={verbForm.tensesGenerated}
                      onChange={(e) => setVerbForm({ ...verbForm, tensesGenerated: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600"
                    />
                    {ui.tensesGenerated}
                  </label>
                </div>
              </details>

              <div className="pt-4 border-t border-slate-50 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                    {ui.tenseGrid}
                  </h4>
                  {!verbForm.tenses && (
                    <button
                      type="button"
                      onClick={handleCreateTenseTable}
                      className="inline-flex items-center justify-center px-4 py-2 border border-blue-100 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
                    >
                      {ui.createTenseTable}
                    </button>
                  )}
                </div>

                {verbForm.tenses && (
                  <div className="overflow-x-auto border border-slate-100 rounded-xl">
                    <table className={`w-full min-w-[900px] text-xs ${isRtl ? "text-right" : "text-left"}`}>
                      <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider">
                        <tr>
                          <th className="p-2 font-bold">{ui.pronoun}</th>
                          {TENSE_COLUMNS.map((tense) => (
                            <th key={tense.key} className="p-2 font-bold">
                              {tense.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {PRONOUN_ROWS.map((pronoun) => (
                          <tr key={pronoun.key}>
                            <td className="p-2 font-bold text-slate-600 bg-slate-50/50">{pronoun.label}</td>
                            {TENSE_COLUMNS.map((tense) => (
                              <td key={tense.key} className="p-1.5">
                                <input
                                  type="text"
                                  dir="ltr"
                                  lang="de"
                                  value={verbForm.tenses?.[tense.key]?.[pronoun.key] || ""}
                                  onChange={(e) => handleTenseCellChange(tense.key, pronoun.key, e.target.value)}
                                  className="w-full px-2 py-1.5 border border-slate-200 rounded-md text-[11px] font-medium text-left focus:outline-none focus:border-blue-500"
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {(verbForm.tenses || verbForm.tenseExamples) && (
                  <div className="space-y-3 pt-3">
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                      {ui.tenseExamples}
                    </h4>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      {TENSE_COLUMNS.map((tense) => (
                        <div key={tense.key} className="border border-slate-100 rounded-xl p-3 space-y-2">
                          <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                            {tense.label}
                          </div>
                          <input
                            type="text"
                            dir="ltr"
                            lang="de"
                            value={verbForm.tenseExamples?.[tense.key]?.de || ""}
                            onChange={(e) => handleTenseExampleChange(tense.key, "de", e.target.value)}
                            placeholder={ui.germanExamplePlaceholder}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium text-left focus:outline-none focus:border-blue-500"
                          />
                          <input
                            type="text"
                            dir="rtl"
                            lang="ar"
                            value={verbForm.tenseExamples?.[tense.key]?.ar || ""}
                            onChange={(e) => handleTenseExampleChange(tense.key, "ar", e.target.value)}
                            placeholder={ui.arabicExample}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium text-right focus:outline-none focus:border-blue-500 font-arabic"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className={`flex justify-end space-x-3 pt-4 ${isRtl ? "space-x-reverse" : ""}`}>
                <button
                  type="button"
                  onClick={() => {
                    setShowVerbForm(false);
                    setEditingVerb(null);
                    clearVerbForm();
                  }}
                  className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
                >
                  {ui.cancel}
                </button>
                <button
                  type="button"
                  onClick={clearVerbForm}
                  className="px-4 py-2 border border-slate-100 bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
                >
                  {ui.clear}
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold uppercase tracking-wider rounded-lg shadow transition-colors cursor-pointer"
                >
                  {ui.save}
                </button>
              </div>
            </form>
          )}

          {/* Verbs List Grid */}
          {!showVerbForm && (
            <div className="bg-white rounded-xl border border-slate-100 overflow-hidden shadow-sm">
              {filteredVerbs.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-xs">
                  {ui.noVerbs}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className={`w-full border-collapse text-xs text-slate-700 ${isRtl ? "text-right" : "text-left"}`}>
                    <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="p-4">{ui.verbColumn}</th>
                        <th className="p-4">{ui.meaning}</th>
                        <th className="p-4">{ui.forms}</th>
                        <th className="p-4 text-center">{ui.entryType}</th>
                        <th className="p-4 text-right">{ui.actions}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {filteredVerbs.map((v) => (
                        <tr key={v.id} className="hover:bg-slate-50/50">
                          <td className="p-4">
                            <div dir="ltr" lang="de" className="font-bold text-slate-900 text-left">{v.infinitiv}</div>
                            <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-slate-500">
                              {v.level && <span className="bg-slate-100 px-1.5 py-0.5 rounded">{v.level}</span>}
                              {v.type && <span className="bg-slate-100 px-1.5 py-0.5 rounded">{v.type}</span>}
                              {v.auxiliary && <span className="bg-slate-100 px-1.5 py-0.5 rounded">{v.auxiliary}</span>}
                              {v.prefix && <span className="bg-slate-100 px-1.5 py-0.5 rounded">{v.prefix}</span>}
                              <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                                {v.separable ? ui.separable : ui.notSeparable}
                              </span>
                              {v.dataMeta?.needsReview && <span className="bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">{ui.needsReview}</span>}
                            </div>
                          </td>
                          <td dir="rtl" className="p-4 font-arabic text-blue-600 text-sm text-right">
                            {v.arabic}
                          </td>
                          <td className="p-4 text-slate-500 space-y-0.5">
                            <div>{ui.praesens}: <span dir="ltr" lang="de" className="font-semibold text-slate-700">{v.praesens || "-"}</span></div>
                            <div>{ui.praeteritum}: <span dir="ltr" lang="de" className="font-semibold text-slate-700">{v.praeteritum || "-"}</span></div>
                            <div>{ui.perfekt}: <span dir="ltr" lang="de" className="font-semibold text-slate-700">{v.perfekt || "-"}</span></div>
                          </td>
                          <td className="p-4 text-center">
                            {v.isCustom ? (
                              <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold">
                                {ui.custom}
                              </span>
                            ) : (
                              <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold">
                                {ui.standard}
                              </span>
                            )}
                          </td>
                          <td className={`p-4 text-right space-x-1.5 whitespace-nowrap ${isRtl ? "space-x-reverse" : ""}`}>
                            <button
                              onClick={() => handleDuplicateVerb(v)}
                              title={ui.copyEdit}
                              className="p-1.5 text-gray-500 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                            >
                              <Copy size={14} />
                            </button>
                            <button
                              onClick={() => handleEditVerb(v)}
                              title={ui.edit}
                              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteVerb(v)}
                              disabled={!v.isCustom}
                              title={v.isCustom ? ui.delete : ui.defaultDeleteBlocked}
                              className={`p-1.5 rounded transition-colors ${
                                v.isCustom
                                  ? "text-gray-500 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                  : "text-gray-300 cursor-not-allowed"
                              }`}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* VOCAB TAB */}
      {isVocabTab && (
        <div className="space-y-6">
          {!showVocabForm && (
            <div className="flex flex-col sm:flex-row gap-3 justify-between items-center bg-slate-50 p-4 rounded-xl">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                <input
                  type="text"
                  placeholder={ui.searchVocab}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-xs font-medium bg-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex w-full sm:w-auto items-center justify-between sm:justify-end gap-3">
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium bg-white focus:outline-none"
                >
                  <option value="all">{ui.allTypes}</option>
                  <option value="Nomen">{ui.noun}</option>
                  <option value="Verb">{ui.verbWord}</option>
                  <option value="Adjektiv">{ui.adjective}</option>
                  <option value="Phrase">{ui.phrase}</option>
                </select>

                <select
                  value={dataFilter}
                  onChange={(e) => setDataFilter(e.target.value)}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium bg-white focus:outline-none"
                  aria-label={ui.dataFilter}
                >
                  <option value="all">{ui.allData}</option>
                  <option value="needsReview">{ui.needsReviewFilter}</option>
                  <option value="reviewed">{ui.reviewedFilter}</option>
                  <option value="hasExamples">{ui.hasExamplesFilter}</option>
                  <option value="hasArticle">{ui.hasArticleFilter}</option>
                  <option value="hasPlural">{ui.hasPluralFilter}</option>
                </select>

                <button
                  onClick={() => {
                    clearVocabForm();
                    setEditingVocab(null);
                    setShowVocabForm(true);
                  }}
                  className="inline-flex items-center justify-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider rounded-lg shadow transition-colors cursor-pointer"
                >
                  <Plus className={isRtl ? "ml-1.5" : "mr-1.5"} size={14} /> {ui.addWord}
                </button>
              </div>
            </div>
          )}

          {/* Add / Edit Vocab Form */}
          {showVocabForm && (
            <form
              onSubmit={handleSaveVocab}
              className="bg-white rounded-2xl border border-slate-100 p-6 sm:p-8 space-y-6 shadow-md"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-50 pb-3">
                <h3 className="font-extrabold text-slate-800 text-lg">
                  {editingVocab ? `${ui.editVocab}: "${editingVocab.term}"` : ui.newVocab}
                </h3>
                <div className={`flex flex-wrap gap-2 ${isRtl ? "sm:justify-end" : "sm:justify-start"}`}>
                  <button
                    type="button"
                    onClick={handleAutoDetectVocab}
                    className="px-3 py-2 border border-indigo-100 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
                  >
                    {ui.autoDetect}
                  </button>
                  <button
                    type="button"
                    onClick={handleMarkVocabReviewed}
                    className="px-3 py-2 border border-emerald-100 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
                  >
                    {ui.markReviewed}
                  </button>
                  <button
                    type="button"
                    onClick={handleExportUpdatedVocabularyJson}
                    className="px-3 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
                  >
                    {ui.exportUpdatedVocabJson}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 block uppercase tracking-wider">
                    {ui.germanTerm}
                  </label>
                  <input
                    type="text"
                    required
                    dir="ltr"
                    lang="de"
                    value={vocabForm.term}
                    onChange={(e) => setVocabForm({ ...vocabForm, term: e.target.value })}
                    placeholder={ui.termPlaceholder}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium text-left focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 block uppercase tracking-wider">
                    {ui.arabicMeaning}
                  </label>
                  <input
                    type="text"
                    required
                    dir="rtl"
                    value={vocabForm.arabic}
                    onChange={(e) => setVocabForm({ ...vocabForm, arabic: e.target.value })}
                    placeholder="المكيّف / جهاز التكييف"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-indigo-500 font-arabic"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 block uppercase tracking-wider">
                    {ui.wordType}
                  </label>
                  <select
                    value={vocabForm.type}
                    onChange={(e) => setVocabForm({ ...vocabForm, type: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium bg-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Nomen">{ui.noun}</option>
                    <option value="Verb">{ui.verbWord}</option>
                    <option value="Adjektiv">{ui.adjective}</option>
                    <option value="Phrase">{ui.phrase}</option>
                    <option value="Andere">{ui.other}</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 block uppercase tracking-wider">
                    {ui.chapter}
                  </label>
                  <input
                    type="number"
                    value={vocabForm.chapter}
                    onChange={(e) => setVocabForm({ ...vocabForm, chapter: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 block uppercase tracking-wider">
                    {ui.chapterTitle}
                  </label>
                  <input
                    type="text"
                    value={vocabForm.chapterTitle}
                    onChange={(e) => setVocabForm({ ...vocabForm, chapterTitle: e.target.value })}
                    placeholder={ui.chapterTitlePlaceholder}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 block uppercase tracking-wider">
                    {ui.section}
                  </label>
                  <input
                    type="text"
                    value={vocabForm.section}
                    onChange={(e) => setVocabForm({ ...vocabForm, section: e.target.value })}
                    placeholder={ui.sectionPlaceholder}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 block uppercase tracking-wider">
                    {ui.level}
                  </label>
                  <select
                    value={vocabForm.level}
                    onChange={(e) => setVocabForm({ ...vocabForm, level: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium bg-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="B1">B1</option>
                    <option value="B2">B2</option>
                    <option value="B1/B2">B1/B2</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 block uppercase tracking-wider">
                    {ui.cleanTerm}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    lang="de"
                    value={vocabForm.cleanTerm}
                    onChange={(e) => setVocabForm({ ...vocabForm, cleanTerm: e.target.value })}
                    placeholder="Klimaanlage"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium text-left focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 block uppercase tracking-wider">
                    {ui.article}
                  </label>
                  <select
                    value={vocabForm.article}
                    onChange={(e) => setVocabForm({ ...vocabForm, article: e.target.value, gender: detectGender(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium bg-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">-</option>
                    <option value="der">der</option>
                    <option value="die">die</option>
                    <option value="das">das</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 block uppercase tracking-wider">
                    {ui.gender}
                  </label>
                  <select
                    value={vocabForm.gender}
                    onChange={(e) => setVocabForm({ ...vocabForm, gender: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium bg-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">-</option>
                    <option value="maskulin">maskulin</option>
                    <option value="feminin">feminin</option>
                    <option value="neutral">neutral</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 block uppercase tracking-wider">
                    {ui.plural}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    lang="de"
                    value={vocabForm.plural}
                    onChange={(e) => setVocabForm({ ...vocabForm, plural: e.target.value })}
                    placeholder="-n"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium text-left focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1 hidden">
                  <label className="text-xs font-bold text-gray-500 block uppercase tracking-wider">
                    {ui.source}
                  </label>
                  <input
                    type="text"
                    value={vocabForm.dataSource}
                    onChange={(e) => setVocabForm({ ...vocabForm, dataSource: e.target.value })}
                    placeholder="manual"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs font-bold text-gray-600">
                  <input
                    type="checkbox"
                    checked={vocabForm.needsReview}
                    onChange={(e) => setVocabForm({ ...vocabForm, needsReview: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                  />
                  {ui.needsReview}
                </label>

                <label className="hidden items-center gap-2 text-xs font-bold text-gray-600">
                  <input
                    type="checkbox"
                    checked={vocabForm.generated}
                    onChange={(e) => setVocabForm({ ...vocabForm, generated: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                  />
                  {ui.generated}
                </label>

                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-bold text-gray-500 block uppercase tracking-wider">
                    {ui.synonyms}
                  </label>
                  <input
                    type="text"
                    value={vocabForm.synonyms}
                    onChange={(e) => setVocabForm({ ...vocabForm, synonyms: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-bold text-gray-500 block uppercase tracking-wider">
                    {ui.tags}
                  </label>
                  <input
                    type="text"
                    value={vocabForm.tags}
                    onChange={(e) => setVocabForm({ ...vocabForm, tags: e.target.value })}
                    placeholder="Nomen, B1/B2"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-slate-50">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 block uppercase tracking-wider">
                    {ui.germanExample}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    lang="de"
                    value={vocabForm.example_de}
                    onChange={(e) => setVocabForm({ ...vocabForm, example_de: e.target.value })}
                    placeholder={ui.vocabGermanExamplePlaceholder}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium text-left focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 block uppercase tracking-wider">
                    {ui.arabicExample}
                  </label>
                  <input
                    type="text"
                    dir="rtl"
                    value={vocabForm.example_ar}
                    onChange={(e) => setVocabForm({ ...vocabForm, example_ar: e.target.value })}
                    placeholder="من فضلك أعط مثالاً."
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-indigo-500 font-arabic"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-bold text-gray-500 block uppercase tracking-wider">
                    {ui.notesAr}
                  </label>
                  <textarea
                    dir="rtl"
                    value={vocabForm.notes_ar}
                    onChange={(e) => setVocabForm({ ...vocabForm, notes_ar: e.target.value })}
                    className="w-full min-h-20 px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-indigo-500 font-arabic"
                  />
                </div>
              </div>

              <details className="pt-4 border-t border-slate-50">
                <summary className="cursor-pointer text-xs font-extrabold uppercase tracking-wider text-slate-600">
                  {ui.technicalMeta}
                </summary>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 block uppercase tracking-wider">
                      {ui.source}
                    </label>
                    <input
                      type="text"
                      value={vocabForm.dataSource}
                      onChange={(e) => setVocabForm({ ...vocabForm, dataSource: e.target.value })}
                      placeholder="manual"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs font-bold text-gray-600">
                    <input
                      type="checkbox"
                      checked={vocabForm.generated}
                      onChange={(e) => setVocabForm({ ...vocabForm, generated: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                    />
                    {ui.generated}
                  </label>
                </div>
              </details>

              <div className={`flex justify-end space-x-3 pt-4 ${isRtl ? "space-x-reverse" : ""}`}>
                <button
                  type="button"
                  onClick={() => {
                    setShowVocabForm(false);
                    setEditingVocab(null);
                    clearVocabForm();
                  }}
                  className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
                >
                  {ui.cancel}
                </button>
                <button
                  type="button"
                  onClick={clearVocabForm}
                  className="px-4 py-2 border border-slate-100 bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
                >
                  {ui.clear}
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold uppercase tracking-wider rounded-lg shadow transition-colors cursor-pointer"
                >
                  {ui.save}
                </button>
              </div>
            </form>
          )}

          {/* Vocab List */}
          {!showVocabForm && (
            <div className="bg-white rounded-xl border border-slate-100 overflow-hidden shadow-sm">
              {filteredVocab.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-xs">
                  {ui.noVocab}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className={`w-full border-collapse text-xs text-slate-700 ${isRtl ? "text-right" : "text-left"}`}>
                    <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="p-4">{ui.term}</th>
                        <th className="p-4">{ui.meaning}</th>
                        <th className="p-4">{ui.chapterType}</th>
                        <th className="p-4 text-center">{ui.entryType}</th>
                        <th className="p-4 text-right">{ui.actions}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {filteredVocab.map((v) => (
                        <tr key={v.id} className="hover:bg-slate-50/50">
                          <td className="p-4">
                            <div dir="ltr" lang="de" className="font-bold text-slate-900 text-left">{getManageVocabTerm(v)}</div>
                            <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-slate-500">
                              {v.article && <span className="bg-slate-100 px-1.5 py-0.5 rounded">{v.article}</span>}
                              {v.gender && <span className="bg-slate-100 px-1.5 py-0.5 rounded">{v.gender}</span>}
                              {(v.plural || v.pluralTerm) && <span className="bg-slate-100 px-1.5 py-0.5 rounded">{v.plural || v.pluralTerm}</span>}
                              {v.cleanTerm && <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">{v.cleanTerm}</span>}
                              {getVocabularyNeedsReview(v) && <span className="bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">{ui.needsReview}</span>}
                            </div>
                          </td>
                          <td dir="rtl" className="p-4 font-arabic text-indigo-600 text-sm text-right">
                            {v.arabic}
                          </td>
                          <td className="p-4 text-slate-500 space-y-0.5">
                            <div>
                              {ui.typePrefix}: <span className="font-bold text-slate-700">{getWordTypeLabel(getVocabularyTypeLabel(v))}</span>
                            </div>
                            {(v.chapter || v.section) && (
                              <div className="text-[10px] text-gray-400">
                                {ui.chapterPrefix} {v.chapter || "-"} • {v.section || "-"}
                              </div>
                            )}
                          </td>
                          <td className="p-4 text-center">
                            {v.isCustom ? (
                              <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold">
                                {ui.custom}
                              </span>
                            ) : (
                              <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold">
                                {ui.standard}
                              </span>
                            )}
                          </td>
                          <td className={`p-4 text-right space-x-1.5 whitespace-nowrap ${isRtl ? "space-x-reverse" : ""}`}>
                            <button
                              onClick={() => handleDuplicateVocab(v)}
                              title={ui.copyEdit}
                              className="p-1.5 text-gray-500 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                            >
                              <Copy size={14} />
                            </button>
                            <button
                              onClick={() => handleEditVocab(v)}
                              title={ui.edit}
                              className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors cursor-pointer"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteVocab(v)}
                              disabled={!v.isCustom}
                              title={v.isCustom ? ui.delete : ui.defaultDeleteBlocked}
                              className={`p-1.5 rounded transition-colors ${
                                v.isCustom
                                  ? "text-gray-500 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                  : "text-gray-300 cursor-not-allowed"
                              }`}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* IMPORT / EXPORT TAB */}
      {activeTab === "import_export" && (
        <div className="space-y-6">
          {/* Feedback message */}
          {feedback && (
            <div
              className={`p-4 rounded-xl flex items-start space-x-3 border ${
                feedback.success
                  ? "bg-emerald-50 border-emerald-100 text-emerald-800"
                  : "bg-rose-50 border-rose-100 text-rose-800"
              }`}
            >
              {feedback.success ? (
                <CheckCircle className="text-emerald-600 shrink-0" size={18} />
              ) : (
                <AlertCircle className="text-rose-600 shrink-0" size={18} />
              )}
              <div className="flex-1 text-xs font-semibold">{feedback.message}</div>
              <button onClick={() => setFeedback(null)} className="text-gray-400 hover:text-slate-700">
                <X size={14} />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Export Board */}
            <div className="bg-white rounded-2xl border border-slate-100 p-6 sm:p-8 space-y-6 shadow-sm">
              <h3 className="font-extrabold text-slate-800 text-base flex items-center">
                <Download className={isRtl ? "ml-2 text-blue-600" : "mr-2 text-blue-600"} size={18} /> {ui.exportTitle}
              </h3>
              <p className="text-xs text-gray-500">
                {ui.exportDesc}
              </p>

              <div className="space-y-3 pt-2">
                <button
                  onClick={handleExportUpdatedVerbsJson}
                  className="w-full inline-flex items-center justify-between p-3 bg-blue-50/50 hover:bg-blue-50 text-blue-900 border border-blue-100 rounded-xl text-left text-xs font-bold transition-colors cursor-pointer"
                >
                  <span>{ui.exportUpdatedVerbsJson}</span>
                  <Download size={14} />
                </button>
                <button
                  onClick={handleExportUpdatedVocabularyJson}
                  className="w-full inline-flex items-center justify-between p-3 bg-indigo-50/50 hover:bg-indigo-50 text-indigo-900 border border-indigo-100 rounded-xl text-left text-xs font-bold transition-colors cursor-pointer"
                >
                  <span>{ui.exportUpdatedVocabJson}</span>
                  <Download size={14} />
                </button>
                <button
                  onClick={handleExportCustomVerbs}
                  className="w-full inline-flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-xl text-left text-xs font-bold text-slate-700 transition-colors cursor-pointer"
                >
                  <span>{ui.exportCustomVerbs}</span>
                  <Download size={14} />
                </button>
                <button
                  onClick={handleExportCustomVocab}
                  className="w-full inline-flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-xl text-left text-xs font-bold text-slate-700 transition-colors cursor-pointer"
                >
                  <span>{ui.exportCustomVocab}</span>
                  <Download size={14} />
                </button>
                <button
                  onClick={handleExportMergedVerbs}
                  className="w-full inline-flex items-center justify-between p-3 bg-blue-50/50 hover:bg-blue-50 text-blue-900 border border-blue-100 rounded-xl text-left text-xs font-bold transition-colors cursor-pointer"
                >
                  <span>{ui.exportAllVerbs}</span>
                  <Download size={14} />
                </button>
                <button
                  onClick={handleExportMergedVocab}
                  className="w-full inline-flex items-center justify-between p-3 bg-indigo-50/50 hover:bg-indigo-50 text-indigo-900 border border-indigo-100 rounded-xl text-left text-xs font-bold transition-colors cursor-pointer"
                >
                  <span>{ui.exportAllVocab}</span>
                  <Download size={14} />
                </button>
                <button
                  onClick={handleExportBackup}
                  className="w-full inline-flex items-center justify-between p-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-left text-xs font-bold transition-colors cursor-pointer"
                >
                  <span>{ui.exportBackup}</span>
                  <Download size={14} />
                </button>
              </div>
            </div>

            {/* Import Board */}
            <div className="bg-white rounded-2xl border border-slate-100 p-6 sm:p-8 space-y-6 shadow-sm">
              <h3 className="font-extrabold text-slate-800 text-base flex items-center">
                <Upload className={isRtl ? "ml-2 text-emerald-600" : "mr-2 text-emerald-600"} size={18} /> {ui.importTitle}
              </h3>
              <p className="text-xs text-gray-500">
                {ui.importDesc}
              </p>

              <div className="space-y-4 pt-2">
                {/* Verbs Import */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    {ui.importVerbs}
                  </span>
                  <label className="relative inline-flex items-center justify-center w-full px-4 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 border-dashed rounded-xl cursor-pointer text-xs font-semibold text-slate-700 transition-colors">
                    <Upload className={isRtl ? "ml-2 text-slate-500" : "mr-2 text-slate-500"} size={14} /> {ui.chooseFile}
                    <input
                      type="file"
                      accept=".json"
                      onChange={(e) => handleImportFile(e, "verbs")}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Vocabulary Import */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    {ui.importVocab}
                  </span>
                  <label className="relative inline-flex items-center justify-center w-full px-4 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 border-dashed rounded-xl cursor-pointer text-xs font-semibold text-slate-700 transition-colors">
                    <Upload className={isRtl ? "ml-2 text-slate-500" : "mr-2 text-slate-500"} size={14} /> {ui.chooseFile}
                    <input
                      type="file"
                      accept=".json"
                      onChange={(e) => handleImportFile(e, "vocab")}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Full Backup Import */}
                <div className="space-y-1.5 pt-2 border-t border-slate-50">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    {ui.importBackup}
                  </span>
                  <label className="relative inline-flex items-center justify-center w-full px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100/80 text-emerald-950 border border-emerald-250 border-dashed rounded-xl cursor-pointer text-xs font-semibold transition-colors">
                    <Upload className={isRtl ? "ml-2 text-emerald-700" : "mr-2 text-emerald-700"} size={14} /> {ui.chooseBackup}
                    <input
                      type="file"
                      accept=".json"
                      onChange={(e) => handleImportFile(e, "backup")}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
