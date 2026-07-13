import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  Edit3,
  Play,
  RefreshCw,
  RotateCw,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import AudioButton from "../components/AudioButton";
import { DataService } from "../services/dataService";
import {
  addItemToFavorites,
  createDailyStudySet,
  DailyStudyContentType,
  DailyStudyQuestionSnapshot,
  DailyStudySelectionType,
  DailyStudySet as DailyStudySetModel,
  deleteDailyStudySet,
  getDailyStudySet,
  getFavoriteItemIds,
  getWrongItemIds,
  isDailyStudySetFromPreviousDay,
  keepCurrentSetForToday,
  reconcileDailyStudySetItems,
  recordDailyStudyAnswer,
  removeItemFromFavorites,
  selectDailyStudyItemIds,
  saveDailyStudyQuestion,
  startDailyStudyRound,
  updateDailyStudySet,
} from "../services/dailyStudySetService";
import { ProgressService } from "../services/progressService";
import {
  generateVerbChoiceOptions,
  getMatchingVerbExample,
  getVerbChoiceCorrectAnswer,
  VerbChoiceQuestionType,
} from "../services/verbChoiceService";
import {
  ensureCorrectOption,
  hasCorrectOptionExactlyOnce,
  normalizeChoiceOption,
} from "../services/choiceOptionService";
import {
  getVocabularyFullTerm,
  getVocabularyMeaningQuestion,
  VocabularyTrainingQuestion,
} from "../services/vocabularyTrainingService";
import { UserSettings, Verb, Vocabulary } from "../types";

type PageView = "overview" | "editor" | "items" | "training" | "finished";
type StudyItem = Verb | Vocabulary;

interface DailyStudySetProps {
  onNavigate: (page: string, params?: any) => void;
  settings: UserSettings;
  action?: "create" | "continue" | "restart" | "edit" | "view";
}

interface DailyQuestion {
  promptDe: string;
  promptAr: string;
  answer: string;
  answerLang: "de" | "ar";
  options: string[];
  exampleDe?: string;
  exampleAr?: string;
  kind: string;
}

function itemLabel(item: StudyItem, type: DailyStudyContentType): string {
  return type === "verbs" ? (item as Verb).infinitiv : getVocabularyFullTerm(item as Vocabulary);
}

function itemArabic(item: StudyItem): string {
  return item.arabic || "";
}

function itemKey(type: DailyStudyContentType, id: string | number): string {
  return `${type === "verbs" ? "verb" : "vocab"}-${id}`;
}

function formatDate(value: string, locale: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}

function stableQuestionOptions(options: string[], fallbackOptions: string[], answer: string): string[] | null {
  const cleanOptions = options.map((option) => option.trim()).filter(Boolean);
  const normalized = cleanOptions.map(normalizeChoiceOption);
  const hasDuplicates = normalized.some((option, index) => normalized.indexOf(option) !== index);
  if (!hasDuplicates && hasCorrectOptionExactlyOnce(cleanOptions, answer)) return cleanOptions;
  return ensureCorrectOption([...cleanOptions, ...fallbackOptions], answer, 4);
}

function isVerbQuestionType(value?: string): value is VerbChoiceQuestionType {
  return value === "arabic" || value === "praesens" || value === "praeteritum" || value === "perfekt";
}

function questionFromSnapshot(snapshot?: DailyStudyQuestionSnapshot): DailyQuestion | null {
  if (
    !snapshot?.promptDe ||
    !snapshot.promptAr ||
    !snapshot.answer ||
    !snapshot.answerLang ||
    !Array.isArray(snapshot.options) ||
    !snapshot.options.length
  ) {
    return null;
  }
  const options = stableQuestionOptions(snapshot.options, [], snapshot.answer);
  if (!options) return null;
  return {
    promptDe: snapshot.promptDe,
    promptAr: snapshot.promptAr,
    answer: snapshot.answer,
    answerLang: snapshot.answerLang,
    options,
    exampleDe: snapshot.exampleDe,
    exampleAr: snapshot.exampleAr,
    kind: snapshot.questionType,
  };
}

export default function DailyStudySet({ onNavigate, settings, action = "view" }: DailyStudySetProps) {
  const isRtl = settings.language === "ar";
  const [view, setView] = useState<PageView>(action === "create" ? "editor" : "overview");
  const [sets, setSet] = useState<DailyStudySetModel | null>(() => getDailyStudySet());
  const [verbs, setVerbs] = useState<Verb[]>([]);
  const [nouns, setNouns] = useState<Vocabulary[]>([]);
  const [adjectives, setAdjectives] = useState<Vocabulary[]>([]);
  const [loading, setLoading] = useState(true);
  const [contentType, setContentType] = useState<DailyStudyContentType>(sets?.contentType || "verbs");
  const [selectionType, setSelectionType] = useState<DailyStudySelectionType>(sets?.selectionType || "random");
  const [count, setCount] = useState(sets?.count || 20);
  const [shuffleItems, setShuffleItems] = useState(sets?.shuffleItems ?? true);
  const [selectedIds, setSelectedIds] = useState<string[]>(sets?.itemIds || []);
  const [search, setSearch] = useState("");
  const [editorError, setEditorError] = useState("");
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [answeredId, setAnsweredId] = useState<string | null>(null);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);

  const ui = isRtl
    ? {
        title: "مجموعة اليوم",
        dashboard: "لوحة التحكم",
        noSet: "لا توجد مجموعة حالية.",
        noSetDesc: "أنشئ مجموعة ثابتة لتكرار نفس المفردات يوميًا.",
        create: "إنشاء مجموعة",
        continue: "متابعة التدريب",
        startSame: "ابدأ جولة جديدة بنفس المجموعة",
        restart: "إعادة المجموعة",
        edit: "تعديل",
        viewItems: "عرض العناصر",
        delete: "حذف المجموعة",
        cancel: "إلغاء",
        save: "حفظ المجموعة",
        contentType: "نوع المحتوى",
        itemCount: "عدد العناصر",
        selectionType: "طريقة الاختيار",
        order: "ترتيب العناصر",
        shuffled: "ترتيب عشوائي داخل المجموعة",
        verbs: "أفعال",
        nouns: "أسماء",
        adjectives: "صفات",
        random: "عشوائي",
        new: "جديد",
        mistakes: "أخطاء",
        due: "مستحق",
        manual: "يدوي",
        search: "ابحث عن عنصر...",
        selected: "العناصر المختارة",
        progress: "التقدم",
        rounds: "الجولات المكتملة",
        correct: "الصحيح",
        wrong: "الخطأ",
        created: "تاريخ الإنشاء",
        check: "تحقق من الإجابة",
        next: "التالي",
        answer: "الإجابة الصحيحة",
        example: "مثال",
        roundDone: "اكتملت الجولة",
        repeatWrong: "إعادة العناصر الخاطئة فقط",
        backHome: "العودة للصفحة الرئيسية",
        empty: "لا توجد عناصر صالحة في هذه المجموعة. أنشئ مجموعة جديدة.",
        expired: "انتهى يوم المجموعة الحالية، ماذا تريد؟",
        keep: "الاحتفاظ بنفس المجموعة",
        replace: "إنشاء مجموعة جديدة",
        add: "إضافة كلمات للمجموعة الحالية",
        confirmDelete: "هل تريد حذف مجموعة اليوم؟",
        atLeastOne: "اختر عنصرًا واحدًا على الأقل.",
        notEnough: "لا توجد عناصر كافية لهذا الاختيار؛ تم استخدام العناصر المتاحة.",
        favorite: "إضافة إلى قائمتي",
      }
    : {
        title: "Daily Study Set",
        dashboard: "Dashboard",
        noSet: "No current set.",
        noSetDesc: "Create a fixed set and repeat the same items every day.",
        create: "Create set",
        continue: "Continue training",
        startSame: "Start a new round with this set",
        restart: "Restart set",
        edit: "Edit",
        viewItems: "View items",
        delete: "Delete set",
        cancel: "Cancel",
        save: "Save set",
        contentType: "Content type",
        itemCount: "Item count",
        selectionType: "Selection type",
        order: "Item order",
        shuffled: "Shuffle within the same set",
        verbs: "Verbs",
        nouns: "Nouns",
        adjectives: "Adjectives",
        random: "Random",
        new: "New",
        mistakes: "Mistakes",
        due: "Due",
        manual: "Manual",
        search: "Search items...",
        selected: "Selected items",
        progress: "Progress",
        rounds: "Completed rounds",
        correct: "Correct",
        wrong: "Wrong",
        created: "Created",
        check: "Check answer",
        next: "Next",
        answer: "Correct answer",
        example: "Example",
        roundDone: "Round completed",
        repeatWrong: "Repeat wrong items only",
        backHome: "Back to dashboard",
        empty: "No valid items remain in this set. Create a new set.",
        expired: "This set was created on an earlier day. What would you like to do?",
        keep: "Keep the same set",
        replace: "Create a new set",
        add: "Add items to this set",
        confirmDelete: "Delete this daily study set?",
        atLeastOne: "Select at least one item.",
        notEnough: "Not enough matching items; available items were used.",
        favorite: "Add to my list",
      };

  const pools = useMemo<Record<DailyStudyContentType, StudyItem[]>>(
    () => ({ verbs, nouns, adjectives }),
    [verbs, nouns, adjectives]
  );
  const availableItems = pools[contentType];
  const editingExisting = Boolean(sets && action !== "create");

  useEffect(() => {
    let mounted = true;
    Promise.all([DataService.getVerbs(), DataService.loadNouns(), DataService.loadAdjectives()]).then(
      ([verbItems, nounItems, adjectiveItems]) => {
        if (!mounted) return;
        setVerbs(verbItems);
        setNouns(nounItems);
        setAdjectives(adjectiveItems);
        const current = getDailyStudySet();
        if (current) {
          const pool = current.contentType === "verbs" ? verbItems : current.contentType === "nouns" ? nounItems : adjectiveItems;
          setSet(reconcileDailyStudySetItems(current.contentType, pool.map((item) => item.id)));
        }
        setLoading(false);
      }
    );
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    const current = getDailyStudySet();
    if (action === "restart" && current) {
      setSet(startDailyStudyRound(current.contentType));
      setView("training");
    } else if (action === "continue" && current) {
      if (!current.currentRound || current.currentRound.completed) setSet(startDailyStudyRound(current.contentType));
      setView("training");
    } else if (action === "edit" && current) {
      openEditor(current);
    }
    // The page remounts for each dashboard navigation action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  useEffect(() => {
    setFavorites(getFavoriteItemIds(contentType));
  }, [contentType, view]);

  const openEditor = (current?: DailyStudySetModel, forceManual = false) => {
    const source = current || sets;
    setContentType(source?.contentType || "verbs");
    setSelectionType(forceManual ? "manual" : source?.selectionType || "random");
    setCount(source?.count || 20);
    setShuffleItems(source?.shuffleItems ?? true);
    setSelectedIds(source?.itemIds || []);
    setEditorError("");
    setSearch("");
    setView("editor");
  };

  const saveEditor = () => {
    const availableIds = availableItems.map((item) => item.id);
    const preserveMembers =
      sets &&
      sets.contentType === contentType &&
      sets.selectionType === selectionType &&
      sets.count === count &&
      selectionType !== "manual";
    const itemIds = preserveMembers
      ? sets.itemIds
      : selectDailyStudyItemIds(contentType, selectionType, availableIds, count, selectedIds);
    if (!itemIds.length) {
      setEditorError(ui.atLeastOne);
      return;
    }
    const saved = editingExisting && sets
      ? updateDailyStudySet(sets.contentType, { contentType, selectionType, itemIds, shuffleItems })
      : createDailyStudySet({ contentType, selectionType, itemIds, shuffleItems });
    setSet(saved);
    setView("overview");
  };

  const startTraining = (restart = false) => {
    if (!sets) return;
    const next = restart || !sets.currentRound || sets.currentRound.completed
      ? startDailyStudyRound(sets.contentType)
      : sets;
    setSet(next);
    setChecked(false);
    setAnsweredId(null);
    setSelectedChoice(null);
    setView("training");
  };

  const filteredManualItems = availableItems.filter((item) => {
    const needle = search.trim().toLocaleLowerCase("de-DE");
    return !needle || `${itemLabel(item, contentType)} ${itemArabic(item)}`.toLocaleLowerCase("de-DE").includes(needle);
  });

  const round = sets?.currentRound;
  const activeId = checked && answeredId
    ? answeredId
    : round?.itemIds[round.currentIndex];
  const activeItem = activeId ? pools[sets?.contentType || "verbs"].find((item) => String(item.id) === activeId) : undefined;

  const question = useMemo<DailyQuestion | null>(() => {
    if (!sets || !round || !activeItem) return null;
    const savedQuestion = round.currentQuestion?.itemId === String(activeItem.id)
      ? round.currentQuestion
      : undefined;
    const restoredQuestion = questionFromSnapshot(savedQuestion);
    if (restoredQuestion) return restoredQuestion;
    if (sets.contentType === "verbs") {
      const verb = activeItem as Verb;
      const types: VerbChoiceQuestionType[] = ["arabic", "praeteritum", "perfekt", "praesens"];
      const generatedType = types[Math.abs(`${round.id}-${verb.id}`.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0)) % types.length];
      const type = isVerbQuestionType(savedQuestion?.questionType) ? savedQuestion.questionType : generatedType;
      const answer = getVerbChoiceCorrectAnswer(verb, type);
      const generatedOptions = generateVerbChoiceOptions(verb, verbs, type);
      const options = stableQuestionOptions(savedQuestion?.options || generatedOptions, generatedOptions, answer);
      if (!options) return null;
      const example = getMatchingVerbExample(verb, type);
      return {
        promptDe: verb.infinitiv,
        promptAr: type === "arabic" ? "ما معنى هذا الفعل؟" : `اختر صيغة ${type === "praeteritum" ? "Präteritum" : type === "perfekt" ? "Perfekt" : "Präsens"}.`,
        answer,
        answerLang: type === "arabic" ? "ar" : "de",
        options,
        exampleDe: example?.de,
        exampleAr: example?.ar,
        kind: type,
      };
    }
    const vocabQuestion: VocabularyTrainingQuestion = getVocabularyMeaningQuestion(
      activeItem as Vocabulary,
      pools[sets.contentType] as Vocabulary[]
    );
    const generatedOptions = vocabQuestion.options || [];
    const options = stableQuestionOptions(savedQuestion?.options || generatedOptions, generatedOptions, vocabQuestion.answer);
    if (!options) return null;
    return {
      promptDe: vocabQuestion.promptDe || itemLabel(activeItem, sets.contentType),
      promptAr: vocabQuestion.promptAr || "اختر المعنى العربي الصحيح.",
      answer: vocabQuestion.answer,
      answerLang: vocabQuestion.answerLang,
      options,
      exampleDe: vocabQuestion.exampleDe,
      exampleAr: vocabQuestion.exampleAr,
      kind: vocabQuestion.kind,
    };
  }, [activeItem, pools, round, sets, verbs]);

  useEffect(() => {
    if (!sets || !round || !activeItem || !question || checked) return;
    const savedQuestion = round.currentQuestion;
    const itemId = String(activeItem.id);
    if (
      savedQuestion?.itemId === itemId &&
      savedQuestion.questionType === question.kind &&
      savedQuestion.options.length === question.options.length &&
      savedQuestion.options.every((option, index) => option === question.options[index])
    ) {
      return;
    }
    const updated = saveDailyStudyQuestion(sets.contentType, {
      itemId,
      questionType: question.kind,
      options: question.options,
      promptDe: question.promptDe,
      promptAr: question.promptAr,
      answer: question.answer,
      answerLang: question.answerLang,
      exampleDe: question.exampleDe,
      exampleAr: question.exampleAr,
    });
    if (updated) setSet(updated);
  }, [activeItem, checked, question, round, sets]);

  const checkAnswer = () => {
    if (!sets || !activeItem || !question || !selectedChoice) return;
    const correct = selectedChoice.trim().toLocaleLowerCase("de-DE") === question.answer.trim().toLocaleLowerCase("de-DE");
    const key = itemKey(sets.contentType, activeItem.id);
    const progress = ProgressService.getProgressItem(key);
    setAnsweredId(String(activeItem.id));
    setLastCorrect(correct);
    setChecked(true);
    setSet(recordDailyStudyAnswer(sets.contentType, activeItem.id, correct, progress.mastered));
  };

  const nextQuestion = () => {
    if (sets?.currentRound?.completed) {
      setView("finished");
      return;
    }
    setChecked(false);
    setAnsweredId(null);
    setSelectedChoice(null);
  };

  const toggleFavorite = (id: string | number) => {
    const value = String(id);
    if (favorites.includes(value)) removeItemFromFavorites(contentType, value);
    else addItemToFavorites(contentType, value);
    setFavorites(getFavoriteItemIds(contentType));
  };

  if (loading) {
    return <div className="min-h-[50vh] flex items-center justify-center"><RefreshCw className="animate-spin text-blue-600" /></div>;
  }

  if (view === "editor") {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-6" dir={isRtl ? "rtl" : "ltr"}>
        <button onClick={() => sets ? setView("overview") : onNavigate("dashboard")} className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-900">
          <ArrowLeft className={isRtl ? "rotate-180" : ""} size={16} /> {ui.cancel}
        </button>
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 sm:p-7 space-y-6">
          <div><h1 className="text-xl font-black text-slate-900">{ui.title}</h1><p className="text-xs text-slate-500 mt-1">{sets ? ui.edit : ui.create}</p></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="space-y-2 text-xs font-bold text-slate-600"><span>{ui.contentType}</span><select value={contentType} onChange={(event) => { setContentType(event.target.value as DailyStudyContentType); setSelectedIds([]); }} className="w-full border border-slate-200 rounded-lg px-3 py-3 bg-white"><option value="verbs">{ui.verbs}</option><option value="nouns">{ui.nouns}</option><option value="adjectives">{ui.adjectives}</option></select></label>
            <label className="space-y-2 text-xs font-bold text-slate-600"><span>{ui.itemCount}</span><select value={count} onChange={(event) => setCount(Number(event.target.value))} className="w-full border border-slate-200 rounded-lg px-3 py-3 bg-white">{[10, 20, 30, 50].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="space-y-2 text-xs font-bold text-slate-600"><span>{ui.selectionType}</span><select value={selectionType} onChange={(event) => { const value = event.target.value as DailyStudySelectionType; setSelectionType(value); if (value === "manual" && sets?.contentType === contentType) setSelectedIds(sets.itemIds); }} className="w-full border border-slate-200 rounded-lg px-3 py-3 bg-white"><option value="random">{ui.random}</option><option value="new">{ui.new}</option><option value="mistakes">{ui.mistakes}</option><option value="due">{ui.due}</option><option value="manual">{ui.manual}</option></select></label>
          </div>
          <label className="flex items-center gap-3 text-sm font-bold text-slate-700"><input type="checkbox" checked={shuffleItems} onChange={(event) => setShuffleItems(event.target.checked)} className="h-4 w-4" /> {ui.shuffled}</label>
          {selectionType === "manual" && (
            <div className="space-y-3">
              <div className="relative"><Search className={`absolute top-3 text-slate-400 ${isRtl ? "right-3" : "left-3"}`} size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={ui.search} className={`w-full border border-slate-200 rounded-lg py-3 ${isRtl ? "pr-10 pl-3" : "pl-10 pr-3"}`} /></div>
              <p className="text-xs font-bold text-blue-600">{ui.selected}: {selectedIds.length}</p>
              <div className="border border-slate-200 rounded-lg max-h-80 overflow-y-auto divide-y divide-slate-100">
                {filteredManualItems.map((item) => { const id = String(item.id); return <label key={id} className="flex items-center gap-3 p-3 hover:bg-slate-50 cursor-pointer"><input type="checkbox" checked={selectedIds.includes(id)} onChange={() => setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])} /><span dir="ltr" lang="de" className="font-bold text-sm text-slate-900 text-left">{itemLabel(item, contentType)}</span><span dir="rtl" lang="ar" className="text-xs text-slate-500 mr-auto">{itemArabic(item)}</span></label>; })}
              </div>
            </div>
          )}
          {editorError && <p className="text-sm font-bold text-rose-600">{editorError}</p>}
          <div className="flex flex-col sm:flex-row gap-3 justify-end"><button onClick={() => sets ? setView("overview") : onNavigate("dashboard")} className="px-6 py-3 rounded-lg border border-slate-200 font-bold text-sm">{ui.cancel}</button><button onClick={saveEditor} className="px-6 py-3 rounded-lg bg-blue-600 text-white font-bold text-sm">{ui.save}</button></div>
        </div>
      </div>
    );
  }

  if (!sets) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6" dir={isRtl ? "rtl" : "ltr"}><div className="bg-white border border-slate-200 rounded-xl p-8 text-center shadow-sm space-y-4"><BookOpen className="mx-auto text-blue-600" size={34} /><h1 className="text-xl font-black">{ui.title}</h1><p className="text-sm font-bold text-slate-600">{ui.noSet}</p><p className="text-xs text-slate-500">{ui.noSetDesc}</p><button onClick={() => openEditor()} className="px-6 py-3 bg-blue-600 text-white rounded-lg font-bold">{ui.create}</button></div></div>
    );
  }

  if (view === "items") {
    const items = sets.itemIds.map((id) => pools[sets.contentType].find((item) => String(item.id) === id)).filter(Boolean) as StudyItem[];
    return <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-4" dir={isRtl ? "rtl" : "ltr"}><button onClick={() => setView("overview")} className="inline-flex items-center gap-2 text-xs font-bold text-slate-500"><ArrowLeft className={isRtl ? "rotate-180" : ""} size={16} /> {ui.title}</button><div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm"><div className="p-5 border-b border-slate-100"><h1 className="font-black">{ui.viewItems} ({items.length})</h1></div><div className="divide-y divide-slate-100">{items.map((item) => { const id = String(item.id); const result = sets.currentRound?.results[id]; return <div key={id} className="p-4 flex items-center gap-3"><button onClick={() => toggleFavorite(id)} title={ui.favorite} className={favorites.includes(id) ? "text-amber-500" : "text-slate-300 hover:text-amber-500"}><Star fill={favorites.includes(id) ? "currentColor" : "none"} size={18} /></button><div className="min-w-0 flex-1"><p dir="ltr" lang="de" className="font-black text-left">{itemLabel(item, sets.contentType)}</p><p dir="rtl" lang="ar" className="text-xs text-slate-500 text-right">{itemArabic(item)}</p></div><span className={`text-[10px] font-black px-2 py-1 rounded ${result?.correct ? "bg-emerald-50 text-emerald-700" : result ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-500"}`}>{result?.correct ? ui.correct : result ? ui.wrong : "-"}</span></div>; })}</div></div></div>;
  }

  if (view === "training" && (!round || !activeItem || !question)) {
    return <div className="max-w-3xl mx-auto px-4 text-center space-y-4"><p className="font-bold text-slate-600">{ui.empty}</p><button onClick={() => openEditor(sets)} className="px-5 py-3 bg-blue-600 text-white rounded-lg font-bold">{ui.edit}</button></div>;
  }

  if (view === "training" && round && activeItem && question) {
    const progressValue = Math.min(round.itemIds.length, round.currentIndex + (checked ? 0 : 1));
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 space-y-5" dir={isRtl ? "rtl" : "ltr"}>
        <div className="flex items-center justify-between"><button onClick={() => onNavigate("dashboard")} className="text-xs font-bold text-slate-500 inline-flex gap-2"><ArrowLeft className={isRtl ? "rotate-180" : ""} size={16} /> {ui.dashboard}</button><span className="text-xs font-black text-blue-600">{progressValue}/{round.itemIds.length}</span></div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-600" style={{ width: `${round.itemIds.length ? (round.currentIndex / round.itemIds.length) * 100 : 0}%` }} /></div>
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 sm:p-8 space-y-6">
          <div className="text-center space-y-3"><p className="text-xs font-black text-blue-600">{ui.title}</p><div className="flex items-center justify-center gap-2"><h1 dir="ltr" lang="de" className="text-3xl font-black text-slate-900">{question.promptDe}</h1><AudioButton text={question.promptDe} speed={settings.speechSpeed} size={18} /></div><p dir="rtl" lang="ar" className="text-sm font-bold text-slate-600">{question.promptAr}</p></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{question.options.map((option, originalIndex) => { const selected = selectedChoice === option; const correctOption = option === question.answer; let style = "border-slate-200 hover:bg-slate-50"; if (selected && !checked) style = "border-blue-500 bg-blue-50 text-blue-700"; if (checked && correctOption) style = "border-emerald-500 bg-emerald-50 text-emerald-800"; else if (checked && selected) style = "border-rose-500 bg-rose-50 text-rose-800"; return <button key={`${round.id}-${activeItem.id}-${originalIndex}-${option}`} disabled={checked} onClick={() => setSelectedChoice(option)} dir={question.answerLang === "ar" ? "rtl" : "ltr"} className={`min-h-14 p-4 rounded-lg border text-sm font-bold ${question.answerLang === "ar" ? "text-right" : "text-left"} ${style}`}>{option}{checked && correctOption && <Check className="inline-block mx-2" size={15} />}{checked && selected && !correctOption && <X className="inline-block mx-2" size={15} />}</button>; })}</div>
          {checked && <div className={`p-4 rounded-lg space-y-2 ${lastCorrect ? "bg-emerald-50" : "bg-rose-50"}`}><p className="text-xs font-black">{ui.answer}: <span dir={question.answerLang === "ar" ? "rtl" : "ltr"}>{question.answer}</span></p>{question.exampleDe && <p dir="ltr" lang="de" className="text-sm font-semibold text-left">{question.exampleDe}</p>}{question.exampleAr && <p dir="rtl" lang="ar" className="text-sm font-semibold text-right">{question.exampleAr}</p>}</div>}
        </div>
        <div className="flex justify-center">{!checked ? <button onClick={checkAnswer} disabled={!selectedChoice} className={`px-8 py-3 rounded-lg font-bold ${selectedChoice ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-400"}`}>{ui.check}</button> : <button onClick={nextQuestion} className="px-8 py-3 rounded-lg bg-blue-600 text-white font-bold inline-flex items-center gap-2">{ui.next}<ChevronRight className={isRtl ? "rotate-180" : ""} size={17} /></button>}</div>
      </div>
    );
  }

  if (view === "finished") {
    const wrongIds = getWrongItemIds(sets);
    return <div className="max-w-3xl mx-auto px-4 sm:px-6" dir={isRtl ? "rtl" : "ltr"}><div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm text-center space-y-5"><Check className="mx-auto text-emerald-600" size={38} /><h1 className="text-2xl font-black">{ui.roundDone}</h1><div className="flex justify-center gap-6 text-sm font-bold"><span className="text-emerald-700">{ui.correct}: {sets.currentRound?.correctCount || 0}</span><span className="text-rose-700">{ui.wrong}: {sets.currentRound?.wrongCount || 0}</span></div><div className="flex flex-col sm:flex-row justify-center gap-3"><button onClick={() => startTraining(true)} className="px-5 py-3 bg-blue-600 text-white rounded-lg font-bold">{ui.restart}</button>{wrongIds.length > 0 && <button onClick={() => { setSet(startDailyStudyRound(sets.contentType, { itemIds: wrongIds, temporary: true })); setChecked(false); setSelectedChoice(null); setView("training"); }} className="px-5 py-3 bg-rose-600 text-white rounded-lg font-bold">{ui.repeatWrong}</button>}<button onClick={() => onNavigate("dashboard")} className="px-5 py-3 border border-slate-200 rounded-lg font-bold">{ui.backHome}</button></div></div></div>;
  }

  const answered = Object.keys(sets.currentRound?.results || {}).length;
  const typeLabel = sets.contentType === "verbs" ? ui.verbs : sets.contentType === "nouns" ? ui.nouns : ui.adjectives;
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-5" dir={isRtl ? "rtl" : "ltr"}>
      {isDailyStudySetFromPreviousDay(sets) && <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3"><p className="text-sm font-black text-amber-900">{ui.expired}</p><div className="flex flex-wrap gap-2"><button onClick={() => setSet(keepCurrentSetForToday(sets.contentType))} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-xs font-bold">{ui.keep}</button><button onClick={() => { setSet(null); openEditor(); }} className="px-4 py-2 bg-white border border-amber-300 rounded-lg text-xs font-bold">{ui.replace}</button><button onClick={() => openEditor(sets, true)} className="px-4 py-2 bg-white border border-amber-300 rounded-lg text-xs font-bold">{ui.add}</button></div></div>}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4"><div><p className="text-xs font-black text-blue-600">{ui.title}</p><h1 className="text-2xl font-black text-slate-900 mt-1">{typeLabel}</h1><p className="text-sm font-bold text-slate-500 mt-1">{sets.count} {typeLabel}</p></div><BookOpen className="text-blue-600" size={30} /></div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4"><div><p className="text-[10px] font-bold text-slate-400">{ui.progress}</p><p className="text-xl font-black">{answered}/{sets.count}</p></div><div><p className="text-[10px] font-bold text-slate-400">{ui.rounds}</p><p className="text-xl font-black">{sets.completedRounds}</p></div><div><p className="text-[10px] font-bold text-slate-400">{ui.correct}</p><p className="text-xl font-black text-emerald-600">{sets.totalCorrect}</p></div><div><p className="text-[10px] font-bold text-slate-400">{ui.wrong}</p><p className="text-xl font-black text-rose-600">{sets.totalWrong}</p></div><div><p className="text-[10px] font-bold text-slate-400">{ui.created}</p><p className="text-xs font-black mt-1">{formatDate(sets.createdAt, isRtl ? "ar" : "de")}</p></div></div>
        <div className="flex flex-col sm:flex-row flex-wrap gap-3"><button onClick={() => startTraining(false)} className="px-5 py-3 bg-blue-600 text-white rounded-lg font-bold inline-flex items-center justify-center gap-2"><Play size={17} />{sets.currentRound && !sets.currentRound.completed ? ui.continue : ui.startSame}</button><button onClick={() => startTraining(true)} className="px-5 py-3 border border-slate-200 rounded-lg font-bold inline-flex items-center justify-center gap-2"><RotateCw size={17} />{ui.restart}</button><button onClick={() => openEditor(sets)} className="px-5 py-3 border border-slate-200 rounded-lg font-bold inline-flex items-center justify-center gap-2"><Edit3 size={17} />{ui.edit}</button><button onClick={() => setView("items")} className="px-5 py-3 border border-slate-200 rounded-lg font-bold">{ui.viewItems}</button><button onClick={() => { if (window.confirm(ui.confirmDelete)) { deleteDailyStudySet(sets.contentType); setSet(null); } }} className="px-5 py-3 text-rose-700 border border-rose-200 rounded-lg font-bold inline-flex items-center justify-center gap-2"><Trash2 size={17} />{ui.delete}</button></div>
      </div>
    </div>
  );
}
