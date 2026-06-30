import { useState, useEffect, type MouseEvent } from "react";
import {
  ArrowLeft,
  Check,
  X,
  HelpCircle,
  Sparkles,
  Layers,
  BookOpen,
  Bookmark,
  Shuffle,
  Volume2,
  Clock,
} from "lucide-react";
import { DataService } from "../services/dataService";
import { ProgressService } from "../services/progressService";
import { AudioService } from "../services/audioService";
import { MistakeReviewService, MistakeType } from "../services/mistakeReviewService";
import { answersMatch, getTenseExample, normalizeGermanText } from "../services/textDisplayService";
import {
  generateVerbChoiceOptions,
  getVerbChoiceCorrectAnswer,
  VerbChoiceQuestionType,
} from "../services/verbChoiceService";
import { generateTenseChoiceOptions } from "../services/tenseChoiceService";
import { UserSettings, Verb, Vocabulary, TenseKey } from "../types";
import { getTranslation, Language } from "../services/translationService";

interface QuickPracticeProps {
  onNavigate: (page: string) => void;
  settings: UserSettings;
}

type PracticeItem = {
  key: string; // "verb-ID" or "vocab-ID"
  type: "verb" | "vocab" | "tense";
  itemId: number | string;
  german: string;
  subGerman: string;
  arabic: string;
  badge: string;
  audioText?: string;
  questionType?: VerbChoiceQuestionType;
  choices?: string[];
  correctAnswer?: string;
  meaning?: string;
  targetTense?: TenseKey;
  pronoun?: "ich" | "du" | "er_sie_es" | "wir" | "ihr" | "sie_Sie";
  exampleDe?: string;
  exampleAr?: string;
};

const PRONOUNS = ["ich", "du", "er_sie_es", "wir", "ihr", "sie_Sie"];
const PRONOUN_LABELS: Record<string, string> = {
  ich: "ich",
  du: "du",
  er_sie_es: "er/sie/es",
  wir: "wir",
  ihr: "ihr",
  sie_Sie: "sie/Sie",
};
const TENSES: TenseKey[] = ["praesens", "praeteritum", "perfekt", "plusquamperfekt", "futur1", "futur2"];
const TENSE_LABELS: Record<TenseKey, string> = {
  praesens: "Prasens",
  praeteritum: "Prateritum",
  perfekt: "Perfekt",
  plusquamperfekt: "Plusquamperfekt",
  futur1: "Futur I",
  futur2: "Futur II",
};

function getTenseValue(verb: Verb, tense: TenseKey, pronoun: string): string {
  const value = verb.tenses?.[tense]?.[pronoun];
  return typeof value === "string" ? value.trim() : "";
}

export default function QuickPractice({ onNavigate, settings }: QuickPracticeProps) {
  const currentLang = settings.language || "de";
  const isRtl = currentLang === "ar";

  const [sessionLength, setSessionLength] = useState<number>(5);
  const [sessionType, setSessionType] = useState<"mixed" | "verbs" | "vocab" | "tenses">("mixed");
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [items, setItems] = useState<PracticeItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [showAnswer, setShowAnswer] = useState<boolean>(false);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [knownCount, setKnownCount] = useState<number>(0);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  // Load items based on selection
  const startSession = async () => {
    setLoading(true);
    try {
      const verbs = await DataService.getVerbs();
      const vocab = await DataService.getVocabulary();

      let pool: PracticeItem[] = [];

      if (sessionType === "verbs" || sessionType === "mixed") {
        verbs.forEach((v: Verb) => {
          const questionTypes: VerbChoiceQuestionType[] = ["arabic", "praesens", "praeteritum", "perfekt"];
          const availableQuestionTypes = questionTypes.filter((type) => getVerbChoiceCorrectAnswer(v, type));
          const questionType = availableQuestionTypes[Math.floor(Math.random() * availableQuestionTypes.length)] || "arabic";
          const correctAnswer = getVerbChoiceCorrectAnswer(v, questionType);
          const exampleTense: TenseKey =
            questionType === "praeteritum" ? "praeteritum" : questionType === "perfekt" ? "perfekt" : "praesens";
          const example = getTenseExample(v, exampleTense);
          const quickVerbPrompt =
            currentLang === "ar"
              ? questionType === "arabic"
                ? "اختر المعنى العربي الصحيح"
                : questionType === "praesens"
                ? "اختر صيغة Präsens الصحيحة"
                : questionType === "praeteritum"
                ? "اختر صيغة Präteritum الصحيحة"
                : "اختر صيغة Perfekt الصحيحة"
              : questionType === "arabic"
              ? "Choose the correct Arabic meaning"
              : questionType === "praesens"
              ? "Choose the correct Präsens form"
              : questionType === "praeteritum"
              ? "Choose the correct Präteritum form"
              : "Choose the correct Perfekt form";
          pool.push({
            key: `verb-${v.id}`,
            type: "verb",
            itemId: v.id,
            german: v.infinitiv,
            subGerman: quickVerbPrompt,
            arabic: correctAnswer,
            badge: getTranslation(currentLang, "verb"),
            questionType,
            choices: generateVerbChoiceOptions(v, verbs, questionType),
            correctAnswer,
            meaning: v.arabic,
            targetTense: questionType === "arabic" ? undefined : questionType,
            exampleDe: example.de,
            exampleAr: example.ar,
          });
        });
      }

      if (sessionType === "tenses" || sessionType === "mixed") {
        verbs.forEach((v: Verb) => {
          TENSES.forEach((tense) => {
            PRONOUNS.forEach((pronoun) => {
              const form = getTenseValue(v, tense, pronoun);
              if (!form) return;
              const example = getTenseExample(v, tense);
              pool.push({
                key: `tense-verb-${v.id}-${tense}-${pronoun}`,
                type: "tense",
                itemId: v.id,
                german: v.infinitiv,
                subGerman: `${TENSE_LABELS[tense]} • ${PRONOUN_LABELS[pronoun]}`,
                arabic: form,
                badge: translate("tensesTrainer"),
                audioText: v.infinitiv,
                choices: generateTenseChoiceOptions(v, verbs, tense, pronoun),
                correctAnswer: form,
                meaning: v.arabic,
                targetTense: tense,
                pronoun: pronoun as PracticeItem["pronoun"],
                exampleDe: example.de,
                exampleAr: example.ar,
              });
            });
          });
        });
      }

      if (sessionType === "vocab" || sessionType === "mixed") {
        vocab.forEach((vc: Vocabulary) => {
          const normalizedType = (vc.type || "").toLowerCase();
          const typeLabel = normalizedType === "noun" || vc.type === "Nomen"
            ? getTranslation(currentLang, "noun") 
            : normalizedType === "verb" || vc.type === "Verb"
            ? getTranslation(currentLang, "verb") 
            : normalizedType === "adjective" || vc.type === "Adjektiv"
            ? getTranslation(currentLang, "adjective") 
            : getTranslation(currentLang, "word");

          pool.push({
            key: `vocab-${vc.id}`,
            type: "vocab",
            itemId: vc.id,
            german: vc.term,
            subGerman: `${typeLabel} • ${vc.level}`,
            arabic: vc.arabic,
            badge: typeLabel,
          });
        });
      }

      // Shuffle and pick sessionLength items
      const shuffled = [...pool].sort(() => 0.5 - Math.random());
      const selected = shuffled.slice(0, sessionLength);

      setItems(selected);
      setCurrentIndex(0);
      setKnownCount(0);
      setSelectedChoice(null);
      setShowAnswer(settings.showArabicImmediately && !selected[0]?.choices?.length);
      setIsCompleted(false);
      setIsPlaying(true);

      // Play audio for the first word if autoPlay is active
      if (selected.length > 0 && settings.autoPlayPronunciation) {
        AudioService.speak(selected[0].audioText || selected[0].german, settings.speechSpeed);
      }
    } catch (e) {
      console.error("Error starting quick session", e);
    } finally {
      setLoading(false);
    }
  };

  const handleReveal = () => {
    if (items[currentIndex]?.choices?.length && !selectedChoice) return;
    setShowAnswer(true);
    if (!settings.autoPlayPronunciation) {
      AudioService.speak(items[currentIndex].audioText || items[currentIndex].german, settings.speechSpeed);
    }
  };

  const handleSpeak = (e: MouseEvent) => {
    e.stopPropagation();
    if (items[currentIndex]) {
      AudioService.speak(items[currentIndex].audioText || items[currentIndex].german, settings.speechSpeed);
    }
  };

  const handleResponse = (knew: boolean) => {
    const item = items[currentIndex];
    
    // Record in local progress
    ProgressService.recordReview(item.key, knew);

    if (!knew) {
      const mistakeType: MistakeType = item.type === "vocab" ? "vocabulary" : item.type;
      const userAnswer = selectedChoice || (currentLang === "ar" ? "لم أعرفها" : "Forgotten");
      MistakeReviewService.recordMistake({
        id:
          item.type === "tense"
            ? `mistake-tense-verb-${item.itemId}-${item.targetTense}-${item.pronoun}`
            : item.type === "verb"
            ? `mistake-verb-${item.itemId}-${item.questionType || "quick"}`
            : `mistake-vocab-${item.itemId}-quick-practice`,
        itemKey: item.key,
        type: mistakeType,
        mode: "quick-practice",
        itemId: item.itemId,
        infinitiv: item.type !== "vocab" ? item.german : undefined,
        term: item.type === "vocab" ? item.german : undefined,
        arabic: item.meaning || (item.type === "vocab" ? item.arabic : undefined),
        targetTense: item.targetTense,
        pronoun: item.pronoun,
        questionText: item.subGerman,
        correctAnswer: item.correctAnswer || item.arabic,
        userAnswer,
      });
    }

    if (knew) {
      setKnownCount((prev) => prev + 1);
    }

    if (currentIndex + 1 < items.length) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedChoice(null);
      setShowAnswer(settings.showArabicImmediately && !items[currentIndex + 1]?.choices?.length);
      
      // Auto play next audio if enabled
      if (settings.autoPlayPronunciation) {
        setTimeout(() => {
          AudioService.speak(items[currentIndex + 1].audioText || items[currentIndex + 1].german, settings.speechSpeed);
        }, 300);
      }
    } else {
      setIsCompleted(true);
    }
  };

  const translate = (key: any, params?: any) => getTranslation(currentLang, key, params);
  const currentItem = items[currentIndex];
  const hasChoices = Boolean(currentItem?.choices?.length);
  const isSelectedChoiceCorrect =
    currentItem?.questionType === "arabic"
      ? selectedChoice === currentItem?.correctAnswer
      : answersMatch(selectedChoice || "", currentItem?.correctAnswer || "");

  return (
    <div className="max-w-xl mx-auto px-4 py-4 space-y-6" dir={isRtl ? "rtl" : "ltr"}>
      {/* Navigation & Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <button
          onClick={() => onNavigate("dashboard")}
          className="inline-flex items-center text-xs uppercase tracking-wider font-bold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
        >
          <ArrowLeft className={isRtl ? "ml-1.5" : "mr-1.5"} size={16} /> {translate("dashboard")}
        </button>
        <div className="flex items-center space-x-2 text-blue-600">
          <Sparkles size={16} />
          <span className="text-xs font-bold uppercase tracking-wider">{translate("quickPractice")}</span>
        </div>
      </div>

      {!isPlaying ? (
        /* Configuration UI */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-2">
              <Shuffle size={24} />
            </div>
            <h2 className="text-xl font-black text-slate-800 tracking-tight">{translate("qpTitle")}</h2>
            <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
              {translate("quickPracticeDesc")}
            </p>
          </div>

          <div className="space-y-4 pt-2">
            {/* Length selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                {translate("qpSessionLength")}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[5, 10, 15].map((len) => (
                  <button
                    key={len}
                    onClick={() => setSessionLength(len)}
                    className={`py-2.5 px-3 border rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      sessionLength === len
                        ? "bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-600/15"
                        : "border-slate-200 text-slate-700 bg-white hover:bg-slate-50"
                    }`}
                  >
                    {len} {translate("qpWords")}
                  </button>
                ))}
              </div>
            </div>

            {/* Type selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                {translate("qpTypeLabel")}
              </label>
              <div className="space-y-2">
                {[
                  { id: "mixed", label: translate("qpMixed"), icon: Layers, color: "text-blue-600 bg-blue-50" },
                  { id: "verbs", label: translate("qpRandomVerbs"), icon: BookOpen, color: "text-indigo-600 bg-indigo-50" },
                  { id: "vocab", label: translate("qpRandomVocab"), icon: Bookmark, color: "text-purple-600 bg-purple-50" },
                  { id: "tenses", label: translate("qpRandomTenses"), icon: Clock, color: "text-emerald-600 bg-emerald-50" },
                ].map((type) => {
                  const Icon = type.icon;
                  const isActive = sessionType === type.id;
                  return (
                    <button
                      key={type.id}
                      onClick={() => setSessionType(type.id as any)}
                      className={`w-full flex items-center justify-between p-3.5 border rounded-xl transition-all cursor-pointer text-left ${
                        isRtl ? "text-right" : "text-left"
                      } ${
                        isActive
                          ? "border-blue-600 bg-blue-50/20 shadow-xs"
                          : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center space-x-3 space-x-reverse">
                        <span className={`p-2 rounded-lg ${type.color}`}>
                          <Icon size={16} />
                        </span>
                        <span className="text-xs font-bold text-slate-800">{type.label}</span>
                      </div>
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${isActive ? "border-blue-600 bg-blue-600" : "border-slate-300"}`}>
                        {isActive && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <button
            onClick={startSession}
            disabled={loading}
            className="w-full inline-flex items-center justify-center py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-md cursor-pointer transition-colors"
          >
            {loading ? translate("loading") : translate("startQuickPractice")}
          </button>
        </div>
      ) : isCompleted ? (
        /* Completed Screen */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
            <Check size={32} />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-black text-slate-800 tracking-tight">{translate("qpCompleted")}</h2>
            <p className="text-sm text-slate-600 max-w-sm mx-auto leading-relaxed">
              {translate("qpFeedback", { known: knownCount, total: items.length })}
            </p>
          </div>

          {/* Miniature progress bar */}
          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden max-w-xs mx-auto">
            <div
              className="bg-emerald-500 h-full transition-all duration-500"
              style={{ width: `${Math.round((knownCount / items.length) * 100)}%` }}
            />
          </div>

          <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => setIsPlaying(false)}
              className="px-5 py-3 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
            >
              {translate("qpRandomVerbs")} / Neu starten
            </button>
            <button
              onClick={() => onNavigate("dashboard")}
              className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-xs cursor-pointer"
            >
              {translate("qpBackToDashboard")}
            </button>
          </div>
        </div>
      ) : (
        /* Active Practice Cards */
        <div className="space-y-6">
          {/* Card Progress counter */}
          <div className="flex justify-between items-center text-xs font-bold text-slate-500">
            <span>{translate("qpTitle")}</span>
            <span>{currentIndex + 1} / {items.length}</span>
          </div>

          {/* Flashcard box */}
          <div
            onClick={!showAnswer && !hasChoices ? handleReveal : undefined}
            className={`min-h-[220px] bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col justify-between cursor-pointer transition-all hover:border-blue-300 relative ${
              !showAnswer ? "hover:shadow-md" : ""
            }`}
          >
            {/* Top Indicator & TTS */}
            <div className="flex justify-between items-center w-full">
              <span className="text-[10px] uppercase font-extrabold tracking-wider bg-slate-100 text-slate-600 px-2 py-1 rounded">
                {currentItem.badge}
              </span>
              <button
                onClick={handleSpeak}
                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-50 rounded-lg transition-all"
                title="Aussprache anhören"
              >
                <Volume2 size={16} />
              </button>
            </div>

            {/* Term and details */}
            <div className="my-auto text-center py-4 space-y-3">
              <h3 dir="ltr" lang="de" className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight text-center">
                {currentItem.german}
              </h3>
              <p dir="ltr" lang="de" className="text-xs sm:text-sm font-semibold text-slate-500 font-mono tracking-tight text-center">
                {currentItem.subGerman}
              </p>

              {hasChoices && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                  {currentItem.choices?.map((option, idx) => {
                    const isSelected = selectedChoice === option;
                    const isCorrectOption =
                      currentItem.questionType === "arabic"
                        ? option === currentItem.correctAnswer
                        : answersMatch(option, currentItem.correctAnswer || "");

                    let btnClass = "border-slate-200 hover:bg-slate-50 text-slate-800";
                    if (isSelected && !showAnswer) {
                      btnClass = "border-blue-500 bg-blue-50 text-blue-700 font-bold";
                    } else if (showAnswer) {
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
                        type="button"
                        disabled={showAnswer}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedChoice(option);
                        }}
                        className={`w-full rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${currentItem.questionType === "arabic" ? "text-right" : "text-left"} ${btnClass}`}
                      >
                        <span
                          dir={currentItem.questionType === "arabic" ? "rtl" : "ltr"}
                          lang={currentItem.questionType === "arabic" ? "ar" : "de"}
                          className={currentItem.questionType === "arabic" ? "font-arabic" : ""}
                        >
                          {option}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Translation revealed */}
              <div className="pt-2 min-h-[40px] flex flex-col items-center justify-center gap-2">
                {showAnswer ? (
                  <>
                    {hasChoices && !isSelectedChoiceCorrect && (
                      <p className="text-xs font-semibold text-slate-600">
                        {translate("qpCorrectAnswer")}:{" "}
                        <span
                          dir={currentItem.questionType === "arabic" ? "rtl" : "ltr"}
                          lang={currentItem.questionType === "arabic" ? "ar" : "de"}
                          className="font-bold text-slate-900"
                        >
                          {currentItem.correctAnswer}
                        </span>
                      </p>
                    )}
                    <p
                      className="text-xl font-bold text-blue-600 tracking-wide text-center"
                      dir={currentItem.questionType === "arabic" || currentItem.type === "vocab" ? "rtl" : "ltr"}
                      lang={currentItem.questionType === "arabic" || currentItem.type === "vocab" ? "ar" : "de"}
                    >
                      {currentItem.arabic}
                    </p>
                    {currentItem.meaning && currentItem.questionType !== "arabic" && (
                      <p dir="rtl" lang="ar" className="text-xs font-bold text-slate-500 font-arabic text-right">
                        {currentItem.meaning}
                      </p>
                    )}
                    {currentItem.exampleDe && (
                      <div className="w-full rounded-xl bg-slate-50 p-3 space-y-1">
                        <p dir="ltr" lang="de" className="text-xs font-semibold text-slate-800 text-left">
                          {normalizeGermanText(currentItem.exampleDe)}
                        </p>
                        {currentItem.exampleAr && (
                          <p dir="rtl" lang="ar" className="text-xs font-bold text-blue-600 font-arabic text-right">
                            {currentItem.exampleAr}
                          </p>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest flex items-center">
                    <HelpCircle className="mr-1.5" size={14} /> {translate("qpShowAnswer")}
                  </span>
                )}
              </div>
            </div>

            {/* Geometric visual progress line */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-100 overflow-hidden rounded-b-2xl">
              <div
                className="bg-blue-600 h-full transition-all duration-300"
                style={{ width: `${((currentIndex + 1) / items.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Bottom Action buttons */}
          <div className="pt-2">
            {!showAnswer ? (
              <button
                onClick={handleReveal}
                disabled={hasChoices && !selectedChoice}
                className={`w-full py-4 font-bold text-xs uppercase tracking-widest rounded-xl shadow-md transition-colors ${
                  hasChoices && !selectedChoice
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
                    : "bg-slate-900 hover:bg-slate-800 text-white cursor-pointer"
                }`}
              >
                {hasChoices ? translate("qpCheckAnswer") : translate("qpShowAnswer")}
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handleResponse(false)}
                  className="flex items-center justify-center space-x-2 py-3.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                >
                  <X size={16} />
                  <span>{translate("qpForgotten")}</span>
                </button>
                <button
                  onClick={() => handleResponse(true)}
                  className="flex items-center justify-center space-x-2 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer"
                >
                  <Check size={16} />
                  <span>{translate("qpKnown")}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
