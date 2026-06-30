import { useState, useEffect } from "react";
import {
  Clock,
  ArrowLeft,
  Check,
  X,
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
import { answersMatch, getTenseExample } from "../services/textDisplayService";
import {
  generateTenseChoiceOptions,
  getVerbTenseValue,
  TENSE_KEYS,
  TENSE_PRONOUNS,
} from "../services/tenseChoiceService";
import { Verb, UserSettings, TenseKey } from "../types";
import AudioButton from "../components/AudioButton";
import { getTranslation } from "../services/translationService";

interface ZeitenTrainerProps {
  onNavigate: (page: string) => void;
  settings: UserSettings;
}

type Mode = "select" | "table" | "fill" | "choice";

const PRONOUNS = TENSE_PRONOUNS;
const PRONOUN_LABELS: Record<string, string> = {
  ich: "ich",
  du: "du",
  er_sie_es: "er/sie/es",
  wir: "wir",
  ihr: "ihr",
  sie_Sie: "sie/Sie",
};

const TENSES: TenseKey[] = TENSE_KEYS;

const TENSE_LABELS: Record<string, string> = {
  praesens: "Präsens",
  praeteritum: "Präteritum",
  perfekt: "Perfekt",
  plusquamperfekt: "Plusquamperfekt",
  futur1: "Futur I",
  futur2: "Futur II",
};

function getTenseValue(verb: Verb, tense: string, pronoun: string): string {
  return getVerbTenseValue(verb, tense, pronoun);
}

function getAvailableTenses(verb: Verb): string[] {
  return TENSES.filter((tense) => PRONOUNS.some((pronoun) => getTenseValue(verb, tense, pronoun)));
}

function getAvailablePronouns(verb: Verb, tense: string): string[] {
  return PRONOUNS.filter((pronoun) => getTenseValue(verb, tense, pronoun));
}

export default function ZeitenTrainer({ onNavigate, settings }: ZeitenTrainerProps) {
  const [mode, setMode] = useState<Mode>("select");
  const [verbs, setVerbs] = useState<Verb[]>([]);
  const [sessionVerbs, setSessionVerbs] = useState<Verb[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [currentPronoun, setCurrentPronoun] = useState<string>("ich");
  const [currentTense, setCurrentTense] = useState<string>("praesens");
  const [tenseFilter, setTenseFilter] = useState<string>("all");
  const [showAnswer, setShowAnswer] = useState(false);
  const [writtenAnswer, setWrittenAnswer] = useState("");
  const [writtenChecked, setWrittenChecked] = useState(false);

  const [choiceOptions, setChoiceOptions] = useState<string[]>([]);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [choiceChecked, setChoiceChecked] = useState(false);

  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionWrong, setSessionWrong] = useState(0);
  const [sessionFinished, setSessionFinished] = useState(false);

  const currentLang = settings.language || "de";
  const translate = (key: any, params?: any) => getTranslation(currentLang, key, params);
  const isRtl = currentLang === "ar";
  const ui = isRtl
    ? {
        title: "مدرب الأزمنة",
        subtitle: "تدرّب على تصريف الأفعال في أزمنة مختلفة مثل Präsens وPerfekt وPräteritum وFutur.",
        tableMode: "عرض الجدول",
        tableDesc: "شاهد جميع صيغ الفعل في مكان واحد.",
        fillMode: "إكمال الفراغات",
        fillDesc: "اكتب الصيغة الصحيحة حسب الضمير والزمن.",
        choiceMode: "اختيار من متعدد",
        choiceDesc: "اختر التصريف الصحيح من أربع إجابات.",
        view: "عرض",
        mode1: "الوضع 1",
        mode2: "الوضع 2",
        start: "ابدأ",
        finished: "انتهى التدريب!",
        finishedDesc: "أنهيت جلسة التدريب الحالية.",
        correct: "صحيح",
        wrong: "خطأ",
        repeat: "إعادة",
        changeMode: "تغيير الوضع",
        verb: "فعل",
        of: "من",
        nextVerb: "الفعل التالي",
        checkAnswer: "تحقق من الإجابة",
        correctLabel: "الصحيح",
        enterForm: "اكتب الصيغة...",
        pronoun: "الضمير",
        tenseFocus: "اختر الزمن للدراسة",
        allTenses: "كل الأزمنة",
        tenseExample: "مثال لهذا الزمن",
      }
    : {
        title: "Zeiten Trainer",
        subtitle: "Trainiere die Konjugation der Verben in verschiedenen Zeiten (Präsens, Perfekt, Präteritum, Futur, etc.).",
        tableMode: "Tabellen-Ansicht",
        tableDesc: "Sehe alle Formen eines Verbs auf einen Blick.",
        fillMode: "Lücken füllen",
        fillDesc: "Tippe die richtige Form für das Pronomen und die Zeit ein.",
        choiceMode: "Multiple Choice",
        choiceDesc: "Wähle die richtige konjugierte Form aus 4 Optionen.",
        view: "Ansicht",
        mode1: "Modus 1",
        mode2: "Modus 2",
        start: "Starten",
        finished: "Training beendet!",
        finishedDesc: "Du hast die Übungseinheit abgeschlossen.",
        correct: "Richtig",
        wrong: "Falsch",
        repeat: "Wiederholen",
        changeMode: "Modus wechseln",
        verb: "Verb",
        of: "von",
        nextVerb: "Nächstes Verb",
        checkAnswer: "Antwort prüfen",
        correctLabel: "Korrekt",
        enterForm: "Form eingeben...",
        pronoun: "Pronomen",
        tenseFocus: "Zeit zum Üben",
        allTenses: "Alle Zeiten",
        tenseExample: "Example for this tense",
      };

  useEffect(() => {
    async function loadVerbs() {
      const data = await DataService.getVerbs();
      // Only keep verbs that have tenses defined
      const verbsWithTenses = data.filter((v) => v.tenses && getAvailableTenses(v).length > 0);
      setVerbs(verbsWithTenses);
    }
    loadVerbs();
  }, []);

  const getSessionTenses = (verb: Verb): string[] => {
    if (tenseFilter === "all") return getAvailableTenses(verb);
    return getAvailablePronouns(verb, tenseFilter).length > 0 ? [tenseFilter] : [];
  };

  const startSession = (selectedMode: Mode, filterType: "all" | "due" | "difficult" | "new") => {
    let list = verbs.filter((verb) => getSessionTenses(verb).length > 0);

    if (list.length === 0) {
      alert(currentLang === "de" ? "Keine Verben mit Konjugationen gefunden! Bitte füge im Daten-Manager Zeiten hinzu." : "لم يتم العثور على أفعال مع تصريفات! يرجى إضافة أزمنة في مدير البيانات.");
      return;
    }

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

  const setupQuestion = (currentMode: Mode, list: Verb[], index: number) => {
    if (index >= list.length) {
      finishSession();
      return;
    }

    const verb = list[index];
    setShowAnswer(false);
    setWrittenAnswer("");
    setWrittenChecked(false);
    setSelectedChoice(null);
    setChoiceChecked(false);

    // Pick random tense and pronoun
    const availableTenses = getSessionTenses(verb);
    if (availableTenses.length === 0) {
      // Fallback
      handleNext();
      return;
    }

    const randomTense = availableTenses[Math.floor(Math.random() * availableTenses.length)];
    const availablePronouns = getAvailablePronouns(verb, randomTense);
    if (availablePronouns.length === 0) {
      handleNext();
      return;
    }
    const randomPronoun = availablePronouns[Math.floor(Math.random() * availablePronouns.length)];

    setCurrentTense(randomTense);
    setCurrentPronoun(randomPronoun);

    const correctAnswer = getTenseValue(verb, randomTense, randomPronoun);
    if (!correctAnswer) {
      handleNext();
      return;
    }

    if (settings.autoPlayPronunciation && currentMode === "table") {
      setTimeout(() => {
        AudioService.speak(verb.infinitiv, settings.speechSpeed);
      }, 300);
    }

    if (currentMode === "choice") {
      setChoiceOptions(generateTenseChoiceOptions(verb, verbs, randomTense, randomPronoun));
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

  const checkWritten = () => {
    const verb = sessionVerbs[currentIndex];
    const correctAnswer = getTenseValue(verb, currentTense, currentPronoun);
    if (!correctAnswer) return;
    const isCorrect = answersMatch(writtenAnswer, correctAnswer);

    if (isCorrect) {
      setSessionCorrect((prev) => prev + 1);
      ProgressService.recordReview(`tense-verb-${verb.id}-${currentTense}-${currentPronoun}`, true);
    } else {
      setSessionWrong((prev) => prev + 1);
      ProgressService.recordReview(`tense-verb-${verb.id}-${currentTense}-${currentPronoun}`, false);
      MistakeReviewService.recordMistake({
        id: `mistake-tense-verb-${verb.id}-${currentTense}-${currentPronoun}`,
        itemKey: `tense-verb-${verb.id}-${currentTense}-${currentPronoun}`,
        type: "tense",
        mode: "tense-writing",
        itemId: verb.id,
        infinitiv: verb.infinitiv,
        arabic: verb.arabic,
        targetTense: currentTense,
        pronoun: currentPronoun,
        questionText: `${TENSE_LABELS[currentTense]} ${PRONOUN_LABELS[currentPronoun]}`,
        correctAnswer,
        userAnswer: writtenAnswer,
      });
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
    const correctAnswer = getTenseValue(verb, currentTense, currentPronoun);
    if (!correctAnswer) return;
    const correct = answersMatch(selectedChoice, correctAnswer);

    if (correct) {
      setSessionCorrect((prev) => prev + 1);
      ProgressService.recordReview(`tense-verb-${verb.id}-${currentTense}-${currentPronoun}`, true);
    } else {
      setSessionWrong((prev) => prev + 1);
      ProgressService.recordReview(`tense-verb-${verb.id}-${currentTense}-${currentPronoun}`, false);
      MistakeReviewService.recordMistake({
        id: `mistake-tense-verb-${verb.id}-${currentTense}-${currentPronoun}`,
        itemKey: `tense-verb-${verb.id}-${currentTense}-${currentPronoun}`,
        type: "tense",
        mode: "tense-multiple-choice",
        itemId: verb.id,
        infinitiv: verb.infinitiv,
        arabic: verb.arabic,
        targetTense: currentTense,
        pronoun: currentPronoun,
        questionText: `${TENSE_LABELS[currentTense]} ${PRONOUN_LABELS[currentPronoun]}`,
        correctAnswer,
        userAnswer: selectedChoice,
      });
    }

    setChoiceChecked(true);
  };

  const finishSession = () => {
    setSessionFinished(true);
  };

  const goBack = () => {
    AudioService.stop();
    setMode("select");
  };

  const currentVerb = sessionVerbs[currentIndex];
  let correctAnswer = "";
  if (currentVerb) {
    correctAnswer = getTenseValue(currentVerb, currentTense, currentPronoun);
  }
  const renderTenseExample = (tense: string) => {
    if (!currentVerb) return null;
    const example = getTenseExample(currentVerb, tense);
    if (!example.de && !example.ar) return null;

    return (
      <div className="p-4 bg-slate-50 rounded-xl space-y-2">
        <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">
          {ui.tenseExample}: <span className="text-blue-700">{TENSE_LABELS[tense]}</span>
        </div>
        {example.de && (
          <div className="flex items-center justify-between gap-3">
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
    );
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-6" dir={isRtl ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <button
          onClick={mode === "select" ? () => onNavigate("dashboard") : goBack}
          className="inline-flex items-center text-xs uppercase tracking-wider font-bold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className={`${isRtl ? "ml-1.5 rotate-180" : "mr-1.5"}`} size={16} />
          {mode === "select" ? translate("dashboard") : translate("back")}
        </button>
        <div className={`flex items-center space-x-2 ${isRtl ? "space-x-reverse" : ""}`}>
          <span className="p-1.5 bg-purple-50 text-purple-600 rounded">
            <Clock size={16} />
          </span>
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">{ui.title}</span>
        </div>
      </div>

      {mode === "select" && (
        <div className="space-y-6">
          <div className="text-center max-w-lg mx-auto">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-800 tracking-tight">
              {ui.title}
            </h1>
            <p className="text-xs text-gray-500 mt-2">
              {ui.subtitle}
            </p>
          </div>

          <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
              {ui.tenseFocus}
            </label>
            <select
              value={tenseFilter}
              onChange={(e) => setTenseFilter(e.target.value)}
              className="w-full sm:max-w-xs px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold bg-white focus:outline-none focus:border-blue-500"
            >
              <option value="all">{ui.allTenses}</option>
              {TENSES.map((tense) => (
                <option key={tense} value={tense}>
                  {TENSE_LABELS[tense]}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
            <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
              <div>
                <span className="bg-purple-50 text-purple-600 text-xs font-bold px-2.5 py-1 rounded">{ui.view}</span>
                <h3 className="font-bold text-slate-800 text-base mt-3">{ui.tableMode}</h3>
                <p className="text-xs text-gray-500 mt-1">
                  {ui.tableDesc}
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-50 space-y-2">
                <button
                  onClick={() => startSession("table", "all")}
                  className="w-full inline-flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  <span>{ui.start}</span>
                  <ChevronRight className={isRtl ? "rotate-180" : ""} size={14} />
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
              <div>
                <span className="bg-blue-50 text-blue-600 text-xs font-bold px-2.5 py-1 rounded">{ui.mode1}</span>
                <h3 className="font-bold text-slate-800 text-base mt-3">{ui.fillMode}</h3>
                <p className="text-xs text-gray-500 mt-1">
                  {ui.fillDesc}
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-50 space-y-2">
                <button
                  onClick={() => startSession("fill", "all")}
                  className="w-full inline-flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  <span>{ui.start}</span>
                  <ChevronRight className={isRtl ? "rotate-180" : ""} size={14} />
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
              <div>
                <span className="bg-emerald-50 text-emerald-600 text-xs font-bold px-2.5 py-1 rounded">{ui.mode2}</span>
                <h3 className="font-bold text-slate-800 text-base mt-3">{ui.choiceMode}</h3>
                <p className="text-xs text-gray-500 mt-1">
                  {ui.choiceDesc}
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-50 space-y-2">
                <button
                  onClick={() => startSession("choice", "all")}
                  className="w-full inline-flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  <span>{ui.start}</span>
                  <ChevronRight className={isRtl ? "rotate-180" : ""} size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {sessionFinished && (
        <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-100 shadow-xl max-w-lg mx-auto text-center space-y-6">
          <span className="p-3 bg-emerald-50 text-emerald-600 rounded-full inline-flex items-center justify-center">
            <Award size={36} />
          </span>
          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-black text-slate-800">{ui.finished}</h2>
            <p className="text-xs text-gray-500">{ui.finishedDesc}</p>
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

      {!sessionFinished && mode !== "select" && currentVerb && (
        <div className="space-y-6">
          <div className="flex items-center justify-between text-xs font-semibold text-gray-500">
            <span>
              {ui.verb} {currentIndex + 1} {ui.of} {sessionVerbs.length}
            </span>
            <span>{ui.correct}: {sessionCorrect} • {ui.wrong}: {sessionWrong}</span>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-blue-600 h-full transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / sessionVerbs.length) * 100}%` }}
            />
          </div>

          {mode === "table" && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-md p-6 sm:p-8 space-y-6 overflow-x-auto">
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
                <p dir="rtl" lang="ar" className="text-2xl font-bold text-blue-600 mt-4 font-arabic text-right">
                  {currentVerb.arabic}
                </p>
              </div>

              <table className={`w-full min-w-[1100px] border-collapse ${isRtl ? "text-right" : "text-left"}`}>
                <thead>
                  <tr>
                    <th className="p-2 min-w-[110px] border-b font-bold text-slate-600">{ui.pronoun}</th>
                    {getSessionTenses(currentVerb).map((t) => (
                      <th key={t} className="p-2 min-w-[160px] border-b font-bold text-slate-600">{TENSE_LABELS[t]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PRONOUNS.map((pronoun) => (
                    <tr key={pronoun}>
                      <td dir="ltr" lang="de" className="p-2 border-b text-slate-800 font-semibold text-left">{PRONOUN_LABELS[pronoun]}</td>
                      {getSessionTenses(currentVerb).map((t) => {
                        const form = getTenseValue(currentVerb, t, pronoun);
                        return (
                          <td key={t} className="p-2 min-w-[160px] border-b text-slate-800">
                            <div className="flex items-center justify-start gap-2">
                              <span dir="ltr" lang="de" className="text-left break-words">{form || "-"}</span>
                              {form && <AudioButton text={form} speed={settings.speechSpeed} size={14} />}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-center pt-4">
                <button
                  onClick={handleNext}
                  className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md cursor-pointer"
                >
                  {ui.nextVerb} <ChevronRight className={isRtl ? "mr-1 rotate-180" : "ml-1"} size={18} />
                </button>
              </div>
            </div>
          )}

          {mode === "fill" && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-md p-6 sm:p-8 space-y-6">
              <div className="flex justify-between items-start">
                <span className="bg-slate-100 text-slate-600 text-xs px-2.5 py-0.5 rounded uppercase font-semibold">
                  {TENSE_LABELS[currentTense]}
                </span>
                <AudioButton text={currentVerb.infinitiv} speed={settings.speechSpeed} />
              </div>

              <div className="text-center py-2 space-y-2">
                <h2 dir="ltr" lang="de" className="text-3xl font-extrabold text-slate-800 tracking-tight text-center">
                  {currentVerb.infinitiv}
                </h2>
                <p dir="rtl" lang="ar" className="text-xl font-bold text-slate-500 mt-2 font-arabic text-right">
                  {currentVerb.arabic}
                </p>
                <div dir="ltr" lang="de" className="mt-4 p-4 bg-slate-50 rounded-xl inline-block text-lg font-bold text-left">
                  {PRONOUN_LABELS[currentPronoun]} <span className="text-slate-400">______</span>
                </div>
              </div>

              <div className="max-w-md mx-auto space-y-2">
                <input
                  type="text"
                  disabled={writtenChecked}
                  dir="ltr"
                  lang="de"
                  value={writtenAnswer}
                  onChange={(e) => setWrittenAnswer(e.target.value)}
                  placeholder={ui.enterForm}
                  className={`w-full px-4 py-3 rounded-xl border text-left text-lg font-medium focus:outline-none transition-all ${
                    writtenChecked
                      ? answersMatch(writtenAnswer, correctAnswer)
                        ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                        : "bg-rose-50 border-rose-300 text-rose-800"
                      : "border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  }`}
                />
                {writtenChecked && (
                  <p className="text-center text-sm font-semibold text-slate-600 mt-1">
                    {ui.correctLabel}: <span dir="ltr" lang="de" className="font-bold text-slate-800">{correctAnswer}</span>
                  </p>
                )}
              </div>

              {writtenChecked && renderTenseExample(currentTense)}

              <div className="flex justify-center pt-4">
                {!writtenChecked ? (
                  <button
                    onClick={checkWritten}
                    disabled={!writtenAnswer.trim()}
                    className={`w-full sm:w-auto inline-flex items-center justify-center px-8 py-3 font-bold rounded-xl shadow-md transition-colors ${
                      writtenAnswer.trim()
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

          {mode === "choice" && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-md p-6 sm:p-8 space-y-6">
              <div className="flex justify-between items-start">
                <span className="bg-slate-100 text-slate-600 text-xs px-2.5 py-0.5 rounded uppercase font-semibold">
                  {TENSE_LABELS[currentTense]}
                </span>
                <AudioButton text={currentVerb.infinitiv} speed={settings.speechSpeed} />
              </div>

              <div className="text-center py-2 space-y-2">
                <h2 dir="ltr" lang="de" className="text-3xl font-extrabold text-slate-800 tracking-tight text-center">
                  {currentVerb.infinitiv}
                </h2>
                <p dir="rtl" lang="ar" className="text-xl font-bold text-slate-500 mt-2 font-arabic text-right">
                  {currentVerb.arabic}
                </p>
                <div className="mt-4 text-lg font-bold">
                  {ui.pronoun}: <span className="text-blue-600">{PRONOUN_LABELS[currentPronoun]}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                {choiceOptions.map((option, idx) => {
                  const isSelected = selectedChoice === option;
                  const isCorrectOption = answersMatch(option, correctAnswer);

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
                      className={`w-full p-4 rounded-xl border text-sm font-medium transition-all flex items-center justify-between cursor-pointer text-left ${btnClass}`}
                    >
                      <span dir="ltr" lang="de" className="w-full text-left">{option}</span>
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
                <div className="flex flex-col justify-center items-center mt-2 gap-2">
                  {!answersMatch(selectedChoice, correctAnswer) && (
                    <p className="text-xs font-semibold text-slate-600 text-center">
                      {ui.correctLabel}: <span dir="ltr" lang="de" className="font-bold text-slate-800">{correctAnswer}</span>
                    </p>
                  )}
                </div>
              )}

              {choiceChecked && renderTenseExample(currentTense)}

              <div className="flex justify-center pt-4">
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
