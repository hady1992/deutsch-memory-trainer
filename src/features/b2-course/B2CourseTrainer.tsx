import { useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, ChevronLeft, ChevronRight, Heart, Languages } from "lucide-react";
import { B2CourseProgressService } from "./b2CourseProgressService";
import type { B2CourseVocabularyItem } from "./types";

interface Props {
  items: B2CourseVocabularyItem[];
  unit: number;
  isRtl: boolean;
  initialIndex: number;
  onClose: () => void;
}

export default function B2CourseTrainer({ items, unit, isRtl, initialIndex, onClose }: Props) {
  const [index, setIndex] = useState(Math.min(initialIndex, Math.max(0, items.length - 1)));
  const [revealed, setRevealed] = useState(false);
  const [, setRevision] = useState(0);
  const item = items[index];

  useEffect(() => {
    setRevealed(false);
    B2CourseProgressService.setResume(unit, { vocabularyIndex: index, lastMode: "vocabulary" });
  }, [index, unit]);

  if (!item) return null;
  const progress = B2CourseProgressService.getVocabularyProgress(item.courseItemId);
  const favorite = B2CourseProgressService.isFavorite(item.courseItemId);

  const move = (offset: number) => {
    setIndex((current) => (current + offset + items.length) % items.length);
  };
  const rate = (correct: boolean) => {
    B2CourseProgressService.recordVocabularyReview(item.courseItemId, correct);
    move(1);
  };

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
        <h2 className="mt-12 break-words text-center text-4xl font-black text-slate-900" dir="ltr">{item.term}</h2>
        {revealed ? (
          <div className="mt-9 space-y-4">
            <p className="text-center text-2xl font-bold text-blue-700" dir="rtl">{item.arabic}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <p className="rounded-lg bg-slate-50 p-4 text-left font-semibold leading-7" dir="ltr">{item.explanation_de}</p>
              <p className="rounded-lg bg-slate-50 p-4 text-right leading-7 text-slate-600" dir="rtl">{item.explanation_ar}</p>
            </div>
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
          {isRtl ? "أحتاج مراجعة" : "Noch üben"}
        </button>
        <button type="button" onClick={() => rate(true)} className="min-h-12 rounded-lg bg-emerald-100 px-4 py-3 font-black text-emerald-700">
          {isRtl ? "عرفتها" : "Gewusst"}
        </button>
      </div>
      <div className="mt-4 flex justify-center gap-3" dir="ltr">
        <button type="button" onClick={() => move(-1)} className="rounded-lg border border-slate-200 bg-white p-3" aria-label="Previous"><ChevronLeft /></button>
        <button type="button" onClick={() => move(1)} className="rounded-lg border border-slate-200 bg-white p-3" aria-label="Next"><ChevronRight /></button>
      </div>
    </section>
  );
}
