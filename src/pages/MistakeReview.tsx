import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, Play, Target, Trash2 } from "lucide-react";
import { DataService } from "../services/dataService";
import { MistakeRecord, MistakeReviewService } from "../services/mistakeReviewService";
import { answersMatch, getTenseExample, normalizeGermanText } from "../services/textDisplayService";
import { generateTenseChoiceOptions } from "../services/tenseChoiceService";
import { generateVerbChoiceOptions, VerbChoiceQuestionType } from "../services/verbChoiceService";
import { getVocabularyFullTerm } from "../services/vocabularyTrainingService";
import { UserSettings, Verb, Vocabulary } from "../types";
import AudioButton from "../components/AudioButton";

interface MistakeReviewProps {
  onNavigate: (page: string) => void;
  settings: UserSettings;
}

const TENSE_LABELS: Record<string, string> = {
  praesens: "Präsens",
  praeteritum: "Präteritum",
  perfekt: "Perfekt",
  plusquamperfekt: "Plusquamperfekt",
  futur1: "Futur I",
  futur2: "Futur II",
};

type FilterType = "all" | "verb" | "vocabulary" | "tense" | "unresolved" | "resolved";

function formatDate(value?: string) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function getVerbQuestionType(mistake: MistakeRecord): VerbChoiceQuestionType {
  if (mistake.targetTense === "praeteritum") return "praeteritum";
  if (mistake.targetTense === "perfekt") return "perfekt";
  if (mistake.targetTense === "praesens") return "praesens";
  return "arabic";
}

function uniqueOptions(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function safeText(value: unknown, fallback = "-"): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function getMistakeMode(mistake?: MistakeRecord): string {
  return String(mistake?.mode || mistake?.sourceType || "");
}

function modeIncludes(mistake: MistakeRecord | undefined, value: string): boolean {
  return getMistakeMode(mistake).includes(value);
}

function getMistakeAnswerLang(mistake: MistakeRecord): "de" | "ar" {
  if (mistake.answerLang) return mistake.answerLang;
  return mistake.type === "vocabulary" && modeIncludes(mistake, "multiple-choice") ? "ar" : "de";
}

function isArabicAnswer(mistake: MistakeRecord) {
  return getMistakeAnswerLang(mistake) === "ar";
}

function getMistakeTitle(mistake: MistakeRecord, verb?: Verb, vocab?: Vocabulary): string {
  return safeText(
    mistake.infinitiv ||
      mistake.term ||
      verb?.infinitiv ||
      (vocab ? getVocabularyFullTerm(vocab) : "") ||
      mistake.arabic ||
      mistake.questionText
  );
}

function isVerbRelatedMistake(mistake?: MistakeRecord): boolean {
  const type = String(mistake?.type || "");
  const source = String(mistake?.sourceType || "");
  return type === "verb" || type === "tense" || source === "verb_category" || type === "verb_category";
}

function isTenseRelatedMistake(mistake?: MistakeRecord): boolean {
  return String(mistake?.type || "") === "tense" || String(mistake?.sourceType || "") === "tense";
}

function isPureVerbMistake(mistake?: MistakeRecord): boolean {
  const type = String(mistake?.type || "");
  const source = String(mistake?.sourceType || "");
  return !isTenseRelatedMistake(mistake) && (type === "verb" || type === "verb_category" || source === "verb_category" || source === "verb");
}

function isVocabularyRelatedMistake(mistake?: MistakeRecord): boolean {
  return !isPureVerbMistake(mistake) && !isTenseRelatedMistake(mistake);
}

export default function MistakeReview({ onNavigate, settings }: MistakeReviewProps) {
  const isRtl = settings.language === "ar";
  const [mistakes, setMistakes] = useState<MistakeRecord[]>([]);
  const [verbs, setVerbs] = useState<Verb[]>([]);
  const [vocab, setVocab] = useState<Vocabulary[]>([]);
  const [filter, setFilter] = useState<FilterType>("unresolved");
  const [practiceList, setPracticeList] = useState<MistakeRecord[]>([]);
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [writtenAnswer, setWrittenAnswer] = useState("");
  const [checked, setChecked] = useState(false);
  const [sessionDone, setSessionDone] = useState(false);

  const ui = isRtl
    ? {
        dashboard: "لوحة التحكم",
        title: "مراجعة أخطائك",
        subtitle: "راجع الأسئلة المحددة التي أخطأت بها، وليس فقط العناصر الصعبة عموماً.",
        start: "ابدأ مراجعة أخطائك",
        total: "إجمالي الأخطاء",
        verbMistakes: "أخطاء الأفعال",
        vocabMistakes: "أخطاء المفردات",
        tenseMistakes: "أخطاء الأزمنة",
        resolved: "أخطاء تم حلّها",
        all: "الكل",
        verbs: "أفعال",
        vocabulary: "مفردات",
        tenses: "أزمنة",
        unresolved: "غير محلولة",
        resolvedFilter: "محلولة",
        yourAnswer: "إجابتك",
        correct: "الصحيح",
        wrongCount: "عدد الأخطاء",
        lastWrong: "آخر خطأ",
        trainNow: "تدرب عليه الآن",
        markResolved: "تعليم كمحلول",
        delete: "حذف من المراجعة",
        checkAnswer: "تحقق من الإجابة",
        next: "التالي",
        done: "انتهت مراجعة الأخطاء",
        noMistakes: "لا توجد أخطاء مطابقة لهذا الفلتر.",
        verb: "الفعل",
        word: "الكلمة",
        tense: "الزمن",
        pronoun: "الضمير",
        question: "السؤال",
        meaning: "المعنى",
      }
    : {
        dashboard: "Dashboard",
        title: "Mistake Review",
        subtitle: "Review the exact questions you answered incorrectly.",
        start: "Start mistake review",
        total: "Total mistakes",
        verbMistakes: "Verb mistakes",
        vocabMistakes: "Vocabulary mistakes",
        tenseMistakes: "Tense mistakes",
        resolved: "Resolved mistakes",
        all: "All",
        verbs: "Verbs",
        vocabulary: "Vocabulary",
        tenses: "Tenses",
        unresolved: "Unresolved",
        resolvedFilter: "Resolved",
        yourAnswer: "Your answer",
        correct: "Correct",
        wrongCount: "Wrong count",
        lastWrong: "Last wrong",
        trainNow: "Practice now",
        markResolved: "Mark resolved",
        delete: "Delete from review",
        checkAnswer: "Check answer",
        next: "Next",
        done: "Mistake review complete",
        noMistakes: "No mistakes match this filter.",
        verb: "Verb",
        word: "Word",
        tense: "Tense",
        pronoun: "Pronoun",
        question: "Question",
        meaning: "Meaning",
      };

  const getTypeLabel = (mistake: MistakeRecord) => {
    const source = safeText(mistake.sourceType || mistake.type || mistake.mode, "vocabulary");
    const labels: Record<string, string> = isRtl
      ? {
          verb: ui.verbs,
          tense: ui.tenses,
          vocabulary: ui.vocabulary,
          vocabulary_v3: ui.vocabulary,
          verb_category: "تدريب فئات الأفعال",
          article: "مدرب الأرتيكل",
          plural: "مدرب المفرد والجمع",
          noun: "الأسماء",
          adjective: "مدرب الصفات",
          phrase: "مدرب العبارات",
          other: "المفردات العامة",
        }
      : {
          verb: ui.verbs,
          tense: ui.tenses,
          vocabulary: ui.vocabulary,
          vocabulary_v3: ui.vocabulary,
          verb_category: "Verb categories",
          article: "Article trainer",
          plural: "Plural trainer",
          noun: "Nouns",
          adjective: "Adjectives",
          phrase: "Phrases",
          other: "General vocabulary",
        };
    return labels[source] || source;
  };

  const reloadMistakes = () => setMistakes(MistakeReviewService.getMistakes());

  useEffect(() => {
    async function loadData() {
      const [verbData, vocabData] = await Promise.all([DataService.getVerbs(), DataService.getVocabulary()]);
      setVerbs(verbData);
      setVocab(vocabData);
      reloadMistakes();
    }
    loadData();
  }, []);

  const summary = useMemo(() => ({
    total: mistakes.length,
    verbs: mistakes.filter(isPureVerbMistake).length,
    vocabulary: mistakes.filter(isVocabularyRelatedMistake).length,
    tenses: mistakes.filter(isTenseRelatedMistake).length,
    resolved: mistakes.filter((m) => m.resolved).length,
  }), [mistakes]);

  const filteredMistakes = mistakes.filter((mistake) => {
    if (filter === "unresolved") return !mistake.resolved;
    if (filter === "resolved") return mistake.resolved;
    if (filter === "all") return true;
    if (filter === "verb") return isPureVerbMistake(mistake);
    if (filter === "vocabulary") return isVocabularyRelatedMistake(mistake);
    if (filter === "tense") return isTenseRelatedMistake(mistake);
    return mistake.type === filter;
  });

  const currentMistake = practiceList[practiceIndex];
  const currentVerb = isVerbRelatedMistake(currentMistake)
    ? verbs.find((verb) => String(verb.id) === String(currentMistake.itemId))
    : undefined;
  const currentVocab = currentMistake && !isVerbRelatedMistake(currentMistake)
    ? vocab.find((item) => String(item.id) === String(currentMistake.itemId))
    : undefined;

  const isChoiceQuestion = Boolean(currentMistake && (
    currentMistake.choices?.length ||
    modeIncludes(currentMistake, "multiple-choice") ||
    getMistakeMode(currentMistake) === "quick-practice"
  ));

  const choiceOptions = useMemo(() => {
    if (!currentMistake || !isChoiceQuestion) return [];
    if (currentMistake.choices?.length) {
      return uniqueOptions([...currentMistake.choices, safeText(currentMistake.correctAnswer)].map((value) => safeText(value, "")));
    }
    if (currentMistake.type === "tense" && currentVerb && currentMistake.targetTense && currentMistake.pronoun) {
      return generateTenseChoiceOptions(currentVerb, verbs, currentMistake.targetTense, currentMistake.pronoun);
    }
    if (currentMistake.type === "verb" && currentVerb) {
      return generateVerbChoiceOptions(currentVerb, verbs, getVerbQuestionType(currentMistake));
    }
    if (currentMistake.type === "vocabulary") {
      const options = [
        safeText(currentMistake.correctAnswer),
        ...vocab
          .filter((item) => item.id !== currentMistake.itemId)
          .filter((item) => !currentVocab?.type || item.type === currentVocab.type)
          .map((item) => modeIncludes(currentMistake, "writing") ? getVocabularyFullTerm(item) : item.arabic)
          .filter(Boolean)
          .slice(0, 6),
      ];
      return uniqueOptions(options).sort(() => Math.random() - 0.5).slice(0, 4);
    }
    return [];
  }, [currentMistake?.id, isChoiceQuestion, verbs, vocab]);

  const currentAnswer = isChoiceQuestion ? selectedChoice || "" : writtenAnswer;
  const isCorrect = currentMistake
    ? currentMistake.type === "vocabulary" && modeIncludes(currentMistake, "multiple-choice")
      ? currentAnswer === safeText(currentMistake.correctAnswer)
      : answersMatch(currentAnswer, safeText(currentMistake.correctAnswer))
    : false;

  const currentExample = currentMistake?.example_de || currentMistake?.example_ar
    ? {
        de: normalizeGermanText(currentMistake.example_de),
        ar: currentMistake.example_ar || "",
      }
    : currentMistake?.type !== "vocabulary" && currentVerb
    ? getTenseExample(currentVerb, currentMistake.targetTense || "praesens")
    : {
        de: normalizeGermanText(currentVocab?.example_de),
        ar: currentVocab?.example_ar || "",
      };

  const startPractice = (items = MistakeReviewService.getUnresolvedMistakes()) => {
    setPracticeList(items);
    setPracticeIndex(0);
    setSelectedChoice(null);
    setWrittenAnswer("");
    setChecked(false);
    setSessionDone(items.length === 0);
  };

  const exitPractice = () => {
    setPracticeList([]);
    setSessionDone(false);
    reloadMistakes();
  };

  const checkCurrentAnswer = () => {
    if (!currentMistake || !currentAnswer.trim()) return;
    MistakeReviewService.recordReviewResult(currentMistake.id, isCorrect, currentAnswer, currentMistake.itemKey);
    setChecked(true);
    reloadMistakes();
  };

  const nextPractice = () => {
    const nextIndex = practiceIndex + 1;
    if (nextIndex >= practiceList.length) {
      setSessionDone(true);
      return;
    }
    setPracticeIndex(nextIndex);
    setSelectedChoice(null);
    setWrittenAnswer("");
    setChecked(false);
  };

  const resolveMistake = (id: string) => {
    MistakeReviewService.markResolved(id);
    reloadMistakes();
  };

  const deleteMistake = (id: string) => {
    MistakeReviewService.deleteMistake(id);
    reloadMistakes();
  };

  if (practiceList.length > 0 || sessionDone) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 space-y-6" dir={isRtl ? "rtl" : "ltr"}>
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <button
            onClick={exitPractice}
            className="inline-flex items-center text-xs uppercase tracking-wider font-bold text-slate-500 hover:text-slate-800 transition-colors"
          >
            <ArrowLeft className={`${isRtl ? "ml-1.5 rotate-180" : "mr-1.5"}`} size={16} />
            {ui.title}
          </button>
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">{ui.title}</span>
        </div>

        {sessionDone ? (
          <div className="bg-white rounded-2xl p-8 border border-slate-100 shadow-sm text-center space-y-4">
            <Check className="mx-auto text-emerald-600" size={34} />
            <h2 className="text-xl font-black text-slate-800">{ui.done}</h2>
            <button
              onClick={exitPractice}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold uppercase tracking-wider rounded-lg cursor-pointer"
            >
              {ui.title}
            </button>
          </div>
        ) : currentMistake && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-md p-6 sm:p-8 space-y-6">
            <div className="flex justify-between items-start">
              <span className="bg-rose-50 text-rose-700 text-xs px-2.5 py-0.5 rounded uppercase font-semibold">
                {getTypeLabel(currentMistake)}
              </span>
              <span className="text-xs text-slate-400 font-bold">
                {practiceIndex + 1}/{practiceList.length}
              </span>
            </div>

            <div className="space-y-2 text-center">
              <h2 dir="ltr" lang="de" className="text-3xl font-extrabold text-slate-800 text-center">
                {getMistakeTitle(currentMistake, currentVerb, currentVocab)}
              </h2>
              {currentMistake.arabic && (
                <p dir="rtl" lang="ar" className="text-lg font-bold text-blue-600 font-arabic text-right">
                  {currentMistake.arabic}
                </p>
              )}
              <p className="text-xs font-bold text-slate-500">{safeText(currentMistake.questionText)}</p>
            </div>

            {isChoiceQuestion ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {choiceOptions.map((option, index) => {
                  const optionCorrect = currentMistake.type === "vocabulary" && modeIncludes(currentMistake, "multiple-choice")
                    ? option === safeText(currentMistake.correctAnswer)
                    : answersMatch(option, safeText(currentMistake.correctAnswer));
                  const selected = selectedChoice === option;
                  let btnClass = "border-slate-200 hover:bg-slate-50 text-slate-800";
                  if (selected && !checked) btnClass = "border-blue-500 bg-blue-50 text-blue-700 font-bold";
                  if (checked) {
                    if (optionCorrect) btnClass = "border-emerald-500 bg-emerald-50 text-emerald-800 font-bold";
                    else if (selected) btnClass = "border-rose-500 bg-rose-50 text-rose-800 font-bold";
                    else btnClass = "border-slate-100 text-slate-400 opacity-60";
                  }
                  return (
                    <button
                      key={`${option}-${index}`}
                      disabled={checked}
                      onClick={() => setSelectedChoice(option)}
                      className={`p-4 rounded-xl border text-sm font-semibold transition-all cursor-pointer ${btnClass}`}
                    >
                      <span
                        dir={isArabicAnswer(currentMistake) ? "rtl" : "ltr"}
                        lang={getMistakeAnswerLang(currentMistake)}
                        className={isArabicAnswer(currentMistake) ? "block text-right" : "block text-left"}
                      >
                        {option}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <input
                type="text"
                dir={currentMistake.sourceType && isArabicAnswer(currentMistake) ? "rtl" : "ltr"}
                lang={currentMistake.sourceType ? getMistakeAnswerLang(currentMistake) : "de"}
                disabled={checked}
                value={writtenAnswer}
                onChange={(e) => setWrittenAnswer(e.target.value)}
                className={`w-full px-4 py-3 rounded-xl border text-sm font-semibold focus:outline-none ${
                  currentMistake.sourceType && isArabicAnswer(currentMistake) ? "text-right font-arabic" : "text-left"
                } ${
                  checked
                    ? isCorrect
                      ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                      : "bg-rose-50 border-rose-300 text-rose-800"
                    : "border-slate-200 focus:border-blue-500"
                }`}
              />
            )}

            {checked && (
              <div className="space-y-3">
                {!isCorrect && (
                  <p className="text-xs font-semibold text-slate-600 text-center">
                    {ui.correct}:{" "}
                    <span
                      dir={isArabicAnswer(currentMistake) ? "rtl" : "ltr"}
                      lang={isArabicAnswer(currentMistake) ? "ar" : "de"}
                      className="font-bold text-slate-900"
                    >
                      {safeText(currentMistake.correctAnswer)}
                    </span>
                  </p>
                )}
                {(currentExample.de || currentExample.ar) && (
                  <div className="p-4 bg-slate-50 rounded-xl space-y-2">
                    {currentExample.de && (
                      <div className="flex items-center justify-between gap-3">
                        <p dir="ltr" lang="de" className="text-xs sm:text-sm font-semibold text-slate-800 text-left">
                          {currentExample.de}
                        </p>
                        <AudioButton text={currentExample.de} speed={settings.speechSpeed} size={16} />
                      </div>
                    )}
                    {currentExample.ar && (
                      <p dir="rtl" lang="ar" className="text-xs sm:text-sm font-bold text-blue-600 font-arabic text-right">
                        {currentExample.ar}
                      </p>
                    )}
                    {currentMistake.note_ar && (
                      <p dir="rtl" lang="ar" className="text-xs font-semibold text-slate-600 font-arabic text-right">
                        {currentMistake.note_ar}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-center">
              {!checked ? (
                <button
                  onClick={checkCurrentAnswer}
                  disabled={!currentAnswer.trim()}
                  className={`px-8 py-3 text-xs font-bold uppercase tracking-wider rounded-xl shadow-md ${
                    currentAnswer.trim()
                      ? "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                      : "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
                  }`}
                >
                  {ui.checkAnswer}
                </button>
              ) : (
                <button
                  onClick={nextPractice}
                  className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-md cursor-pointer"
                >
                  {ui.next}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-6" dir={isRtl ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <button
          onClick={() => onNavigate("dashboard")}
          className="inline-flex items-center text-xs uppercase tracking-wider font-bold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className={`${isRtl ? "ml-1.5 rotate-180" : "mr-1.5"}`} size={16} />
          {ui.dashboard}
        </button>
        <div className={`flex items-center space-x-2 ${isRtl ? "space-x-reverse" : ""}`}>
          <AlertTriangle className="text-rose-600" size={18} />
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">{ui.title}</span>
        </div>
      </div>

      <div className="text-center max-w-lg mx-auto">
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-800 tracking-tight">{ui.title}</h1>
        <p className="text-xs text-gray-500 mt-2">{ui.subtitle}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: ui.total, value: summary.total },
          { label: ui.verbMistakes, value: summary.verbs },
          { label: ui.vocabMistakes, value: summary.vocabulary },
          { label: ui.tenseMistakes, value: summary.tenses },
          { label: ui.resolved, value: summary.resolved },
        ].map((card) => (
          <div key={card.label} className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">{card.label}</p>
            <h3 className="text-xl font-black text-slate-800">{card.value}</h3>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-slate-50 p-4 rounded-xl">
        <div className="flex flex-wrap gap-2">
          {[
            ["all", ui.all],
            ["verb", ui.verbs],
            ["vocabulary", ui.vocabulary],
            ["tense", ui.tenses],
            ["unresolved", ui.unresolved],
            ["resolved", ui.resolvedFilter],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id as FilterType)}
              className={`px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border cursor-pointer ${
                filter === id
                  ? "bg-blue-600 border-blue-600 text-white"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => startPractice()}
          disabled={MistakeReviewService.getUnresolvedMistakes().length === 0}
          className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-100 disabled:text-gray-400 text-white font-bold text-xs uppercase tracking-wider rounded-lg shadow transition-colors cursor-pointer"
        >
          <Play className={isRtl ? "ml-1.5" : "mr-1.5"} size={14} />
          {ui.start}
        </button>
      </div>

      <div className="space-y-3">
        {filteredMistakes.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-100 p-8 text-center text-xs text-gray-400">
            {isRtl ? "لا توجد أخطاء محفوظة حاليًا." : ui.noMistakes}
          </div>
        ) : (
          filteredMistakes.map((mistake, index) => (
            <div key={mistake.id || `mistake-${index}`} className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className="bg-slate-100 text-slate-600 text-[10px] px-2 py-0.5 rounded font-bold uppercase">
                      {getTypeLabel(mistake)}
                    </span>
                    {mistake.resolved && (
                      <span className="bg-emerald-50 text-emerald-700 text-[10px] px-2 py-0.5 rounded font-bold uppercase">
                        {ui.resolvedFilter}
                      </span>
                    )}
                  </div>
                  <h3 dir="ltr" lang="de" className="text-base font-black text-slate-900 text-left">
                    {getMistakeTitle(mistake)}
                  </h3>
                  {mistake.arabic && (
                    <p dir="rtl" lang="ar" className="text-xs font-bold text-blue-600 font-arabic text-right">
                      {mistake.arabic}
                    </p>
                  )}
                </div>
                <div className={`flex gap-2 ${isRtl ? "sm:justify-end" : "sm:justify-start"}`}>
                  <button onClick={() => startPractice([mistake])} title={ui.trainNow} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer">
                    <Target size={16} />
                  </button>
                  <button onClick={() => resolveMistake(mistake.id)} title={ui.markResolved} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg cursor-pointer">
                    <Check size={16} />
                  </button>
                  <button onClick={() => deleteMistake(mistake.id)} title={ui.delete} className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-50 rounded-lg p-3">
                  <span className="font-bold text-slate-500">{ui.question}: </span>
                  <span className="font-semibold text-slate-800">{safeText(mistake.questionText)}</span>
                </div>
                {(mistake.targetTense || mistake.pronoun) && (
                  <div className="bg-slate-50 rounded-lg p-3">
                    {mistake.targetTense && <span className="font-bold text-slate-700">{ui.tense}: {TENSE_LABELS[mistake.targetTense] || mistake.targetTense} </span>}
                    {mistake.pronoun && <span className="font-bold text-slate-700">{ui.pronoun}: {mistake.pronoun}</span>}
                  </div>
                )}
                <div className="bg-rose-50 rounded-lg p-3">
                  <span className="font-bold text-rose-700">{ui.yourAnswer}: </span>
                  <span
                    dir={isArabicAnswer(mistake) ? "rtl" : "ltr"}
                    lang={isArabicAnswer(mistake) ? "ar" : "de"}
                    className="font-semibold text-rose-900"
                  >
                    {mistake.userAnswer || "-"}
                  </span>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3">
                  <span className="font-bold text-emerald-700">{ui.correct}: </span>
                  <span
                    dir={isArabicAnswer(mistake) ? "rtl" : "ltr"}
                    lang={isArabicAnswer(mistake) ? "ar" : "de"}
                    className="font-semibold text-emerald-900"
                  >
                    {safeText(mistake.correctAnswer)}
                  </span>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <span className="font-bold text-slate-500">{ui.wrongCount}: </span>
                  <span className="font-black text-slate-800">{mistake.wrongCount || 0}</span>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <span className="font-bold text-slate-500">{ui.lastWrong}: </span>
                  <span className="font-semibold text-slate-800">{formatDate(mistake.lastWrongAt)}</span>
                </div>
              </div>
              {(mistake.example_de || mistake.example_ar || mistake.note_ar) && (
                <div className="bg-slate-50 rounded-lg p-3 space-y-2 text-xs">
                  {mistake.example_de && (
                    <p dir="ltr" lang="de" className="font-semibold text-slate-800 text-left">
                      {normalizeGermanText(mistake.example_de)}
                    </p>
                  )}
                  {mistake.example_ar && (
                    <p dir="rtl" lang="ar" className="font-bold text-blue-600 font-arabic text-right">
                      {mistake.example_ar}
                    </p>
                  )}
                  {mistake.note_ar && (
                    <p dir="rtl" lang="ar" className="font-semibold text-slate-600 font-arabic text-right">
                      {mistake.note_ar}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
