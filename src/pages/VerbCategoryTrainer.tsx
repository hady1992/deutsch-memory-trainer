import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Award, Check, ChevronRight, HelpCircle, RotateCw, X } from "lucide-react";
import AudioButton from "../components/AudioButton";
import { DataService } from "../services/dataService";
import { MistakeReviewService } from "../services/mistakeReviewService";
import { ProgressService } from "../services/progressService";
import {
  buildVerbCategoryQuestion,
  hasVerbCategoryTraining,
  VerbCategoryQuestion,
} from "../services/verbCategoryTrainingService";
import { answersMatch } from "../services/textDisplayService";
import { UserSettings, Verb, VerbCategory } from "../types";

interface VerbCategoryTrainerProps {
  onNavigate: (page: string) => void;
  settings: UserSettings;
}

function shuffle<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}

function categoryTitle(category: VerbCategory, isRtl: boolean) {
  return isRtl ? category.title_ar : category.title_de;
}

function firstString(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

function prepareQuestion(question: VerbCategoryQuestion | null, verb: Verb): VerbCategoryQuestion | null {
  if (!question) return null;
  const visibleText = firstString(question.visibleText || question.promptDe || question.promptAr || verb.infinitiv);
  return {
    ...question,
    options: question.options?.length ? shuffle(question.options) : question.options,
    visibleText,
    speakBeforeAnswer: firstString(question.speakBeforeAnswer || (question.answerLang === "de" ? verb.infinitiv : question.promptDe) || verb.infinitiv),
    correctAnswer: firstString(question.correctAnswer || question.answer),
    speakAfterAnswer: firstString(question.speakAfterAnswer || question.answer),
  };
}

export default function VerbCategoryTrainer({ onNavigate, settings }: VerbCategoryTrainerProps) {
  const [verbs, setVerbs] = useState<Verb[]>([]);
  const [categories, setCategories] = useState<VerbCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [sessionVerbs, setSessionVerbs] = useState<Verb[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [question, setQuestion] = useState<VerbCategoryQuestion | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [writtenAnswer, setWrittenAnswer] = useState("");
  const [checked, setChecked] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(true);
  const isRtl = settings.language === "ar";

  const ui = isRtl
    ? {
        dashboard: "لوحة التحكم",
        title: "تدريب فئات الأفعال",
        badge: "فئات الأفعال",
        loading: "جاري التحميل...",
        empty: "لا توجد أفعال مناسبة لتدريب الفئات.",
        allCategories: "كل الفئات",
        categoryFilter: "فلتر الفئة",
        question: "سؤال الفئة",
        hint: "تلميح",
        check: "تحقق من الإجابة",
        next: "الفعل التالي",
        correct: "صحيح",
        wrong: "خطأ",
        correctAnswer: "الإجابة الصحيحة",
        example: "مثال",
        note: "ملاحظة",
        done: "انتهى التدريب!",
        repeat: "إعادة التدريب",
        item: "فعل",
        of: "من",
        writeAnswer: "اكتب الإجابة",
      }
    : {
        dashboard: "Dashboard",
        title: "Verb Category Training",
        badge: "Verb categories",
        loading: "Loading...",
        empty: "No suitable verbs for category training.",
        allCategories: "All categories",
        categoryFilter: "Category filter",
        question: "Category question",
        hint: "Hint",
        check: "Check answer",
        next: "Next verb",
        correct: "Correct",
        wrong: "Wrong",
        correctAnswer: "Correct answer",
        example: "Example",
        note: "Note",
        done: "Training finished!",
        repeat: "Repeat",
        item: "Verb",
        of: "of",
        writeAnswer: "Write the answer",
      };

  const eligibleVerbs = useMemo(() => {
    const trained = verbs.filter(hasVerbCategoryTraining);
    if (!selectedCategoryId) return trained;
    return trained.filter((verb) => verb.categoryIds?.includes(selectedCategoryId));
  }, [selectedCategoryId, verbs]);

  const currentVerb = sessionVerbs[currentIndex];
  const currentAnswer = question?.options?.length ? selectedChoice || "" : writtenAnswer;
  const isCorrect = question ? answersMatch(currentAnswer, question.answer) : false;

  const setupQuestion = (list: Verb[], index: number) => {
    const verb = list[index];
    if (!verb) {
      setFinished(true);
      return;
    }
    setQuestion(
      prepareQuestion(
        buildVerbCategoryQuestion(
          verb,
          verbs,
          categories,
          selectedCategoryId || null,
          settings.language || "de"
        ),
        verb
      )
    );
    setSelectedChoice(null);
    setWrittenAnswer("");
    setChecked(false);
  };

  const startSession = (sourceVerbs: Verb[] = eligibleVerbs) => {
    const limit = settings.questionsPerSession || 10;
    const list = shuffle(sourceVerbs).slice(0, limit);
    setSessionVerbs(list);
    setCurrentIndex(0);
    setCorrectCount(0);
    setWrongCount(0);
    setFinished(false);
    setupQuestion(list, 0);
  };

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      const [loadedVerbs, loadedCategories] = await Promise.all([
        DataService.getVerbs(),
        DataService.getVerbCategories(),
      ]);
      if (!mounted) return;
      setVerbs(loadedVerbs);
      setCategories(loadedCategories);
      setLoading(false);
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!loading && verbs.length) {
      startSession(eligibleVerbs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, selectedCategoryId, verbs]);

  const checkAnswer = () => {
    if (!question || !currentVerb || !currentAnswer.trim()) return;
    const correct = answersMatch(currentAnswer, question.answer);
    ProgressService.recordReview(`verb-${currentVerb.id}`, correct);

    if (correct) {
      setCorrectCount((prev) => prev + 1);
    } else {
      setWrongCount((prev) => prev + 1);
      MistakeReviewService.recordMistake({
        id: `mistake-verb-category-${currentVerb.id}-${question.id}`,
        itemKey: `verb-${currentVerb.id}`,
        type: "verb",
        mode: question.options?.length ? "verb-multiple-choice" : "verb-writing",
        sourceType: "verb_category",
        categoryId: question.categoryId,
        choices: question.options,
        answerLang: question.answerLang,
        example_de: question.exampleDe,
        example_ar: question.exampleAr,
        note_ar: question.noteAr,
        itemId: currentVerb.id,
        infinitiv: currentVerb.infinitiv,
        arabic: currentVerb.arabic,
        questionText: question.promptAr || question.promptDe || ui.question,
        correctAnswer: question.correctAnswer || question.answer,
        userAnswer: currentAnswer,
      });
    }

    setChecked(true);
  };

  const nextQuestion = () => {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= sessionVerbs.length) {
      setFinished(true);
      return;
    }
    setCurrentIndex(nextIndex);
    setupQuestion(sessionVerbs, nextIndex);
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 text-center text-sm font-bold text-slate-500">
        {ui.loading}
      </div>
    );
  }

  if (!eligibleVerbs.length) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-6" dir={isRtl ? "rtl" : "ltr"}>
        <button onClick={() => onNavigate("dashboard")} className="inline-flex items-center text-xs uppercase tracking-wider font-bold text-slate-500 hover:text-slate-800">
          <ArrowLeft className={`${isRtl ? "ml-1.5 rotate-180" : "mr-1.5"}`} size={16} /> {ui.dashboard}
        </button>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center">
          <HelpCircle className="mx-auto text-slate-300 mb-3" size={34} />
          <h2 className="font-black text-slate-800">{ui.title}</h2>
          <p className="text-sm text-slate-500 mt-2">{ui.empty}</p>
        </div>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-6" dir={isRtl ? "rtl" : "ltr"}>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center">
          <Award className="mx-auto text-amber-500 mb-3" size={42} />
          <h2 className="text-2xl font-black text-slate-800">{ui.done}</h2>
          <div className="flex justify-center gap-3 mt-5 text-sm font-bold">
            <span className="text-emerald-600">{ui.correct}: {correctCount}</span>
            <span className="text-rose-600">{ui.wrong}: {wrongCount}</span>
          </div>
          <button
            onClick={() => startSession()}
            className="mt-6 inline-flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl shadow-md cursor-pointer"
          >
            <RotateCw className={isRtl ? "ml-2" : "mr-2"} size={16} /> {ui.repeat}
          </button>
        </div>
      </div>
    );
  }

  if (!currentVerb || !question) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-6" dir={isRtl ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <button
          onClick={() => onNavigate("dashboard")}
          className="inline-flex items-center text-xs uppercase tracking-wider font-bold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className={`${isRtl ? "ml-1.5 rotate-180" : "mr-1.5"}`} size={16} /> {ui.dashboard}
        </button>
        <div className="text-xs font-black text-slate-500 uppercase">
          {ui.item} {currentIndex + 1} {ui.of} {sessionVerbs.length}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
        <h1 className="text-xl font-black text-slate-900">{ui.title}</h1>
        <label className="flex items-center gap-2 text-xs font-bold text-slate-500">
          <span>{ui.categoryFilter}</span>
          <select
            value={selectedCategoryId}
            onChange={(event) => setSelectedCategoryId(event.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg bg-white text-xs font-bold text-slate-700 focus:outline-none"
          >
            <option value="">{ui.allCategories}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {categoryTitle(category, isRtl)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-md p-6 sm:p-8 space-y-6">
        <div className="flex justify-between items-start gap-4">
          <span className="bg-amber-50 text-amber-700 text-xs px-2.5 py-0.5 rounded uppercase font-semibold">
            {ui.badge}
          </span>
          {question.speakBeforeAnswer && <AudioButton text={question.speakBeforeAnswer} speed={settings.speechSpeed} />}
        </div>

        <div className="text-center py-2 space-y-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-3 py-1 rounded-full">
            {ui.question}
          </span>
          <h2 dir="ltr" lang="de" className="text-3xl font-extrabold text-slate-800 tracking-tight mt-3 text-center">
            {currentVerb.infinitiv}
          </h2>
          {question.promptAr && (
            <p dir="rtl" lang="ar" className="text-sm sm:text-base font-bold text-slate-700 font-arabic text-right">
              {question.promptAr}
            </p>
          )}
          {question.promptDe && (
            <p dir="ltr" lang="de" className="text-sm font-semibold text-slate-500 text-left">
              {question.promptDe}
            </p>
          )}
          {question.hintAr && !checked && (
            <p dir="rtl" lang="ar" className="text-xs font-semibold text-blue-600 font-arabic text-right">
              {ui.hint}: {question.hintAr}
            </p>
          )}
        </div>

        {question.options?.length ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
            {question.options.map((option, idx) => {
              const selected = selectedChoice === option;
              const correctOption = answersMatch(option, question.answer);
              let btnClass = "border-slate-200 hover:bg-slate-50 text-slate-800";
              if (selected && !checked) {
                btnClass = "border-blue-500 bg-blue-50 text-blue-700 font-bold";
              } else if (checked) {
                if (correctOption) btnClass = "border-emerald-500 bg-emerald-50 text-emerald-800 font-bold";
                else if (selected) btnClass = "border-rose-500 bg-rose-50 text-rose-800 font-bold";
                else btnClass = "border-slate-100 text-slate-400 opacity-60";
              }

              return (
                <button
                  key={`${option}-${idx}`}
                  disabled={checked}
                  onClick={() => setSelectedChoice(option)}
                  className={`w-full p-4 rounded-xl border text-sm font-medium transition-all flex items-center justify-between cursor-pointer ${
                    question.answerLang === "ar" ? "text-right" : "text-left"
                  } ${btnClass}`}
                >
                  <span
                    dir={question.answerLang === "ar" ? "rtl" : "ltr"}
                    lang={question.answerLang}
                    className={question.answerLang === "ar" ? "font-arabic text-right w-full" : "w-full text-left"}
                  >
                    {option}
                  </span>
                  {checked && correctOption && <Check className="text-emerald-600 ml-2" size={16} />}
                  {checked && selected && !correctOption && <X className="text-rose-600 ml-2" size={16} />}
                </button>
              );
            })}
          </div>
        ) : (
          <input
            type="text"
            disabled={checked}
            dir={question.answerLang === "ar" ? "rtl" : "ltr"}
            lang={question.answerLang}
            value={writtenAnswer}
            onChange={(event) => setWrittenAnswer(event.target.value)}
            placeholder={ui.writeAnswer}
            className={`w-full px-4 py-3 rounded-xl border text-sm font-medium focus:outline-none transition-all ${
              question.answerLang === "ar" ? "text-right font-arabic" : "text-left"
            } ${
              checked
                ? isCorrect
                  ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                  : "bg-rose-50 border-rose-300 text-rose-800"
                : "border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            }`}
          />
        )}

        {checked && !isCorrect && (
          <div className="flex items-center justify-center gap-2 text-xs font-semibold text-slate-600 text-center">
            <span>
              {ui.correctAnswer}:{" "}
              <span dir={question.answerLang === "ar" ? "rtl" : "ltr"} lang={question.answerLang} className="font-bold text-slate-800">
                {question.correctAnswer || question.answer}
              </span>
            </span>
            {question.answerLang === "de" && question.speakAfterAnswer && (
              <AudioButton text={question.speakAfterAnswer} speed={settings.speechSpeed} size={14} />
            )}
          </div>
        )}

        {checked && (question.exampleDe || question.exampleAr || question.noteAr) && (
          <div className="p-4 bg-slate-50 rounded-xl space-y-2 mt-4">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">
              {ui.example}
            </div>
            {question.exampleDe && (
              <div className="flex items-center justify-between gap-3">
                <p dir="ltr" lang="de" className="text-xs sm:text-sm font-semibold text-slate-800 text-left">
                  {question.exampleDe}
                </p>
                <AudioButton text={question.exampleDe} speed={settings.speechSpeed} size={16} />
              </div>
            )}
            {question.exampleAr && (
              <p dir="rtl" lang="ar" className="text-xs sm:text-sm font-bold text-blue-600 font-arabic text-right">
                {question.exampleAr}
              </p>
            )}
            {question.noteAr && (
              <p dir="rtl" lang="ar" className="text-xs font-semibold text-slate-600 font-arabic text-right">
                {ui.note}: {question.noteAr}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-center">
        {!checked ? (
          <button
            onClick={checkAnswer}
            disabled={!currentAnswer.trim()}
            className={`w-full sm:w-auto inline-flex items-center justify-center px-8 py-3 font-bold rounded-xl shadow-md transition-colors ${
              currentAnswer.trim()
                ? "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                : "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
            }`}
          >
            {ui.check}
          </button>
        ) : (
          <button
            onClick={nextQuestion}
            className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md cursor-pointer"
          >
            {ui.next} <ChevronRight className={isRtl ? "mr-1 rotate-180" : "ml-1"} size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
