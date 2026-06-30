import { useState, useEffect } from "react";
import {
  ArrowLeft,
  Check,
  X,
  HelpCircle,
  RotateCw,
  Award,
  ChevronRight,
  Eye,
  Bookmark,
} from "lucide-react";
import { DataService } from "../services/dataService";
import { ProgressService } from "../services/progressService";
import { AudioService } from "../services/audioService";
import { MistakeReviewService } from "../services/mistakeReviewService";
import {
  answersMatchAny,
  getVocabularyDefaultExample,
  getVocabularyFullTerm,
  getVocabularyMeaningQuestion,
  getVocabularyNeedsReview,
  getVocabularyTerm,
  getVocabularyTypeLabel,
  getVocabularyWritingQuestion,
  VocabularyTrainingQuestion,
} from "../services/vocabularyTrainingService";
import { Vocabulary, UserSettings } from "../types";
import AudioButton from "../components/AudioButton";

interface VocabularyTrainerProps {
  onNavigate: (page: string) => void;
  settings: UserSettings;
}

type Mode = "select" | "flashcards" | "quiz" | "writing";

export default function VocabularyTrainer({ onNavigate, settings }: VocabularyTrainerProps) {
  const [mode, setMode] = useState<Mode>("select");
  const [vocabList, setVocabList] = useState<Vocabulary[]>([]);
  const [sessionList, setSessionList] = useState<Vocabulary[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Card reveals
  const [showAnswer, setShowAnswer] = useState(false);

  // Quiz States
  const [quizOptions, setChoiceOptions] = useState<string[]>([]);
  const [quizQuestion, setQuizQuestion] = useState<VocabularyTrainingQuestion | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [quizChecked, setQuizChecked] = useState(false);

  // Writing States
  const [writingQuestion, setWritingQuestion] = useState<VocabularyTrainingQuestion | null>(null);
  const [writingInput, setWritingInput] = useState("");
  const [writingChecked, setWritingChecked] = useState(false);

  // Statistics
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionWrong, setSessionWrong] = useState(0);
  const [sessionFinished, setSessionFinished] = useState(false);
  const isRtl = settings.language === "ar";
  const ui = isRtl
    ? {
        dashboard: "لوحة التحكم",
        cancelTraining: "إلغاء التدريب",
        pageTitle: "مدرب المفردات",
        chooseMode: "اختر وضع التدريب",
        chooseModeDesc: "درّب مفردات B1/B2 من أسماء وصفات وعبارات وأفعال بطرق مختلفة.",
        mode1: "الوضع 1",
        mode2: "الوضع 2",
        mode3: "الوضع 3",
        flashcards: "بطاقات الحفظ",
        flashcardsDesc: "اعرض المصطلح الألماني، ثم اكشف المعنى العربي وتدرّب مع الأمثلة.",
        meaningQuiz: "اختبار المعنى",
        meaningQuizDesc: "اختر المعنى العربي الصحيح للمصطلح الألماني من بين أربع إجابات.",
        writingTest: "اختبار الكتابة",
        writingDesc: "اعرض المعنى العربي واكتب المصطلح الألماني الصحيح مع الأداة إن وجدت.",
        allVocab: "كل المفردات",
        dueToday: "المستحقة اليوم",
        difficult: "الصعبة",
        noItems: "لا توجد مفردات مطابقة لهذا الفلتر.",
        trainingDone: "انتهى التدريب!",
        sessionDone: "أنهيت تدريب المفردات الحالي.",
        correct: "صحيح",
        wrong: "خطأ",
        repeat: "إعادة التدريب",
        changeMode: "تغيير الوضع",
        word: "كلمة",
        of: "من",
        chapter: "الفصل",
        section: "القسم",
        reveal: "إظهار الإجابة",
        forgot: "لم أعرفها",
        knew: "عرفتها",
        meaningGuess: "تخمين المعنى",
        meaningQuestion: "ما معنى هذه الكلمة بالعربية؟",
        checkAnswer: "تحقق من الإجابة",
        nextWord: "الكلمة التالية",
        writingBadge: "اختبار الكتابة بالألمانية",
        writePrompt: "اكتب المصطلح الألماني لـ:",
        germanTerm: "المصطلح بالألمانية:",
        germanPlaceholder: "مثال: die Klimaanlage, -n",
        genericGermanPlaceholder: "اكتب المصطلح الألماني",
        correctWord: "الكلمة الصحيحة:",
        correctMeaning: "المعنى الصحيح:",
        article: "الأداة",
        gender: "الجنس",
        plural: "الجمع",
        needsReview: "يحتاج مراجعة",
      }
    : {
        dashboard: "Dashboard",
        cancelTraining: "Training abbrechen",
        pageTitle: "Wortschatz-Trainer",
        chooseMode: "Wähle deinen Trainingsmodus",
        chooseModeDesc: "Trainiere B1/B2 Substantive, Adjektive, Phrasen und Verben mit verschiedenen Trainingsvarianten.",
        mode1: "Modus 1",
        mode2: "Modus 2",
        mode3: "Modus 3",
        flashcards: "Karteikarten",
        flashcardsDesc: "Der klassische Modus. Sieh den deutschen Begriff, enthülle die Bedeutung auf Arabisch und lerne Beispielsätze.",
        meaningQuiz: "Bedeutungs-Quiz",
        meaningQuizDesc: "Multiple-Choice. Erkenne die arabische Bedeutung des deutschen Worts aus vier angebotenen Wahlmöglichkeiten.",
        writingTest: "Schreibtest",
        writingDesc: "Der anspruchsvollste Modus. Sieh die arabische Bedeutung und schreibe den korrekten deutschen Begriff (inkl. Artikel).",
        allVocab: "Alle Vokabeln",
        dueToday: "Fällige heute",
        difficult: "Schwierige",
        noItems: "Keine passenden Vokabeln gefunden!",
        trainingDone: "Training beendet!",
        sessionDone: "Du hast dein Wortschatz-Training abgeschlossen.",
        correct: "Richtig",
        wrong: "Falsch",
        repeat: "Wiederholen",
        changeMode: "Modus wechseln",
        word: "Wort",
        of: "von",
        chapter: "Kapitel",
        section: "Bereich",
        reveal: "Antwort aufdecken",
        forgot: "Ich wusste es nicht",
        knew: "Ich wusste es",
        meaningGuess: "Bedeutung erraten",
        meaningQuestion: "Was bedeutet dieses Wort auf Arabisch?",
        checkAnswer: "Antwort prüfen",
        nextWord: "Nächstes Wort",
        writingBadge: "Schreibtest (Deutsch schreiben)",
        writePrompt: "Schreibe den deutschen Begriff für:",
        germanTerm: "Begriff auf Deutsch:",
        germanPlaceholder: "z.B. die Klimaanlage, -n",
        genericGermanPlaceholder: "German term schreiben",
        correctWord: "Korrektes Wort:",
        correctMeaning: "Korrekte Bedeutung:",
        article: "Article",
        gender: "Gender",
        plural: "Plural",
        needsReview: "Needs review",
      };

  useEffect(() => {
    async function loadVocab() {
      const data = await DataService.getVocabulary();
      setVocabList(data);
    }
    loadVocab();
  }, []);

  const startSession = (selectedMode: Mode, filterType: "all" | "due" | "difficult" | "new") => {
    let list = [...vocabList];
    const now = new Date();

    if (filterType === "due") {
      list = list.filter((v) => {
        const item = ProgressService.getProgressItem(`vocab-${v.id}`);
        return !item.nextReviewAt || new Date(item.nextReviewAt) <= now;
      });
    } else if (filterType === "difficult") {
      list = list.filter((v) => {
        const item = ProgressService.getProgressItem(`vocab-${v.id}`);
        return item.difficulty === "difficult";
      });
    } else if (filterType === "new") {
      list = list.filter((v) => {
        const item = ProgressService.getProgressItem(`vocab-${v.id}`);
        return item.correctCount === 0;
      });
    }

    if (list.length === 0) {
      alert(ui.noItems);
      return;
    }

    list.sort(() => Math.random() - 0.5);
    const limit = settings.questionsPerSession || 10;
    const selectedList = list.slice(0, limit);

    setSessionList(selectedList);
    setCurrentIndex(0);
    setSessionCorrect(0);
    setSessionWrong(0);
    setSessionFinished(false);
    setMode(selectedMode);
    setupQuestion(selectedMode, selectedList, 0);
  };

  const setupQuestion = (currentMode: Mode, list: Vocabulary[], index: number) => {
    if (index >= list.length) {
      finishSession();
      return;
    }

    const item = list[index];
    setShowAnswer(false);
    setSelectedChoice(null);
    setQuizQuestion(null);
    setQuizChecked(false);
    setWritingQuestion(null);
    setWritingInput("");
    setWritingChecked(false);

    // Auto-play if enabled (only in flashcards and meaning quiz, not in writing since it shows the answer!)
    if (settings.autoPlayPronunciation && currentMode !== "writing") {
      setTimeout(() => {
        AudioService.speak(getVocabularyTerm(item), settings.speechSpeed);
      }, 300);
    }

    if (currentMode === "quiz") {
      const question = getVocabularyMeaningQuestion(item, vocabList);
      setQuizQuestion(question);
      setChoiceOptions(question.options || []);
    } else if (currentMode === "writing") {
      setWritingQuestion(getVocabularyWritingQuestion(item));
    }
  };

  const handleNext = () => {
    const nextIdx = currentIndex + 1;
    if (nextIdx >= sessionList.length) {
      finishSession();
    } else {
      setCurrentIndex(nextIdx);
      setupQuestion(mode, sessionList, nextIdx);
    }
  };

  const handleKnew = () => {
    const item = sessionList[currentIndex];
    ProgressService.recordReview(`vocab-${item.id}`, true);
    setSessionCorrect((prev) => prev + 1);
    handleNext();
  };

  const handleForgot = () => {
    const item = sessionList[currentIndex];
    ProgressService.recordReview(`vocab-${item.id}`, false);
    setSessionWrong((prev) => prev + 1);
    handleNext();
  };

  const checkQuiz = () => {
    if (!selectedChoice || !quizQuestion) return;
    const item = sessionList[currentIndex];
    const isCorrect = selectedChoice === quizQuestion.answer;

    if (isCorrect) {
      setSessionCorrect((prev) => prev + 1);
      ProgressService.recordReview(`vocab-${item.id}`, true);
    } else {
      setSessionWrong((prev) => prev + 1);
      ProgressService.recordReview(`vocab-${item.id}`, false);
      MistakeReviewService.recordMistake({
        id: `mistake-vocab-${item.id}-multiple-choice`,
        itemKey: `vocab-${item.id}`,
        type: "vocabulary",
        mode: "vocab-multiple-choice",
        sourceType: quizQuestion.sourceType,
        choices: quizQuestion.options,
        answerLang: quizQuestion.answerLang,
        example_de: quizQuestion.exampleDe,
        example_ar: quizQuestion.exampleAr,
        note_ar: quizQuestion.noteAr,
        itemId: item.id,
        term: getVocabularyFullTerm(item),
        arabic: item.arabic,
        questionText: quizQuestion.promptAr || quizQuestion.promptDe || "Arabic meaning",
        correctAnswer: quizQuestion.answer,
        userAnswer: selectedChoice,
      });
    }

    setQuizChecked(true);
  };

  const checkWriting = () => {
    if (!writingQuestion) return;
    const item = sessionList[currentIndex];
    const isCorrect = answersMatchAny(writingInput, writingQuestion);

    if (isCorrect) {
      setSessionCorrect((prev) => prev + 1);
      ProgressService.recordReview(`vocab-${item.id}`, true);
    } else {
      setSessionWrong((prev) => prev + 1);
      ProgressService.recordReview(`vocab-${item.id}`, false);
      MistakeReviewService.recordMistake({
        id: `mistake-vocab-${item.id}-writing`,
        itemKey: `vocab-${item.id}`,
        type: "vocabulary",
        mode: "vocab-writing",
        sourceType: writingQuestion.sourceType,
        choices: writingQuestion.options,
        answerLang: writingQuestion.answerLang,
        example_de: writingQuestion.exampleDe,
        example_ar: writingQuestion.exampleAr,
        note_ar: writingQuestion.noteAr,
        itemId: item.id,
        term: getVocabularyFullTerm(item),
        arabic: item.arabic,
        questionText: writingQuestion.promptAr || writingQuestion.promptDe || "German term",
        correctAnswer: writingQuestion.answer,
        userAnswer: writingInput,
      });
    }

    setWritingChecked(true);
  };

  const finishSession = () => {
    setSessionFinished(true);
    ProgressService.saveLastSessionResult({
      mode: "vocab",
      date: new Date().toISOString(),
      totalQuestions: sessionList.length,
      correctCount: sessionCorrect,
      wrongCount: sessionWrong,
    });
  };

  const goBack = () => {
    AudioService.stop();
    setMode("select");
  };

  const currentItem = sessionList[currentIndex];
  const currentDisplayTerm = currentItem ? getVocabularyFullTerm(currentItem) : "";
  const currentDefaultExample = currentItem ? getVocabularyDefaultExample(currentItem) : { de: "", ar: "" };
  const currentQuizExample = quizQuestion
    ? { de: quizQuestion.exampleDe || "", ar: quizQuestion.exampleAr || "" }
    : currentDefaultExample;
  const currentWritingExample = writingQuestion
    ? { de: writingQuestion.exampleDe || "", ar: writingQuestion.exampleAr || "" }
    : currentDefaultExample;
  const getVocabMetaChips = (item: Vocabulary) => {
    return [
      item.level,
      getVocabularyTypeLabel(item),
      item.article && `${ui.article}: ${item.article}`,
      item.gender && `${ui.gender}: ${item.gender}`,
      (item.plural || item.pluralRaw) && `${ui.plural}: ${item.plural || item.pluralRaw}`,
      item.chapterTitle && `${ui.chapter}: ${item.chapterTitle}`,
      item.section && `${ui.section}: ${item.section}`,
      getVocabularyNeedsReview(item) && ui.needsReview,
    ].filter(Boolean) as string[];
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-6" dir={isRtl ? "rtl" : "ltr"}>
      {/* Header Back Link */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <button
          onClick={mode === "select" ? () => onNavigate("dashboard") : goBack}
          className="inline-flex items-center text-xs uppercase tracking-wider font-bold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className={`${isRtl ? "ml-1.5 rotate-180" : "mr-1.5"}`} size={16} />
          {mode === "select" ? ui.dashboard : ui.cancelTraining}
        </button>
        <div className={`flex items-center space-x-2 ${isRtl ? "space-x-reverse" : ""}`}>
          <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded">
            <Bookmark size={16} />
          </span>
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            {ui.pageTitle}
          </span>
        </div>
      </div>

      {/* SELECT MODE VIEW */}
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
            {/* Flashcards */}
            <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
              <div>
                <span className="bg-blue-50 text-blue-600 text-xs font-bold px-2.5 py-1 rounded">
                  {ui.mode1}
                </span>
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
                  <span>{ui.allVocab}</span>
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

            {/* Meaning Quiz */}
            <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
              <div>
                <span className="bg-indigo-50 text-indigo-600 text-xs font-bold px-2.5 py-1 rounded">
                  {ui.mode2}
                </span>
                <h3 className="font-bold text-slate-800 text-base mt-3">{ui.meaningQuiz}</h3>
                <p className="text-xs text-gray-500 mt-1">
                  {ui.meaningQuizDesc}
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-50 space-y-2">
                <button
                  onClick={() => startSession("quiz", "all")}
                  className="w-full inline-flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  <span>{ui.allVocab}</span>
                  <ChevronRight className={isRtl ? "rotate-180" : ""} size={14} />
                </button>
                <button
                  onClick={() => startSession("quiz", "due")}
                  className="w-full inline-flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  <span>{ui.dueToday}</span>
                  <ChevronRight className={isRtl ? "rotate-180" : ""} size={14} />
                </button>
                <button
                  onClick={() => startSession("quiz", "difficult")}
                  className="w-full inline-flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  <span>{ui.difficult}</span>
                  <ChevronRight className={isRtl ? "rotate-180" : ""} size={14} />
                </button>
              </div>
            </div>

            {/* Writing Quiz */}
            <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
              <div>
                <span className="bg-emerald-50 text-emerald-600 text-xs font-bold px-2.5 py-1 rounded">
                  {ui.mode3}
                </span>
                <h3 className="font-bold text-slate-800 text-base mt-3">{ui.writingTest}</h3>
                <p className="text-xs text-gray-500 mt-1">
                  {ui.writingDesc}
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-50 space-y-2">
                <button
                  onClick={() => startSession("writing", "all")}
                  className="w-full inline-flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  <span>{ui.allVocab}</span>
                  <ChevronRight className={isRtl ? "rotate-180" : ""} size={14} />
                </button>
                <button
                  onClick={() => startSession("writing", "due")}
                  className="w-full inline-flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  <span>{ui.dueToday}</span>
                  <ChevronRight className={isRtl ? "rotate-180" : ""} size={14} />
                </button>
                <button
                  onClick={() => startSession("writing", "difficult")}
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

      {/* SESSION FINISHED VIEW */}
      {sessionFinished && (
        <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-100 shadow-xl max-w-lg mx-auto text-center space-y-6">
          <span className="p-3 bg-emerald-50 text-emerald-600 rounded-full inline-flex items-center justify-center">
            <Award size={36} />
          </span>
          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-black text-slate-800">{ui.trainingDone}</h2>
            <p className="text-xs text-gray-500 font-medium">{ui.sessionDone}</p>
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
      {!sessionFinished && mode !== "select" && currentItem && (
        <div className="space-y-6">
          {/* Progress bar */}
          <div className="flex items-center justify-between text-xs font-semibold text-gray-500">
            <span>
              {ui.word} {currentIndex + 1} {ui.of} {sessionList.length}
            </span>
            <span>{ui.correct}: {sessionCorrect} • {ui.wrong}: {sessionWrong}</span>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-blue-600 h-full transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / sessionList.length) * 100}%` }}
            />
          </div>

          {/* FLASHCARD MODE */}
          {mode === "flashcards" && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-md p-6 sm:p-8 flex flex-col justify-between min-h-[250px] relative space-y-4">
                <div className="flex justify-between items-start">
                    <div className={`flex items-center space-x-2 ${isRtl ? "space-x-reverse" : ""}`}>
                    <span className="bg-slate-100 text-slate-600 text-xs px-2.5 py-0.5 rounded font-semibold uppercase">
                      {currentItem.level}
                    </span>
                    <span className="bg-indigo-50 text-indigo-600 text-xs px-2.5 py-0.5 rounded font-semibold">
                      {getVocabularyTypeLabel(currentItem)}
                    </span>
                  </div>
                  <AudioButton text={currentDisplayTerm} speed={settings.speechSpeed} />
                </div>

                <div className="text-center py-4">
                  <h2 dir="ltr" lang="de" className="text-3xl font-extrabold text-slate-800 tracking-tight text-center">
                    {currentDisplayTerm}
                  </h2>

                  {(showAnswer || settings.showArabicImmediately) && (
                    <p dir="rtl" lang="ar" className="text-2xl font-bold text-blue-600 mt-4 font-arabic text-right">
                      {currentItem.arabic}
                    </p>
                  )}
                </div>

                {showAnswer && (
                  <div className="text-xs text-gray-500 flex flex-wrap gap-2 justify-center border-t border-slate-50 pt-3">
                    {getVocabMetaChips(currentItem).map((chip) => (
                      <span key={chip} className="bg-slate-50 border border-slate-100 text-slate-600 px-2 py-1 rounded text-[10px] font-bold">
                        {chip}
                      </span>
                    ))}
                  </div>
                )}

                {showAnswer && (currentDefaultExample.de || currentDefaultExample.ar) && (
                  <div className="mt-4 p-4 bg-blue-50/50 rounded-xl space-y-2">
                    {currentDefaultExample.de && (
                      <div className="flex items-center justify-between">
                        <p dir="ltr" lang="de" className="text-xs sm:text-sm font-semibold text-slate-800 text-left">
                          {currentDefaultExample.de}
                        </p>
                        <AudioButton
                          text={currentDefaultExample.de}
                          speed={settings.speechSpeed}
                          size={16}
                          className="p-1.5"
                        />
                      </div>
                    )}
                    {currentDefaultExample.ar && (
                      <p dir="rtl" lang="ar" className="text-xs sm:text-sm font-bold text-blue-600 font-arabic text-right">
                        {currentDefaultExample.ar}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Action buttons */}
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
                      className="flex-1 sm:flex-none inline-flex items-center justify-center px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md cursor-pointer"
                    >
                      <span>✓ {ui.knew}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* MEANING QUIZ MODE */}
          {mode === "quiz" && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-md p-6 sm:p-8 space-y-6">
                <div className="flex justify-between items-start">
                  <span className="bg-slate-100 text-slate-600 text-xs px-2.5 py-0.5 rounded uppercase font-semibold">
                    {currentItem.level}
                  </span>
                  <AudioButton text={currentDisplayTerm} speed={settings.speechSpeed} />
                </div>

                <div className="text-center py-2 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                    {ui.meaningGuess}
                  </span>
                  <h2 dir="ltr" lang="de" className="text-3xl font-extrabold text-slate-800 tracking-tight mt-3 text-center">
                    {quizQuestion?.promptDe || currentDisplayTerm}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {quizQuestion?.promptAr || ui.meaningQuestion}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                  {quizOptions.map((option, idx) => {
                    const isSelected = selectedChoice === option;
                    const isCorrectOption = option === quizQuestion?.answer;

                    let btnClass = "border-slate-200 hover:bg-slate-50 text-slate-800";
                    if (isSelected && !quizChecked) {
                      btnClass = "border-blue-500 bg-blue-50 text-blue-700 font-bold";
                    } else if (quizChecked) {
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
                        disabled={quizChecked}
                        onClick={() => setSelectedChoice(option)}
                        className={`w-full p-4 rounded-xl border text-sm font-medium transition-all text-right flex items-center justify-between cursor-pointer font-arabic ${btnClass}`}
                      >
                        <span dir="rtl" lang="ar" className="w-full text-right">{option}</span>
                        {quizChecked && isCorrectOption && (
                          <Check className="text-emerald-600 ml-2 shrink-0" size={16} />
                        )}
                        {quizChecked && isSelected && !isCorrectOption && (
                          <X className="text-rose-600 ml-2 shrink-0" size={16} />
                        )}
                      </button>
                    );
                  })}
                </div>

                {quizChecked && selectedChoice !== quizQuestion?.answer && (
                  <p dir="rtl" lang="ar" className="text-xs font-semibold text-slate-600 text-center font-arabic">
                    {ui.correctMeaning}: <span className="font-bold text-slate-800">{quizQuestion?.answer}</span>
                  </p>
                )}

                {quizChecked && (currentQuizExample.de || currentQuizExample.ar || quizQuestion?.noteAr) && (
                  <div className="p-4 bg-slate-50 rounded-xl space-y-1 mt-4">
                    {currentQuizExample.de && (
                      <div className="flex items-center justify-between">
                        <p dir="ltr" lang="de" className="text-xs sm:text-sm font-semibold text-slate-800 text-left">
                          {currentQuizExample.de}
                        </p>
                        <AudioButton text={currentQuizExample.de} speed={settings.speechSpeed} size={16} />
                      </div>
                    )}
                    {currentQuizExample.ar && (
                      <p dir="rtl" lang="ar" className="text-xs sm:text-sm font-bold text-blue-600 font-arabic text-right">
                        {currentQuizExample.ar}
                      </p>
                    )}
                    {quizQuestion?.noteAr && (
                      <p dir="rtl" lang="ar" className="text-xs font-semibold text-slate-600 font-arabic text-right">
                        {quizQuestion.noteAr}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-center">
                {!quizChecked ? (
                  <button
                    onClick={checkQuiz}
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
                    {ui.nextWord} <ChevronRight className={isRtl ? "mr-1 rotate-180" : "ml-1"} size={18} />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* WRITING QUIZ MODE */}
          {mode === "writing" && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-md p-6 sm:p-8 space-y-6">
                <div className="text-center py-4 space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
                    {ui.writingBadge}
                  </span>
                  <p className="text-xs text-gray-400">{ui.writePrompt}</p>
                  {writingQuestion?.promptAr && (
                    <h2 dir="rtl" lang="ar" className="text-2xl sm:text-3xl font-extrabold text-blue-600 font-arabic tracking-tight py-2 text-right">
                      {writingQuestion.promptAr}
                    </h2>
                  )}
                  {writingQuestion?.promptDe && (
                    <p dir="ltr" lang="de" className="text-xl font-extrabold text-slate-800 text-left">
                      {writingQuestion.promptDe}
                    </p>
                  )}
                  <div className="flex items-center justify-center space-x-2 text-xs text-gray-500">
                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-semibold uppercase">
                      {currentItem.level}
                    </span>
                    <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded font-semibold">
                      {getVocabularyTypeLabel(currentItem)}
                    </span>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500 block">
                    {ui.germanTerm}
                  </label>
                  <input
                    type="text"
                    autoFocus
                    disabled={writingChecked}
                    dir="ltr"
                    lang="de"
                    value={writingInput}
                    onChange={(e) => setWritingInput(e.target.value)}
                    placeholder={ui.genericGermanPlaceholder}
                    className={`w-full px-4 py-3 rounded-xl border text-sm font-semibold text-left focus:outline-none transition-all ${
                      writingChecked
                        ? writingQuestion && answersMatchAny(writingInput, writingQuestion)
                          ? "border-emerald-500 bg-emerald-50/50 text-emerald-900"
                          : "border-rose-500 bg-rose-50/50 text-rose-900"
                        : "border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    }`}
                  />

                  {writingChecked && (
                    <div className="rounded-xl bg-slate-50 p-4 border border-slate-100 space-y-2">
                      <div className="text-xs text-gray-500">{ui.correctWord}</div>
                      <div dir="ltr" lang="de" className="text-xl font-extrabold text-slate-800 flex items-center justify-between text-left">
                        <span>{writingQuestion?.answer || currentDisplayTerm}</span>
                        <AudioButton text={writingQuestion?.answer || currentDisplayTerm} speed={settings.speechSpeed} />
                      </div>
                    </div>
                  )}
                </div>

                {writingChecked && (currentWritingExample.de || currentWritingExample.ar || writingQuestion?.noteAr) && (
                  <div className="p-4 bg-blue-50/50 rounded-xl space-y-1 mt-4">
                    {currentWritingExample.de && (
                      <div className="flex items-center justify-between">
                        <p dir="ltr" lang="de" className="text-xs sm:text-sm font-semibold text-slate-800 text-left">
                          {currentWritingExample.de}
                        </p>
                        <AudioButton text={currentWritingExample.de} speed={settings.speechSpeed} size={16} />
                      </div>
                    )}
                    {currentWritingExample.ar && (
                      <p dir="rtl" lang="ar" className="text-xs sm:text-sm font-bold text-blue-600 font-arabic text-right">
                        {currentWritingExample.ar}
                      </p>
                    )}
                    {writingQuestion?.noteAr && (
                      <p dir="rtl" lang="ar" className="text-xs font-semibold text-slate-600 font-arabic text-right">
                        {writingQuestion.noteAr}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-center">
                {!writingChecked ? (
                  <button
                    onClick={checkWriting}
                    disabled={!writingInput.trim()}
                    className={`w-full sm:w-auto inline-flex items-center justify-center px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-colors ${
                      writingInput.trim()
                        ? "cursor-pointer"
                        : "opacity-50 cursor-not-allowed"
                    }`}
                  >
                    {ui.checkAnswer}
                  </button>
                ) : (
                  <button
                    onClick={handleNext}
                    className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md cursor-pointer"
                  >
                    {ui.nextWord} <ChevronRight className={isRtl ? "mr-1 rotate-180" : "ml-1"} size={18} />
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
