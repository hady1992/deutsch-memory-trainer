import { useState, useEffect } from "react";
import {
  BookOpen,
  ArrowLeft,
  Check,
  X,
  HelpCircle,
  Play,
  RotateCw,
  Award,
  ChevronRight,
  Eye,
} from "lucide-react";
import { DataService } from "../services/dataService";
import { ProgressService } from "../services/progressService";
import { AudioService } from "../services/audioService";
import { MistakeReviewService } from "../services/mistakeReviewService";
import {
  detectAuxiliary,
  detectSeparable,
  detectVerbPrefix,
} from "../services/dataEnrichmentService.js";
import { answersMatch, getTenseExample, normalizeGermanText } from "../services/textDisplayService";
import {
  generateVerbChoiceOptions,
  getVerbChoiceCorrectAnswer,
  VerbChoiceQuestionType,
} from "../services/verbChoiceService";
import {
  buildVerbCategoryQuestion,
  hasVerbCategoryTraining,
  VerbCategoryQuestion,
} from "../services/verbCategoryTrainingService";
import { Verb, UserSettings, TenseKey, VerbCategory } from "../types";
import AudioButton from "../components/AudioButton";

interface VerbTrainerProps {
  onNavigate: (page: string) => void;
  settings: UserSettings;
}

type Mode = "select" | "flashcards" | "written" | "choice" | "category";

const TENSE_KEYS: TenseKey[] = [
  "praesens",
  "praeteritum",
  "perfekt",
  "plusquamperfekt",
  "futur1",
  "futur2",
];

const TENSE_LABELS: Record<TenseKey, string> = {
  praesens: "Prasens",
  praeteritum: "Prateritum",
  perfekt: "Perfekt",
  plusquamperfekt: "Plusquamperfekt",
  futur1: "Futur I",
  futur2: "Futur II",
};

function getChoiceExampleTense(questionType: VerbChoiceQuestionType): TenseKey {
  if (questionType === "praeteritum") return "praeteritum";
  if (questionType === "perfekt") return "perfekt";
  return "praesens";
}

export default function VerbTrainer({ onNavigate, settings }: VerbTrainerProps) {
  const [mode, setMode] = useState<Mode>("select");
  const [verbs, setVerbs] = useState<Verb[]>([]);
  const [verbCategories, setVerbCategories] = useState<VerbCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [sessionVerbs, setSessionVerbs] = useState<Verb[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Mode States
  const [showAnswer, setShowAnswer] = useState(false);
  const [writtenPraeteritum, setWrittenPraeteritum] = useState("");
  const [writtenPerfekt, setWrittenPerfekt] = useState("");
  const [writtenChecked, setWrittenChecked] = useState(false);

  const [choiceQuestionType, setChoiceQuestionType] = useState<VerbChoiceQuestionType>("arabic");
  const [choiceOptions, setChoiceOptions] = useState<string[]>([]);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [choiceChecked, setChoiceChecked] = useState(false);
  const [categoryQuestion, setCategoryQuestion] = useState<VerbCategoryQuestion | null>(null);
  const [categorySelectedChoice, setCategorySelectedChoice] = useState<string | null>(null);
  const [categoryWrittenAnswer, setCategoryWrittenAnswer] = useState("");
  const [categoryChecked, setCategoryChecked] = useState(false);

  // Session Stats
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionWrong, setSessionWrong] = useState(0);
  const [sessionFinished, setSessionFinished] = useState(false);
  const isRtl = settings.language === "ar";
  const ui = isRtl
    ? {
        dashboard: "لوحة التحكم",
        cancelTraining: "إلغاء التدريب",
        pageTitle: "مدرب الأفعال",
        chooseMode: "اختر وضع التدريب",
        chooseModeDesc: "اختر طريقة التعلم والفلتر المناسب للبدء بتدريب الأفعال.",
        mode1: "الوضع 1",
        mode2: "الوضع 2",
        mode3: "الوضع 3",
        mode4: "الوضع 4",
        flashcards: "بطاقات الحفظ",
        flashcardsDesc: "اعرض الفعل، ثم اكشف الإجابة وقيّم معرفتك بنفسك.",
        writingTest: "اختبار الكتابة",
        writingDesc: "درّب القواعد بكتابة صيغتي Präteritum وPerfekt للفعل الظاهر.",
        multipleChoice: "اختيار من متعدد",
        multipleChoiceDesc: "اختر المعنى أو صيغة Präteritum/Perfekt الصحيحة من بين أربع إجابات.",
        categoryTraining: "تدريب الفئات",
        categoryTrainingDesc: "تدرّب على حالات الأفعال، الفعل المساعد، الانفصال، وحروف الجر باستخدام أمثلة البيانات.",
        categoryFilter: "فلتر الفئة",
        allCategories: "كل الفئات",
        categoryQuestion: "سؤال الفئة",
        categoryHint: "تلميح",
        categoryNote: "ملاحظة",
        categoryExample: "مثال",
        writeCategoryAnswer: "اكتب الإجابة",
        allVerbs: "كل الأفعال",
        dueToday: "المستحقة اليوم",
        difficult: "الصعبة",
        noItems: "لا توجد أفعال مطابقة لهذا الفلتر.",
        trainingDone: "انتهى التدريب!",
        sessionDone: "أنهيت جلسة التدريب الحالية.",
        correct: "صحيح",
        wrong: "خطأ",
        repeat: "إعادة التدريب",
        changeMode: "تغيير الوضع",
        element: "عنصر",
        of: "من",
        present: "المضارع (er/sie/es)",
        reveal: "إظهار الإجابة",
        forgot: "لم أعرفها",
        knew: "عرفتها",
        correctLabel: "الصحيح",
        checkAnswer: "تحقق من الإجابة",
        nextVerb: "الفعل التالي",
        meaningGuess: "تخمين المعنى",
        praesensGuess: "تحديد Präsens",
        praeteritumGuess: "تحديد Präteritum",
        perfektGuess: "تحديد Perfekt",
        meaningQuestion: "ما معنى هذا الفعل بالعربية؟",
        praesensQuestion: "ما صيغة Präsens الصحيحة؟",
        praeteritumQuestion: "ما صيغة Präteritum الصحيحة؟",
        perfektQuestion: "ما صيغة Perfekt الصحيحة؟",
        examplePast: "مثال: brach ab",
        examplePerfect: "مثال: hat abgebrochen",
        writePraeteritum: "اكتب صيغة Prateritum",
        writePerfekt: "اكتب صيغة Perfekt",
        tenseExamplesTitle: "أمثلة حسب الزمن",
      }
    : {
        dashboard: "Dashboard",
        cancelTraining: "Training abbrechen",
        pageTitle: "Verben-Trainer",
        chooseMode: "Wähle deinen Trainingsmodus",
        chooseModeDesc: "Wähle eine Lernmethode und einen Filter für die Verben, um fortzufahren.",
        mode1: "Modus 1",
        mode2: "Modus 2",
        mode3: "Modus 3",
        mode4: "Modus 4",
        flashcards: "Karteikarten",
        flashcardsDesc: "Der klassische Modus. Sieh das Verb, decke die Rückseite auf und bewerte deine Kenntnis.",
        writingTest: "Schreibtest",
        writingDesc: "Perfektioniere deine Grammatik. Tippe das Präteritum und Perfekt des angezeigten Verbs ein.",
        multipleChoice: "Multiple Choice",
        multipleChoiceDesc: "Lerne spielerisch. Wähle die korrekte Präteritum-/Perfektform oder Bedeutung aus 4 Optionen.",
        categoryTraining: "Kategorie-Training",
        categoryTrainingDesc: "Trainiere Kasus, Hilfsverb, trennbare Verben und Präpositionen mit den Datenbeispielen.",
        categoryFilter: "Kategorie-Filter",
        allCategories: "Alle Kategorien",
        categoryQuestion: "Kategorie-Frage",
        categoryHint: "Hinweis",
        categoryNote: "Notiz",
        categoryExample: "Beispiel",
        writeCategoryAnswer: "Antwort schreiben",
        allVerbs: "Alle Verben",
        dueToday: "Fällige heute",
        difficult: "Schwierige",
        noItems: "Keine passenden Verben gefunden!",
        trainingDone: "Training beendet!",
        sessionDone: "Du hast die aktuelle Übungseinheit abgeschlossen.",
        correct: "Richtig",
        wrong: "Falsch",
        repeat: "Wiederholen",
        changeMode: "Modus wechseln",
        element: "Element",
        of: "von",
        present: "Präsens (er/sie/es)",
        reveal: "Antwort aufdecken",
        forgot: "Ich wusste es nicht",
        knew: "Ich wusste es",
        correctLabel: "Korrekt",
        checkAnswer: "Antwort prüfen",
        nextVerb: "Nächstes Verb",
        meaningGuess: "Bedeutung erraten",
        praesensGuess: "Präsens bestimmen",
        praeteritumGuess: "Präteritum bestimmen",
        perfektGuess: "Perfekt bestimmen",
        meaningQuestion: "Was bedeutet dieses Verb auf Arabisch?",
        praesensQuestion: "Was ist die korrekte Präsens-Form?",
        praeteritumQuestion: "Was ist die korrekte Präteritum-Form?",
        perfektQuestion: "Was ist die korrekte Perfekt-Form?",
        examplePast: "z.B. brach ab",
        examplePerfect: "z.B. hat abgebrochen",
        writePraeteritum: "Prateritum-Form schreiben",
        writePerfekt: "Perfekt-Form schreiben",
        tenseExamplesTitle: "Examples by tense",
      };

  useEffect(() => {
    async function loadVerbs() {
      const [data, categories] = await Promise.all([
        DataService.getVerbs(),
        DataService.getVerbCategories(),
      ]);
      setVerbs(data);
      setVerbCategories(categories);
    }
    loadVerbs();
  }, []);

  const filterBySelectedCategory = (list: Verb[]) => {
    if (!selectedCategoryId) return list;
    return list.filter((verb) => verb.categoryIds?.includes(selectedCategoryId));
  };

  const startSession = (selectedMode: Mode, filterType: "all" | "due" | "difficult" | "new") => {
    let list = filterBySelectedCategory([...verbs]);
    const now = new Date();

    if (filterType === "due") {
      list = list.filter((v) => {
        const item = ProgressService.getProgressItem(`verb-${v.id}`);
        return !item.nextReviewAt || new Date(item.nextReviewAt) <= now;
      });
    } else if (filterType === "difficult") {
      list = list.filter((v) => {
        const item = ProgressService.getProgressItem(`verb-${v.id}`);
        return item.difficulty === "difficult";
      });
    } else if (filterType === "new") {
      list = list.filter((v) => {
        const item = ProgressService.getProgressItem(`verb-${v.id}`);
        return item.correctCount === 0;
      });
    }

    if (selectedMode === "category") {
      list = list.filter(hasVerbCategoryTraining);
    }

    if (list.length === 0) {
      alert(ui.noItems);
      return;
    }

    // Shuffle and slice to session limit
    list.sort(() => Math.random() - 0.5);
    const limit = settings.questionsPerSession || 10;
    const selectedList = list.slice(0, limit);

    setSessionVerbs(selectedList);
    setCurrentIndex(0);
    setSessionCorrect(0);
    setSessionWrong(0);
    setSessionFinished(false);
    setMode(selectedMode);
    setupQuestion(selectedMode, selectedList, 0);
  };

  const setupQuestion = (
    currentMode: Mode,
    list: Verb[],
    index: number
  ) => {
    if (index >= list.length) {
      finishSession();
      return;
    }

    const verb = list[index];
    setShowAnswer(false);
    setWrittenPraeteritum("");
    setWrittenPerfekt("");
    setWrittenChecked(false);
    setSelectedChoice(null);
    setChoiceChecked(false);
    setCategoryQuestion(null);
    setCategorySelectedChoice(null);
    setCategoryWrittenAnswer("");
    setCategoryChecked(false);

    // Auto-play infinitiv pronunciation if configured
    if (settings.autoPlayPronunciation) {
      setTimeout(() => {
        AudioService.speak(verb.infinitiv, settings.speechSpeed);
      }, 300);
    }

    if (currentMode === "choice") {
      // Pick random question type
      const types: VerbChoiceQuestionType[] = ["arabic", "praesens", "praeteritum", "perfekt"];
      const availableTypes = types.filter((type) => getVerbChoiceCorrectAnswer(verb, type));
      const chosenType = availableTypes[Math.floor(Math.random() * availableTypes.length)] || "arabic";
      setChoiceQuestionType(chosenType);

      setChoiceOptions(generateVerbChoiceOptions(verb, verbs, chosenType));
    } else if (currentMode === "category") {
      setCategoryQuestion(
        buildVerbCategoryQuestion(
          verb,
          verbs,
          verbCategories,
          selectedCategoryId || null,
          settings.language || "de"
        )
      );
    }
  };

  const handleNext = () => {
    const nextIdx = currentIndex + 1;
    if (nextIdx >= sessionVerbs.length) {
      finishSession();
    } else {
      setCurrentIndex(nextIdx);
      setupQuestion(mode, sessionVerbs, nextIdx);
    }
  };

  const handleKnew = () => {
    const verb = sessionVerbs[currentIndex];
    ProgressService.recordReview(`verb-${verb.id}`, true);
    setSessionCorrect((prev) => prev + 1);
    handleNext();
  };

  const handleForgot = () => {
    const verb = sessionVerbs[currentIndex];
    ProgressService.recordReview(`verb-${verb.id}`, false);
    setSessionWrong((prev) => prev + 1);
    handleNext();
  };

  const checkWritten = () => {
    const verb = sessionVerbs[currentIndex];
    const isPraetCorrect = answersMatch(writtenPraeteritum, verb.praeteritum);
    const isPerfCorrect = answersMatch(writtenPerfekt, verb.perfekt);

    const isCorrect = isPraetCorrect && isPerfCorrect;

    if (isCorrect) {
      setSessionCorrect((prev) => prev + 1);
      ProgressService.recordReview(`verb-${verb.id}`, true);
    } else {
      setSessionWrong((prev) => prev + 1);
      ProgressService.recordReview(`verb-${verb.id}`, false);
      if (!isPraetCorrect) {
        MistakeReviewService.recordMistake({
          id: `mistake-verb-${verb.id}-praeteritum`,
          itemKey: `verb-${verb.id}`,
          type: "verb",
          mode: "verb-writing",
          itemId: verb.id,
          infinitiv: verb.infinitiv,
          arabic: verb.arabic,
          targetTense: "praeteritum",
          questionText: "Präteritum",
          correctAnswer: verb.praeteritum,
          userAnswer: writtenPraeteritum,
        });
      }
      if (!isPerfCorrect) {
        MistakeReviewService.recordMistake({
          id: `mistake-verb-${verb.id}-perfekt`,
          itemKey: `verb-${verb.id}`,
          type: "verb",
          mode: "verb-writing",
          itemId: verb.id,
          infinitiv: verb.infinitiv,
          arabic: verb.arabic,
          targetTense: "perfekt",
          questionText: "Perfekt",
          correctAnswer: verb.perfekt,
          userAnswer: writtenPerfekt,
        });
      }
    }

    setWrittenChecked(true);
  };

  const selectChoice = (option: string) => {
    if (choiceChecked) return;
    setSelectedChoice(option);
  };

  const checkChoice = () => {
    if (!selectedChoice) return;
    const verb = sessionVerbs[currentIndex];
    const correctAnswer = getVerbChoiceCorrectAnswer(verb, choiceQuestionType);
    const correct =
      choiceQuestionType === "arabic"
        ? selectedChoice === correctAnswer
        : answersMatch(selectedChoice, correctAnswer);

    if (correct) {
      setSessionCorrect((prev) => prev + 1);
      ProgressService.recordReview(`verb-${verb.id}`, true);
    } else {
      setSessionWrong((prev) => prev + 1);
      ProgressService.recordReview(`verb-${verb.id}`, false);
      MistakeReviewService.recordMistake({
        id: `mistake-verb-${verb.id}-${choiceQuestionType}`,
        itemKey: `verb-${verb.id}`,
        type: "verb",
        mode: "verb-multiple-choice",
        itemId: verb.id,
        infinitiv: verb.infinitiv,
        arabic: verb.arabic,
        targetTense: choiceQuestionType === "arabic" ? undefined : choiceQuestionType,
        questionText: choiceQuestionType === "arabic" ? "Arabic meaning" : TENSE_LABELS[choiceQuestionType],
        correctAnswer,
        userAnswer: selectedChoice,
      });
    }

    setChoiceChecked(true);
  };

  const checkCategoryAnswer = () => {
    if (!categoryQuestion) return;
    const verb = sessionVerbs[currentIndex];
    const userAnswer = categoryQuestion.options?.length ? categorySelectedChoice || "" : categoryWrittenAnswer;
    if (!userAnswer.trim()) return;

    const correct = answersMatch(userAnswer, categoryQuestion.answer);
    ProgressService.recordReview(`verb-${verb.id}`, correct);

    if (correct) {
      setSessionCorrect((prev) => prev + 1);
    } else {
      setSessionWrong((prev) => prev + 1);
      MistakeReviewService.recordMistake({
        id: `mistake-verb-category-${verb.id}-${categoryQuestion.id}`,
        itemKey: `verb-${verb.id}`,
        type: "verb",
        mode: categoryQuestion.options?.length ? "verb-multiple-choice" : "verb-writing",
        sourceType: "verb_category",
        categoryId: categoryQuestion.categoryId,
        choices: categoryQuestion.options,
        answerLang: categoryQuestion.answerLang,
        example_de: categoryQuestion.exampleDe,
        example_ar: categoryQuestion.exampleAr,
        note_ar: categoryQuestion.noteAr,
        itemId: verb.id,
        infinitiv: verb.infinitiv,
        arabic: verb.arabic,
        questionText: categoryQuestion.promptAr || categoryQuestion.promptDe || ui.categoryQuestion,
        correctAnswer: categoryQuestion.answer,
        userAnswer,
      });
    }

    setCategoryChecked(true);
  };

  const finishSession = () => {
    setSessionFinished(true);
    ProgressService.saveLastSessionResult({
      mode: "verbs",
      date: new Date().toISOString(),
      totalQuestions: sessionVerbs.length,
      correctCount: sessionCorrect,
      wrongCount: sessionWrong,
    });
  };

  // Return to selecting mode
  const goBack = () => {
    AudioService.stop();
    setMode("select");
  };

  const currentVerb = sessionVerbs[currentIndex];
  const choiceCorrectAnswer = currentVerb ? getVerbChoiceCorrectAnswer(currentVerb, choiceQuestionType) : "";
  const choiceExample = currentVerb ? getTenseExample(currentVerb, getChoiceExampleTense(choiceQuestionType)) : { de: "", ar: "" };
  const categoryCurrentAnswer = categoryQuestion?.options?.length
    ? categorySelectedChoice || ""
    : categoryWrittenAnswer;
  const categoryIsCorrect = categoryQuestion
    ? answersMatch(categoryCurrentAnswer, categoryQuestion.answer)
    : false;
  const writtenExamples = currentVerb
    ? ([
        { tense: "praeteritum" as TenseKey, example: getTenseExample(currentVerb, "praeteritum") },
        { tense: "perfekt" as TenseKey, example: getTenseExample(currentVerb, "perfekt") },
      ]).filter((item) => item.example.de || item.example.ar)
    : [];
  const currentTenseExamples = currentVerb
    ? TENSE_KEYS.map((tense) => ({
        tense,
        example: {
          de: normalizeGermanText(currentVerb.tenseExamples?.[tense]?.de),
          ar: (currentVerb.tenseExamples?.[tense]?.ar || "").trim(),
        },
      })).filter((item) => item.example.de || item.example.ar)
    : [];
  const metaLabels = isRtl
    ? {
        auxiliary: "الفعل المساعد",
        prefix: "السابقة",
        separable: "قابل للفصل",
        notSeparable: "غير قابل للفصل",
        needsReview: "يحتاج مراجعة",
        source: "المصدر",
        notes: "ملاحظات",
      }
    : {
        auxiliary: "Auxiliary",
        prefix: "Prefix",
        separable: "Separable",
        notSeparable: "Not separable",
        needsReview: "Needs review",
        source: "Source",
        notes: "Notes",
      };
  const getVerbMetaChips = (verb: Verb) => {
    const prefix = verb.prefix || detectVerbPrefix(verb.infinitiv);
    const auxiliary = verb.auxiliary || detectAuxiliary(verb.perfekt || "");
    const separable = verb.separable ?? detectSeparable(prefix);
    const levelTags = (verb.tags || []).filter((tag) => /^B\d/i.test(tag) || tag === "B1/B2");
    return Array.from(new Set([
      verb.level,
      verb.type,
      auxiliary && `${metaLabels.auxiliary}: ${auxiliary}`,
      prefix && `${metaLabels.prefix}: ${prefix}`,
      separable ? metaLabels.separable : metaLabels.notSeparable,
      verb.dataMeta?.needsReview && metaLabels.needsReview,
      ...levelTags,
    ].filter(Boolean) as string[]));
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-6" dir={isRtl ? "rtl" : "ltr"}>
      {/* Header back link */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <button
          onClick={mode === "select" ? () => onNavigate("dashboard") : goBack}
          className="inline-flex items-center text-xs uppercase tracking-wider font-bold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className={`${isRtl ? "ml-1.5 rotate-180" : "mr-1.5"}`} size={16} />
          {mode === "select" ? ui.dashboard : ui.cancelTraining}
        </button>
        <div className={`flex items-center space-x-2 ${isRtl ? "space-x-reverse" : ""}`}>
          <span className="p-1.5 bg-blue-50 text-blue-600 rounded">
            <BookOpen size={16} />
          </span>
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">{ui.pageTitle}</span>
        </div>
      </div>

      {/* MODE SELECT PAGE */}
      {mode === "select" && (
        <div className="space-y-6">
          <div className="text-center max-w-lg mx-auto">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-800 tracking-tight">
              {ui.chooseMode}
            </h1>
            <p className="text-xs text-gray-500 mt-2">
              {ui.chooseModeDesc}
            </p>
          </div>

          {verbCategories.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 max-w-lg mx-auto">
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">
                {ui.categoryFilter}
              </label>
              <select
                value={selectedCategoryId}
                onChange={(event) => setSelectedCategoryId(event.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700 focus:outline-none focus:border-blue-500"
              >
                <option value="">{ui.allCategories}</option>
                {verbCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {isRtl ? category.title_ar : category.title_de}
                    {category.count ? ` (${category.count})` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
            {/* Flashcards Selection */}
            <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
              <div>
                <span className="bg-blue-50 text-blue-600 text-xs font-bold px-2.5 py-1 rounded">{ui.mode1}</span>
                <h3 className="font-bold text-slate-800 text-base mt-3">{ui.flashcards}</h3>
                <p className="text-xs text-gray-500 mt-1">
                  {ui.flashcardsDesc}
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-50 space-y-2">
                <button
                  onClick={() => startSession("flashcards", "all")}
                  className="w-full inline-flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  <span>{ui.allVerbs}</span>
                  <ChevronRight className={isRtl ? "rotate-180" : ""} size={14} />
                </button>
                <button
                  onClick={() => startSession("flashcards", "due")}
                  className="w-full inline-flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  <span>{ui.dueToday}</span>
                  <ChevronRight className={isRtl ? "rotate-180" : ""} size={14} />
                </button>
                <button
                  onClick={() => startSession("flashcards", "difficult")}
                  className="w-full inline-flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  <span>{ui.difficult}</span>
                  <ChevronRight className={isRtl ? "rotate-180" : ""} size={14} />
                </button>
              </div>
            </div>

            {/* Written Test Selection */}
            <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
              <div>
                <span className="bg-indigo-50 text-indigo-600 text-xs font-bold px-2.5 py-1 rounded">{ui.mode2}</span>
                <h3 className="font-bold text-slate-800 text-base mt-3">{ui.writingTest}</h3>
                <p className="text-xs text-gray-500 mt-1">
                  {ui.writingDesc}
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-50 space-y-2">
                <button
                  onClick={() => startSession("written", "all")}
                  className="w-full inline-flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  <span>{ui.allVerbs}</span>
                  <ChevronRight className={isRtl ? "rotate-180" : ""} size={14} />
                </button>
                <button
                  onClick={() => startSession("written", "due")}
                  className="w-full inline-flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  <span>{ui.dueToday}</span>
                  <ChevronRight className={isRtl ? "rotate-180" : ""} size={14} />
                </button>
                <button
                  onClick={() => startSession("written", "difficult")}
                  className="w-full inline-flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  <span>{ui.difficult}</span>
                  <ChevronRight className={isRtl ? "rotate-180" : ""} size={14} />
                </button>
              </div>
            </div>

            {/* Multiple Choice Selection */}
            <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
              <div>
                <span className="bg-emerald-50 text-emerald-600 text-xs font-bold px-2.5 py-1 rounded">{ui.mode3}</span>
                <h3 className="font-bold text-slate-800 text-base mt-3">{ui.multipleChoice}</h3>
                <p className="text-xs text-gray-500 mt-1">
                  {ui.multipleChoiceDesc}
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-50 space-y-2">
                <button
                  onClick={() => startSession("choice", "all")}
                  className="w-full inline-flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  <span>{ui.allVerbs}</span>
                  <ChevronRight className={isRtl ? "rotate-180" : ""} size={14} />
                </button>
                <button
                  onClick={() => startSession("choice", "due")}
                  className="w-full inline-flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  <span>{ui.dueToday}</span>
                  <ChevronRight className={isRtl ? "rotate-180" : ""} size={14} />
                </button>
                <button
                  onClick={() => startSession("choice", "difficult")}
                  className="w-full inline-flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  <span>{ui.difficult}</span>
                  <ChevronRight className={isRtl ? "rotate-180" : ""} size={14} />
                </button>
              </div>
            </div>

            {/* Category Training Selection */}
            <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
              <div>
                <span className="bg-amber-50 text-amber-700 text-xs font-bold px-2.5 py-1 rounded">{ui.mode4}</span>
                <h3 className="font-bold text-slate-800 text-base mt-3">{ui.categoryTraining}</h3>
                <p className="text-xs text-gray-500 mt-1">
                  {ui.categoryTrainingDesc}
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-50 space-y-2">
                <button
                  onClick={() => startSession("category", "all")}
                  className="w-full inline-flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  <span>{ui.allVerbs}</span>
                  <ChevronRight className={isRtl ? "rotate-180" : ""} size={14} />
                </button>
                <button
                  onClick={() => startSession("category", "due")}
                  className="w-full inline-flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  <span>{ui.dueToday}</span>
                  <ChevronRight className={isRtl ? "rotate-180" : ""} size={14} />
                </button>
                <button
                  onClick={() => startSession("category", "difficult")}
                  className="w-full inline-flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  <span>{ui.difficult}</span>
                  <ChevronRight className={isRtl ? "rotate-180" : ""} size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SESSION RESULTS PAGE */}
      {sessionFinished && (
        <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-100 shadow-xl max-w-lg mx-auto text-center space-y-6">
          <span className="p-3 bg-emerald-50 text-emerald-600 rounded-full inline-flex items-center justify-center">
            <Award size={36} />
          </span>
          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-black text-slate-800">{ui.trainingDone}</h2>
            <p className="text-xs text-gray-500">{ui.sessionDone}</p>
          </div>

          <div className="grid grid-cols-2 gap-4 py-4 border-y border-slate-50">
            <div className="p-4 bg-emerald-50/50 rounded-xl">
              <span className="text-xs text-emerald-800 font-semibold uppercase tracking-wider block">{ui.correct}</span>
              <span className="text-2xl font-bold text-emerald-600">{sessionCorrect}</span>
            </div>
            <div className="p-4 bg-rose-50/50 rounded-xl">
              <span className="text-xs text-rose-800 font-semibold uppercase tracking-wider block">{ui.wrong}</span>
              <span className="text-2xl font-bold text-rose-600">{sessionWrong}</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => startSession(mode, "all")}
              className="flex-1 inline-flex items-center justify-center px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <RotateCw className={isRtl ? "ml-2" : "mr-2"} size={16} /> {ui.repeat}
            </button>
            <button
              onClick={goBack}
              className="flex-1 inline-flex items-center justify-center px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg transition-colors cursor-pointer"
            >
              {ui.changeMode}
            </button>
          </div>
        </div>
      )}

      {/* TRAINING ACTIVE VIEW */}
      {!sessionFinished && mode !== "select" && currentVerb && (
        <div className="space-y-6">
          {/* Progress Indicator */}
          <div className="flex items-center justify-between text-xs font-semibold text-gray-500">
            <span>
              {ui.element} {currentIndex + 1} {ui.of} {sessionVerbs.length}
            </span>
            <span>{ui.correct}: {sessionCorrect} • {ui.wrong}: {sessionWrong}</span>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-blue-600 h-full transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / sessionVerbs.length) * 100}%` }}
            />
          </div>

          {/* FLASHCARD MODE */}
          {mode === "flashcards" && (
            <div className="space-y-6">
              {/* Card Container */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-md p-6 sm:p-8 flex flex-col justify-between min-h-[250px] relative">
                {/* Front Side */}
                <div className="space-y-4">
                  <div className="flex justify-between items-start">
                    <span className="bg-slate-100 text-slate-600 text-xs px-2.5 py-0.5 rounded uppercase font-semibold">
                      {currentVerb.level}
                    </span>
                    <AudioButton text={currentVerb.infinitiv} speed={settings.speechSpeed} />
                  </div>
                  <div className="text-center py-4">
                    <h2 dir="ltr" lang="de" className="text-3xl font-extrabold text-slate-800 tracking-tight text-center">
                      {currentVerb.infinitiv}
                    </h2>
                    {/* Arabic word - direction rtl */}
                    {(showAnswer || settings.showArabicImmediately) && (
                      <p dir="rtl" lang="ar" className="text-2xl font-bold text-blue-600 mt-4 font-arabic text-right">
                        {currentVerb.arabic}
                      </p>
                    )}
                  </div>
                </div>

                {/* Back Side (revealed) */}
                {showAnswer && (
                  <div className="mt-6 pt-6 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                    <div className="p-3 bg-slate-50 rounded-xl">
                      <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">
                        {ui.present}
                      </span>
                      <span dir="ltr" lang="de" className="text-base font-bold text-slate-800 mt-1 block text-left">
                        {currentVerb.praesens}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl">
                      <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">
                        Präteritum
                      </span>
                      <span dir="ltr" lang="de" className="text-base font-bold text-slate-800 mt-1 block text-left">
                        {currentVerb.praeteritum}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl">
                      <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">
                        Perfekt
                      </span>
                      <span dir="ltr" lang="de" className="text-base font-bold text-slate-800 mt-1 block text-left">
                        {currentVerb.perfekt}
                      </span>
                    </div>
                  </div>
                )}

                {showAnswer && getVerbMetaChips(currentVerb).length > 0 && (
                  <div className="mt-4 p-4 bg-slate-50 rounded-xl">
                    <div className="flex flex-wrap gap-2">
                      {getVerbMetaChips(currentVerb).map((chip) => (
                        <span key={chip} className="bg-white border border-slate-200 text-slate-600 px-2 py-1 rounded text-[10px] font-bold">
                          {chip}
                        </span>
                      ))}
                    </div>
                    {currentVerb.notes_ar && (
                      <p dir="rtl" lang="ar" className="mt-3 text-xs font-semibold text-blue-700 font-arabic text-right">
                        {metaLabels.notes}: {currentVerb.notes_ar}
                      </p>
                    )}
                  </div>
                )}

                {/* Example sentence on back */}
                {showAnswer && currentTenseExamples.length > 0 && (
                  <div className="mt-4 p-4 bg-slate-50 rounded-xl space-y-3">
                    <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                      {ui.tenseExamplesTitle}
                    </h4>
                    <div className="space-y-3">
                      {currentTenseExamples.map(({ tense, example }) => (
                        <div key={tense} className="border-t border-slate-100 pt-2 first:border-t-0 first:pt-0">
                          <div className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">
                            {TENSE_LABELS[tense]}
                          </div>
                          {example.de && (
                            <p dir="ltr" lang="de" className="text-xs sm:text-sm font-semibold text-slate-800 text-left">
                              {example.de}
                            </p>
                          )}
                          {example.ar && (
                            <p dir="rtl" lang="ar" className="text-xs sm:text-sm font-bold text-blue-600 font-arabic text-right">
                              {example.ar}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {showAnswer && currentVerb.example_de && currentTenseExamples.length === 0 && (
                  <div className="mt-4 p-4 bg-blue-50/50 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <p dir="ltr" lang="de" className="text-xs sm:text-sm font-semibold text-slate-800 text-left">
                        {normalizeGermanText(currentVerb.example_de)}
                      </p>
                      <AudioButton
                        text={currentVerb.example_de}
                        speed={settings.speechSpeed}
                        size={16}
                        className="p-1.5"
                      />
                    </div>
                    {currentVerb.example_ar && (
                      <p dir="rtl" lang="ar" className="text-xs sm:text-sm font-bold text-blue-600 font-arabic text-right">
                        {currentVerb.example_ar}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex justify-center pt-2">
                {!showAnswer ? (
                  <button
                    onClick={() => setShowAnswer(true)}
                    className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-colors cursor-pointer"
                  >
                    <Eye className={isRtl ? "ml-2" : "mr-2"} size={18} /> {ui.reveal}
                  </button>
                ) : (
                  <div className={`flex space-x-4 w-full sm:w-auto ${isRtl ? "space-x-reverse" : ""}`}>
                    <button
                      onClick={handleForgot}
                      className="flex-1 sm:flex-none inline-flex items-center justify-center px-8 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-md transition-colors cursor-pointer"
                    >
                      <X className={isRtl ? "ml-2" : "mr-2"} size={18} /> {ui.forgot}
                    </button>
                    <button
                      onClick={handleKnew}
                      className="flex-1 sm:flex-none inline-flex items-center justify-center px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md"
                    >
                      <span className="flex items-center gap-1">✓ {ui.knew}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Written Test Mode */}
          {mode === "written" && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-md p-6 sm:p-8 space-y-6">
                <div className="flex justify-between items-start">
                  <span className="bg-slate-100 text-slate-600 text-xs px-2.5 py-0.5 rounded uppercase font-semibold">
                    {currentVerb.level}
                  </span>
                  <AudioButton text={currentVerb.infinitiv} speed={settings.speechSpeed} />
                </div>

                <div className="text-center py-2">
                  <h2 dir="ltr" lang="de" className="text-3xl font-extrabold text-slate-800 tracking-tight text-center">
                    {currentVerb.infinitiv}
                  </h2>
                  <p dir="rtl" lang="ar" className="text-xl font-bold text-slate-500 mt-2 font-arabic text-right">
                    {currentVerb.arabic}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-500 block">
                      Präteritum:
                    </label>
                    <input
                      type="text"
                      disabled={writtenChecked}
                      dir="ltr"
                      lang="de"
                      value={writtenPraeteritum}
                      onChange={(e) => setWrittenPraeteritum(e.target.value)}
                      placeholder={ui.writePraeteritum}
                      className={`w-full px-4 py-3 rounded-xl border text-sm font-medium text-left focus:outline-none transition-all ${
                        writtenChecked
                          ? answersMatch(writtenPraeteritum, currentVerb.praeteritum)
                            ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                            : "bg-rose-50 border-rose-300 text-rose-800"
                          : "border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      }`}
                    />
                    {writtenChecked && (
                      <p className="text-xs font-semibold text-slate-600 mt-1">
                        {ui.correctLabel}: <span dir="ltr" lang="de" className="font-bold text-slate-800">{currentVerb.praeteritum}</span>
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-500 block">
                      Perfekt:
                    </label>
                    <input
                      type="text"
                      disabled={writtenChecked}
                      dir="ltr"
                      lang="de"
                      value={writtenPerfekt}
                      onChange={(e) => setWrittenPerfekt(e.target.value)}
                      placeholder={ui.writePerfekt}
                      className={`w-full px-4 py-3 rounded-xl border text-sm font-medium text-left focus:outline-none transition-all ${
                        writtenChecked
                          ? answersMatch(writtenPerfekt, currentVerb.perfekt)
                            ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                            : "bg-rose-50 border-rose-300 text-rose-800"
                          : "border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      }`}
                    />
                    {writtenChecked && (
                      <p className="text-xs font-semibold text-slate-600 mt-1">
                        {ui.correctLabel}: <span dir="ltr" lang="de" className="font-bold text-slate-800">{currentVerb.perfekt}</span>
                      </p>
                    )}
                  </div>
                </div>

                {writtenChecked && writtenExamples.length > 0 && (
                  <div className="p-4 bg-slate-50 rounded-xl space-y-3 mt-4">
                    {writtenExamples.map(({ tense, example }) => (
                      <div key={tense} className="space-y-1 border-t border-slate-100 pt-2 first:border-t-0 first:pt-0">
                        <div className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">
                          {TENSE_LABELS[tense]}
                        </div>
                        {example.de && (
                          <div className="flex items-center justify-between">
                            <p dir="ltr" lang="de" className="text-xs sm:text-sm font-semibold text-slate-800 text-left">
                              {example.de}
                            </p>
                            <AudioButton text={example.de} speed={settings.speechSpeed} size={16} />
                          </div>
                        )}
                        {example.ar && (
                          <p dir="rtl" lang="ar" className="text-xs sm:text-sm font-bold text-blue-600 font-arabic text-right">
                            {example.ar}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-center">
                {!writtenChecked ? (
                  <button
                    onClick={checkWritten}
                    disabled={!writtenPraeteritum.trim() || !writtenPerfekt.trim()}
                    className={`w-full sm:w-auto inline-flex items-center justify-center px-8 py-3 font-bold rounded-xl shadow-md transition-colors ${
                      writtenPraeteritum.trim() && writtenPerfekt.trim()
                        ? "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                        : "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
                    }`}
                  >
                    {ui.checkAnswer}
                  </button>
                ) : (
                  <button
                    onClick={handleNext}
                    className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md cursor-pointer"
                  >
                    {ui.nextVerb} <ChevronRight className={isRtl ? "mr-1 rotate-180" : "ml-1"} size={18} />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Category Training Mode */}
          {mode === "category" && categoryQuestion && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-md p-6 sm:p-8 space-y-6">
                <div className="flex justify-between items-start">
                  <span className="bg-amber-50 text-amber-700 text-xs px-2.5 py-0.5 rounded uppercase font-semibold">
                    {ui.categoryTraining}
                  </span>
                  <AudioButton text={currentVerb.infinitiv} speed={settings.speechSpeed} />
                </div>

                <div className="text-center py-2 space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-3 py-1 rounded-full">
                    {ui.categoryQuestion}
                  </span>
                  <h2 dir="ltr" lang="de" className="text-3xl font-extrabold text-slate-800 tracking-tight mt-3 text-center">
                    {currentVerb.infinitiv}
                  </h2>
                  {categoryQuestion.promptAr && (
                    <p dir="rtl" lang="ar" className="text-sm sm:text-base font-bold text-slate-700 font-arabic text-right">
                      {categoryQuestion.promptAr}
                    </p>
                  )}
                  {categoryQuestion.promptDe && (
                    <p dir="ltr" lang="de" className="text-sm font-semibold text-slate-500 text-left">
                      {categoryQuestion.promptDe}
                    </p>
                  )}
                  {categoryQuestion.hintAr && !categoryChecked && (
                    <p dir="rtl" lang="ar" className="text-xs font-semibold text-blue-600 font-arabic text-right">
                      {ui.categoryHint}: {categoryQuestion.hintAr}
                    </p>
                  )}
                </div>

                {categoryQuestion.options?.length ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                    {categoryQuestion.options.map((option, idx) => {
                      const isSelected = categorySelectedChoice === option;
                      const isCorrectOption = answersMatch(option, categoryQuestion.answer);

                      let btnClass = "border-slate-200 hover:bg-slate-50 text-slate-800";
                      if (isSelected && !categoryChecked) {
                        btnClass = "border-blue-500 bg-blue-50 text-blue-700 font-bold";
                      } else if (categoryChecked) {
                        if (isCorrectOption) {
                          btnClass = "border-emerald-500 bg-emerald-50 text-emerald-800 font-bold";
                        } else if (isSelected) {
                          btnClass = "border-rose-500 bg-rose-50 text-rose-800 font-bold";
                        } else {
                          btnClass = "border-slate-100 text-slate-400 opacity-60";
                        }
                      }

                      return (
                        <button
                          key={`${option}-${idx}`}
                          disabled={categoryChecked}
                          onClick={() => setCategorySelectedChoice(option)}
                          className={`w-full p-4 rounded-xl border text-sm font-medium transition-all flex items-center justify-between cursor-pointer ${categoryQuestion.answerLang === "ar" ? "text-right" : "text-left"} ${btnClass}`}
                        >
                          <span
                            dir={categoryQuestion.answerLang === "ar" ? "rtl" : "ltr"}
                            lang={categoryQuestion.answerLang}
                            className={categoryQuestion.answerLang === "ar" ? "font-arabic text-right w-full" : "w-full text-left"}
                          >
                            {option}
                          </span>
                          {categoryChecked && isCorrectOption && (
                            <Check className="text-emerald-600 ml-2" size={16} />
                          )}
                          {categoryChecked && isSelected && !isCorrectOption && (
                            <X className="text-rose-600 ml-2" size={16} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <input
                    type="text"
                    disabled={categoryChecked}
                    dir={categoryQuestion.answerLang === "ar" ? "rtl" : "ltr"}
                    lang={categoryQuestion.answerLang}
                    value={categoryWrittenAnswer}
                    onChange={(event) => setCategoryWrittenAnswer(event.target.value)}
                    placeholder={ui.writeCategoryAnswer}
                    className={`w-full px-4 py-3 rounded-xl border text-sm font-medium focus:outline-none transition-all ${
                      categoryQuestion.answerLang === "ar" ? "text-right font-arabic" : "text-left"
                    } ${
                      categoryChecked
                        ? categoryIsCorrect
                          ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                          : "bg-rose-50 border-rose-300 text-rose-800"
                        : "border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    }`}
                  />
                )}

                {categoryChecked && !categoryIsCorrect && (
                  <p className="text-xs font-semibold text-slate-600 text-center">
                    {ui.correctLabel}:{" "}
                    <span
                      dir={categoryQuestion.answerLang === "ar" ? "rtl" : "ltr"}
                      lang={categoryQuestion.answerLang}
                      className="font-bold text-slate-800"
                    >
                      {categoryQuestion.answer}
                    </span>
                  </p>
                )}

                {categoryChecked && (categoryQuestion.exampleDe || categoryQuestion.exampleAr || categoryQuestion.noteAr) && (
                  <div className="p-4 bg-slate-50 rounded-xl space-y-2 mt-4">
                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                      {ui.categoryExample}
                    </div>
                    {categoryQuestion.exampleDe && (
                      <div className="flex items-center justify-between gap-3">
                        <p dir="ltr" lang="de" className="text-xs sm:text-sm font-semibold text-slate-800 text-left">
                          {categoryQuestion.exampleDe}
                        </p>
                        <AudioButton text={categoryQuestion.exampleDe} speed={settings.speechSpeed} size={16} />
                      </div>
                    )}
                    {categoryQuestion.exampleAr && (
                      <p dir="rtl" lang="ar" className="text-xs sm:text-sm font-bold text-blue-600 font-arabic text-right">
                        {categoryQuestion.exampleAr}
                      </p>
                    )}
                    {categoryQuestion.noteAr && (
                      <p dir="rtl" lang="ar" className="text-xs font-semibold text-slate-600 font-arabic text-right">
                        {ui.categoryNote}: {categoryQuestion.noteAr}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-center">
                {!categoryChecked ? (
                  <button
                    onClick={checkCategoryAnswer}
                    disabled={!categoryCurrentAnswer.trim()}
                    className={`w-full sm:w-auto inline-flex items-center justify-center px-8 py-3 font-bold rounded-xl shadow-md transition-colors ${
                      categoryCurrentAnswer.trim()
                        ? "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                        : "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
                    }`}
                  >
                    {ui.checkAnswer}
                  </button>
                ) : (
                  <button
                    onClick={handleNext}
                    className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md cursor-pointer"
                  >
                    {ui.nextVerb} <ChevronRight className={isRtl ? "mr-1 rotate-180" : "ml-1"} size={18} />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Multiple Choice Mode */}
          {mode === "choice" && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-md p-6 sm:p-8 space-y-6">
                <div className="flex justify-between items-start">
                  <span className="bg-slate-100 text-slate-600 text-xs px-2.5 py-0.5 rounded uppercase font-semibold">
                    {currentVerb.level}
                  </span>
                  <AudioButton text={currentVerb.infinitiv} speed={settings.speechSpeed} />
                </div>

                <div className="text-center py-2 space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-550/10 px-3 py-1 rounded-full">
                    {choiceQuestionType === "arabic" && ui.meaningGuess}
                    {choiceQuestionType === "praesens" && ui.praesensGuess}
                    {choiceQuestionType === "praeteritum" && ui.praeteritumGuess}
                    {choiceQuestionType === "perfekt" && ui.perfektGuess}
                  </span>
                  <h2 dir="ltr" lang="de" className="text-3xl font-extrabold text-slate-800 tracking-tight mt-3 text-center">
                    {currentVerb.infinitiv}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {choiceQuestionType === "arabic" && ui.meaningQuestion}
                    {choiceQuestionType === "praesens" && ui.praesensQuestion}
                    {choiceQuestionType === "praeteritum" && ui.praeteritumQuestion}
                    {choiceQuestionType === "perfekt" && ui.perfektQuestion}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                  {choiceOptions.map((option, idx) => {
                    const isSelected = selectedChoice === option;
                    const isCorrectOption =
                      choiceQuestionType === "arabic"
                        ? option === choiceCorrectAnswer
                        : answersMatch(option, choiceCorrectAnswer);

                    let btnClass = "border-slate-200 hover:bg-slate-50 text-slate-800";
                    if (isSelected && !choiceChecked) {
                      btnClass = "border-blue-500 bg-blue-50 text-blue-700 font-bold";
                    } else if (choiceChecked) {
                      if (isCorrectOption) {
                        btnClass = "border-emerald-500 bg-emerald-50 text-emerald-800 font-bold";
                      } else if (isSelected) {
                        btnClass = "border-rose-500 bg-rose-50 text-rose-800 font-bold";
                      } else {
                        btnClass = "border-slate-100 text-slate-400 opacity-60";
                      }
                    }

                    return (
                      <button
                        key={idx}
                        disabled={choiceChecked}
                        onClick={() => selectChoice(option)}
                        className={`w-full p-4 rounded-xl border text-sm font-medium transition-all flex items-center justify-between cursor-pointer ${choiceQuestionType === "arabic" ? "text-right" : "text-left"} ${btnClass}`}
                      >
                        <span
                          dir={choiceQuestionType === "arabic" ? "rtl" : "ltr"}
                          lang={choiceQuestionType === "arabic" ? "ar" : "de"}
                          className={choiceQuestionType === "arabic" ? "font-arabic text-right w-full" : "w-full text-left"}
                        >
                          {option}
                        </span>
                        {choiceChecked && isCorrectOption && (
                          <Check className="text-emerald-600 ml-2" size={16} />
                        )}
                        {choiceChecked && isSelected && !isCorrectOption && (
                          <X className="text-rose-600 ml-2" size={16} />
                        )}
                      </button>
                    );
                  })}
                </div>

                {choiceChecked && (
                  choiceQuestionType === "arabic" ? selectedChoice !== choiceCorrectAnswer : !answersMatch(selectedChoice, choiceCorrectAnswer)
                ) && (
                  <p className="text-xs font-semibold text-slate-600 text-center">
                    {ui.correctLabel}:{" "}
                    <span
                      dir={choiceQuestionType === "arabic" ? "rtl" : "ltr"}
                      lang={choiceQuestionType === "arabic" ? "ar" : "de"}
                      className="font-bold text-slate-800"
                    >
                      {choiceCorrectAnswer}
                    </span>
                  </p>
                )}

                {choiceChecked && (choiceExample.de || choiceExample.ar) && (
                  <div className="p-4 bg-slate-50 rounded-xl space-y-1 mt-4">
                    {choiceExample.de && (
                      <div className="flex items-center justify-between">
                        <p dir="ltr" lang="de" className="text-xs sm:text-sm font-semibold text-slate-800 text-left">
                          {choiceExample.de}
                        </p>
                        <AudioButton text={choiceExample.de} speed={settings.speechSpeed} size={16} />
                      </div>
                    )}
                    {choiceExample.ar && (
                      <p dir="rtl" lang="ar" className="text-xs sm:text-sm font-bold text-blue-600 font-arabic text-right">
                        {choiceExample.ar}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-center">
                {!choiceChecked ? (
                  <button
                    onClick={checkChoice}
                    disabled={!selectedChoice}
                    className={`w-full sm:w-auto inline-flex items-center justify-center px-8 py-3 font-bold rounded-xl shadow-md transition-colors ${
                      selectedChoice
                        ? "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                        : "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
                    }`}
                  >
                    {ui.checkAnswer}
                  </button>
                ) : (
                  <button
                    onClick={handleNext}
                    className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md cursor-pointer"
                  >
                    {ui.nextVerb} <ChevronRight className={isRtl ? "mr-1 rotate-180" : "ml-1"} size={18} />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
