import { useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, ChevronLeft, ChevronRight, Heart, Languages, Square, Volume2 } from "lucide-react";
import { getB2ExplanationLanguage } from "./b2CourseExplanationLanguage";
import { B2CourseProgressService } from "./b2CourseProgressService";
import {
  B2_SPEECH_RATES,
  getStoredSpeechRateMode,
  isSpeechSupported,
  speakGerman,
  stopSpeaking,
} from "./b2CourseSpeechService";
import type { B2CourseVocabularyItem, B2VocabularyTrainingMode } from "./types";

interface Props {
  items: B2CourseVocabularyItem[];
  unit: number;
  isRtl: boolean;
  initialItemId: string;
  mode: B2VocabularyTrainingMode;
  onClose: () => void;
}

export default function B2CourseTrainer({ items, unit, isRtl, initialItemId, mode, onClose }: Props) {
  const startingIndex = Math.max(0, items.findIndex((item) => item.courseItemId === initialItemId));
  const [index, setIndex] = useState(startingIndex);
  const [revealed, setRevealed] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechSupported] = useState(isSpeechSupported);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [reviewMastered, setReviewMastered] = useState(0);
  const [, setRevision] = useState(0);
  const item = items[index];

  useEffect(() => {
    stopSpeaking();
    setIsSpeaking(false);
    setRevealed(false);
    if (!item) return;
    if (mode === "review") B2CourseProgressService.setReviewCursor(unit, item.courseItemId);
    else B2CourseProgressService.setVocabularyCursor(unit, item.courseItemId, items);
  }, [index, item, items, mode, unit]);

  useEffect(() => stopSpeaking, []);

  if (!item) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-8" dir={isRtl ? "rtl" : "ltr"}>
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="font-bold text-slate-700">
            {isRtl ? "لا توجد كلمات تحتاج إلى مراجعة في هذا الفصل." : "In diesem Kapitel gibt es keine Wörter zum Wiederholen."}
          </p>
          <button type="button" onClick={onClose} className="mt-5 min-h-11 rounded-lg bg-blue-600 px-5 py-3 font-black text-white">
            {isRtl ? "العودة إلى الفصل" : "Zurück zum Kapitel"}
          </button>
        </div>
      </section>
    );
  }
  const progress = B2CourseProgressService.getVocabularyProgress(item.courseItemId);
  const favorite = B2CourseProgressService.isFavorite(item.courseItemId);
  const explanationLanguage = getB2ExplanationLanguage(isRtl);

  const move = (offset: number) => {
    setIndex((current) => {
      if (mode === "review") return Math.min(items.length - 1, Math.max(0, current + offset));
      return (current + offset + items.length) % items.length;
    });
  };
  const rate = (correct: boolean) => {
    B2CourseProgressService.recordVocabularyReview(unit, item.courseItemId, correct, items, mode === "study");
    if (mode === "review") {
      if (correct) setReviewMastered((current) => current + 1);
      if (index >= items.length - 1) setSessionComplete(true);
      else setIndex((current) => current + 1);
      return;
    }

    const next = B2CourseProgressService.getNextVocabularyItem(unit, items);
    if (!next) {
      setSessionComplete(true);
      return;
    }
    const nextIndex = items.findIndex((candidate) => candidate.courseItemId === next.courseItemId);
    setIndex(Math.max(0, nextIndex));
  };
  const toggleSpeech = () => {
    if (!speechSupported) return;
    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
      return;
    }

    setIsSpeaking(true);
    const clearSpeaking = () => setIsSpeaking(false);
    const started = speakGerman(item.term, {
      rate: B2_SPEECH_RATES[getStoredSpeechRateMode()],
      onStart: () => setIsSpeaking(true),
      onEnd: clearSpeaking,
      onError: clearSpeaking,
    });
    if (!started) clearSpeaking();
  };
  const speechLabel = !speechSupported
    ? (isRtl ? "النطق غير مدعوم في هذا المتصفح" : "Sprachausgabe wird von diesem Browser nicht unterst\u00fctzt")
    : isSpeaking
      ? (isRtl ? "إيقاف النطق" : "Aussprache stoppen")
      : (isRtl ? "استمع إلى نطق الكلمة" : "Aussprache anh\u00f6ren");

  if (sessionComplete) {
    const remainingReview = B2CourseProgressService.getReviewVocabulary(unit, items).length;
    return (
      <section className="mx-auto max-w-3xl px-4 py-8" dir={isRtl ? "rtl" : "ltr"}>
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-lg">
          <h2 className="text-2xl font-black text-slate-900">
            {mode === "review"
              ? (isRtl ? "اكتملت جلسة المراجعة" : "Wiederholung abgeschlossen")
              : (isRtl ? "اكتملت دراسة مفردات الفصل" : "Kapitelwortschatz abgeschlossen")}
          </h2>
          {mode === "review" ? (
            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-emerald-50 p-4 text-emerald-800">
                <strong className="block text-2xl" dir="ltr">{reviewMastered}</strong>
                {isRtl ? "أصبحت معروفة" : "Jetzt gelernt"}
              </div>
              <div className="rounded-lg bg-rose-50 p-4 text-rose-800">
                <strong className="block text-2xl" dir="ltr">{remainingReview}</strong>
                {isRtl ? "ما زالت للمراجعة" : "Weiter wiederholen"}
              </div>
            </div>
          ) : remainingReview > 0 ? (
            <p className="mt-5 font-semibold text-slate-600">
              {isRtl
                ? `لديك ${remainingReview} كلمات تحتاج إلى مراجعة. يمكنك بدء جلسة المراجعة من صفحة الفصل.`
                : `${remainingReview} Wörter warten auf Wiederholung. Starte die Wiederholung auf der Kapitelseite.`}
            </p>
          ) : (
            <p className="mt-5 font-semibold text-emerald-700">
              {isRtl ? "جميع كلمات هذا الفصل معروفة الآن." : "Alle Wörter dieses Kapitels sind jetzt bekannt."}
            </p>
          )}
          <button type="button" onClick={onClose} className="mt-7 min-h-12 rounded-lg bg-blue-600 px-6 py-3 font-black text-white">
            {isRtl ? "العودة إلى الفصل" : "Zurück zum Kapitel"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-3xl px-4 py-8" dir={isRtl ? "rtl" : "ltr"}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <button type="button" onClick={onClose} className="flex min-h-11 items-center gap-2 font-bold text-slate-600">
          <ArrowLeft size={18} className={isRtl ? "rotate-180" : ""} />
          {isRtl ? "العودة إلى الوحدة" : "Zurück zum Kapitel"}
        </button>
        <span className="rounded-full bg-slate-900 px-4 py-2 text-xs font-black text-white" dir="ltr">
          {index + 1} / {items.length}
        </span>
      </div>

      <article className="min-h-[430px] rounded-lg border border-slate-200 bg-white p-6 shadow-lg sm:p-7">
        <div className="flex items-start justify-between gap-3" dir="ltr">
          <span className="rounded-lg bg-blue-100 px-3 py-1 text-xs font-black text-blue-700">{item.type}</span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => {
                B2CourseProgressService.setVocabularyDifficult(item.courseItemId, !progress.difficult);
                setRevision((value) => value + 1);
              }}
              className={`rounded-lg p-2 ${progress.difficult ? "bg-amber-100 text-amber-700" : "text-slate-400 hover:bg-slate-100"}`}
              aria-label={isRtl ? "كلمة صعبة" : "Schwierig"}
            ><AlertCircle size={21} /></button>
            <button
              type="button"
              onClick={() => {
                B2CourseProgressService.toggleFavorite(item.courseItemId);
                setRevision((value) => value + 1);
              }}
              className={`rounded-lg p-2 ${favorite ? "bg-rose-50 text-rose-600" : "text-slate-400 hover:bg-slate-100"}`}
              aria-label={isRtl ? "المفضلة" : "Favorit"}
            ><Heart size={21} className={favorite ? "fill-current" : ""} /></button>
          </div>
        </div>
        <div className="mt-12 flex items-center justify-center gap-3" dir="ltr">
          <h2 className="min-w-0 break-words text-center text-4xl font-black text-slate-900">{item.term}</h2>
          <button
            type="button"
            onClick={toggleSpeech}
            disabled={!speechSupported}
            aria-label={speechLabel}
            title={speechLabel}
            aria-pressed={isSpeaking}
            className={`flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg transition ${
              isSpeaking
                ? "bg-blue-600 text-white"
                : "border border-slate-200 bg-white text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-slate-300"
            }`}
          >
            {isSpeaking ? <Square size={18} className="animate-pulse" /> : <Volume2 size={21} />}
          </button>
        </div>
        {revealed ? (
          <div className="mt-9 space-y-4">
            <p className="text-center text-2xl font-bold text-blue-700" dir="rtl">{item.arabic}</p>
            {explanationLanguage === "de" ? (
              <p className="rounded-lg bg-slate-50 p-4 text-left font-semibold leading-7" dir="ltr">{item.explanation_de}</p>
            ) : (
              <p className="rounded-lg bg-slate-50 p-4 text-right leading-7 text-slate-600" dir="rtl">{item.explanation_ar}</p>
            )}
            {item.examples[0] && (
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-left font-semibold" dir="ltr">{item.examples[0].de}</p>
                <p className="mt-2 text-right text-slate-600" dir="rtl">{item.examples[0].ar}</p>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="mx-auto mt-16 flex min-h-12 items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 font-black text-white"
          >
            <Languages size={18} /> {isRtl ? "إظهار الشرح" : "Erklärung anzeigen"}
          </button>
        )}
      </article>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <button type="button" onClick={() => rate(false)} className="min-h-12 rounded-lg bg-rose-100 px-4 py-3 font-black text-rose-700">
          {mode === "review"
            ? (isRtl ? "ما زلت أحتاج مراجعتها" : "Weiter wiederholen")
            : (isRtl ? "أحتاج مراجعة" : "Noch üben")}
        </button>
        <button type="button" onClick={() => rate(true)} className="min-h-12 rounded-lg bg-emerald-100 px-4 py-3 font-black text-emerald-700">
          {mode === "review"
            ? (isRtl ? "أتقنتها" : "Jetzt gelernt")
            : (isRtl ? "عرفتها" : "Gewusst")}
        </button>
      </div>
      <div className="mt-4 flex justify-center gap-3" dir="ltr">
        <button type="button" onClick={() => move(-1)} className="rounded-lg border border-slate-200 bg-white p-3" aria-label="Previous"><ChevronLeft /></button>
        <button type="button" onClick={() => move(1)} className="rounded-lg border border-slate-200 bg-white p-3" aria-label="Next"><ChevronRight /></button>
      </div>
    </section>
  );
}
