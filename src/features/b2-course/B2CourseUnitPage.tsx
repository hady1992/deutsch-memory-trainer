import { useState } from "react";
import { ArrowLeft, BookOpen, Dumbbell, Play, RefreshCcw, RotateCcw } from "lucide-react";
import { B2CourseProgressService } from "./b2CourseProgressService";
import { B2CourseExerciseList } from "./B2CourseExercises";
import B2CourseVocabulary from "./B2CourseVocabulary";
import type { B2CourseUnitData, B2CourseVocabularyItem } from "./types";

interface Props {
  unit: B2CourseUnitData;
  vocabulary: B2CourseVocabularyItem[];
  isRtl: boolean;
  onBack: () => void;
  onStartVocabulary: (itemId: string) => void;
  onStartReview: (itemId: string) => void;
  onStartExercises: (index: number) => void;
}

type UnitTab = "vocabulary" | "exercises";

export default function B2CourseUnitPage({
  unit,
  vocabulary,
  isRtl,
  onBack,
  onStartVocabulary,
  onStartReview,
  onStartExercises,
}: Props) {
  const [tab, setTab] = useState<UnitTab>("vocabulary");
  const [notice, setNotice] = useState("");
  const unitNumber = unit.summary.unit;
  const resume = B2CourseProgressService.getResume(unit.summary.unit);
  const vocabularyIds = vocabulary.map((item) => item.courseItemId);
  const exerciseIds = unit.exercises.exercises.map((exercise) => exercise.id);
  const stats = B2CourseProgressService.getUnitStats(unitNumber, vocabularyIds, exerciseIds);
  const reviewItems = B2CourseProgressService.getReviewVocabulary(unitNumber, vocabulary);

  const startVocabulary = () => {
    const next = B2CourseProgressService.getNextVocabularyItem(unitNumber, vocabulary);
    if (next) {
      setNotice("");
      onStartVocabulary(next.courseItemId);
      return;
    }
    setNotice(reviewItems.length
      ? (isRtl
        ? "اكتملت الدراسة الأساسية لهذا الفصل. ابدأ جلسة مراجعة الكلمات التي تحتاج إلى تثبيت."
        : "Der Kapitelwortschatz ist bearbeitet. Starte jetzt die Wiederholung.")
      : (isRtl
        ? "اكتملت جميع مفردات هذا الفصل."
        : "Alle Wörter dieses Kapitels sind abgeschlossen."));
  };

  const startReview = () => {
    const first = B2CourseProgressService.getReviewStartItem(unitNumber, reviewItems);
    if (!first) {
      setNotice(isRtl
        ? "لا توجد كلمات تحتاج إلى مراجعة في هذا الفصل."
        : "In diesem Kapitel gibt es keine Wörter zum Wiederholen.");
      return;
    }
    setNotice("");
    onStartReview(first.courseItemId);
  };

  const continueTraining = () => {
    if (resume.lastMode === "exercises") onStartExercises(resume.exerciseIndex);
    else startVocabulary();
  };

  const resetVocabulary = () => {
    const confirmed = window.confirm(isRtl
      ? "هل تريد إعادة دراسة مفردات هذا الفصل من البداية؟ لن يتغير تقدم التمارين أو المفضلة."
      : "Kapitelwortschatz wirklich neu lernen? Übungsfortschritt und Favoriten bleiben erhalten.");
    if (!confirmed) return;
    B2CourseProgressService.resetVocabularyProgress(unitNumber);
    setNotice("");
    const first = vocabulary[0];
    if (first) onStartVocabulary(first.courseItemId);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8" dir={isRtl ? "rtl" : "ltr"}>
      <button type="button" onClick={onBack} className="mb-5 flex min-h-11 items-center gap-2 text-sm font-bold text-slate-500">
        <ArrowLeft size={17} className={isRtl ? "rotate-180" : ""} />
        {isRtl ? "كل الوحدات" : "Alle Kapitel"}
      </button>

      <section className="rounded-lg bg-slate-900 p-6 text-white sm:p-8">
        <p className="text-sm font-black text-blue-300" dir="ltr">Kapitel {String(unit.summary.unit).padStart(2, "0")}</p>
        <h1 className="mt-2 text-2xl font-black sm:text-3xl">
          {isRtl ? unit.summary.title_ar : unit.summary.title_de}
        </h1>
        <p className="mt-2 text-sm text-slate-300" dir="ltr">Seiten {unit.summary.pages[0]}-{unit.summary.pages[1]}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={startVocabulary} className="flex min-h-12 items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 font-black">
            <BookOpen size={18} /> {isRtl ? "تدريب المفردات" : "Wortschatz trainieren"}
          </button>
          <button type="button" onClick={() => onStartExercises(0)} className="flex min-h-12 items-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 font-black">
            <Dumbbell size={18} /> {isRtl ? "ابدأ التمارين" : "Übungen starten"}
          </button>
          {resume.updatedAt && (
            <button type="button" onClick={continueTraining} className="flex min-h-12 items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-5 py-3 font-black">
              <Play size={18} /> {isRtl ? "متابعة من آخر موضع" : "Training fortsetzen"}
            </button>
          )}
          <button type="button" onClick={startReview} className="flex min-h-12 items-center gap-2 rounded-lg border border-amber-400 bg-amber-50 px-5 py-3 font-black text-amber-900">
            <RefreshCcw size={18} /> {isRtl ? `مراجعة الكلمات (${reviewItems.length})` : `Wörter wiederholen (${reviewItems.length})`}
          </button>
          {stats.reviewedVocabulary > 0 && (
            <button type="button" onClick={resetVocabulary} className="flex min-h-12 items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-5 py-3 font-black">
              <RotateCcw size={18} /> {isRtl ? "إعادة دراسة الفصل من البداية" : "Kapitel neu lernen"}
            </button>
          )}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
          <div className="rounded-lg bg-slate-800 p-3"><strong className="block text-xl" dir="ltr">{stats.vocabularyTotal}</strong><span className="text-xs text-slate-300">{isRtl ? "الإجمالي" : "Gesamt"}</span></div>
          <div className="rounded-lg bg-slate-800 p-3"><strong className="block text-xl" dir="ltr">{stats.reviewedVocabulary}</strong><span className="text-xs text-slate-300">{isRtl ? "مدروسة" : "Bearbeitet"}</span></div>
          <div className="rounded-lg bg-slate-800 p-3"><strong className="block text-xl" dir="ltr">{stats.knownVocabulary}</strong><span className="text-xs text-slate-300">{isRtl ? "معروفة" : "Bekannt"}</span></div>
          <div className="rounded-lg bg-slate-800 p-3"><strong className="block text-xl" dir="ltr">{stats.reviewVocabulary}</strong><span className="text-xs text-slate-300">{isRtl ? "للمراجعة" : "Wiederholen"}</span></div>
        </div>
      </section>

      {notice && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 font-semibold text-amber-900">
          {notice}
        </div>
      )}

      <div className="mt-6 flex gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
        <button
          type="button"
          onClick={() => setTab("vocabulary")}
          className={`min-h-12 flex-1 rounded-lg px-4 py-3 font-black ${tab === "vocabulary" ? "bg-blue-600 text-white" : "text-slate-600"}`}
        >{isRtl ? `المفردات (${vocabulary.length})` : `Wortschatz (${vocabulary.length})`}</button>
        <button
          type="button"
          onClick={() => setTab("exercises")}
          className={`min-h-12 flex-1 rounded-lg px-4 py-3 font-black ${tab === "exercises" ? "bg-blue-600 text-white" : "text-slate-600"}`}
        >{isRtl ? `التمارين (${unit.exercises.exercises.length})` : `Übungen (${unit.exercises.exercises.length})`}</button>
      </div>

      {tab === "vocabulary" ? (
        <B2CourseVocabulary items={vocabulary} isRtl={isRtl} />
      ) : (
        <B2CourseExerciseList exercises={unit.exercises.exercises} isRtl={isRtl} onStart={onStartExercises} />
      )}
    </div>
  );
}
