import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpen, Check, ChevronRight, Dumbbell, RefreshCw } from "lucide-react";
import type { UserSettings } from "../../types";
import { B2CourseProgressService } from "./b2CourseProgressService";
import { B2CourseService } from "./b2CourseService";
import B2CourseExerciseTrainer from "./B2CourseExercises";
import B2CourseTrainer from "./B2CourseTrainer";
import B2CourseUnitPage from "./B2CourseUnitPage";
import type { B2CourseIndex, B2CourseUnitData, B2CourseVocabularyItem } from "./types";

interface Props {
  onNavigate: (page: string, params?: unknown) => void;
  settings: UserSettings;
}

type View = "overview" | "unit" | "vocabulary" | "exercises";

export default function B2CoursePage({ onNavigate, settings }: Props) {
  const isRtl = settings.language === "ar";
  const [view, setView] = useState<View>("overview");
  const [index, setIndex] = useState<B2CourseIndex | null>(null);
  const [units, setUnits] = useState<Map<number, B2CourseUnitData>>(new Map());
  const [selectedUnitNumber, setSelectedUnitNumber] = useState<number | null>(null);
  const [vocabulary, setVocabulary] = useState<B2CourseVocabularyItem[]>([]);
  const [trainerIndex, setTrainerIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadCourse = async () => {
    setLoading(true);
    setError("");
    try {
      B2CourseService.clearCache();
      const courseIndex = await B2CourseService.getIndex();
      const loadedUnits = await Promise.all(courseIndex.units.map((summary) => B2CourseService.getUnit(summary.unit)));
      setIndex(courseIndex);
      setUnits(new Map(loadedUnits.map((unit) => [unit.summary.unit, unit])));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCourse();
  }, []);

  const selectedUnit = selectedUnitNumber === null ? null : units.get(selectedUnitNumber) ?? null;
  const courseStats = useMemo(() => {
    if (!index) return { vocabulary: 0, exercises: 0, completed: 0 };
    const store = B2CourseProgressService.getStore();
    return {
      vocabulary: index.units.reduce((total, unit) => total + unit.vocabularyCount, 0),
      exercises: index.units.reduce((total, unit) => total + unit.exerciseCount, 0),
      completed: Object.values(store.exercises).filter((item) => item.completed).length,
    };
  }, [index, units, view]);

  const openUnit = async (unitNumber: number) => {
    setLoading(true);
    setError("");
    try {
      const [unitData, resolved] = await Promise.all([
        B2CourseService.getUnit(unitNumber),
        B2CourseService.getResolvedVocabulary(unitNumber),
      ]);
      setUnits((current) => new Map(current).set(unitNumber, unitData));
      setSelectedUnitNumber(unitNumber);
      setVocabulary(resolved);
      setView("unit");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  };

  if (view === "vocabulary" && selectedUnit) {
    return (
      <B2CourseTrainer
        items={vocabulary}
        unit={selectedUnit.summary.unit}
        isRtl={isRtl}
        initialIndex={trainerIndex}
        onClose={() => setView("unit")}
      />
    );
  }
  if (view === "exercises" && selectedUnit) {
    return (
      <B2CourseExerciseTrainer
        exercises={selectedUnit.exercises.exercises}
        unit={selectedUnit.summary.unit}
        isRtl={isRtl}
        initialIndex={trainerIndex}
        onClose={() => setView("unit")}
      />
    );
  }
  if (view === "unit" && selectedUnit) {
    return (
      <B2CourseUnitPage
        unit={selectedUnit}
        vocabulary={vocabulary}
        isRtl={isRtl}
        onBack={() => {
          setView("overview");
          setSelectedUnitNumber(null);
        }}
        onStartVocabulary={(startIndex) => {
          setTrainerIndex(startIndex);
          setView("vocabulary");
        }}
        onStartExercises={(startIndex) => {
          setTrainerIndex(startIndex);
          setView("exercises");
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8" dir={isRtl ? "rtl" : "ltr"}>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <button type="button" onClick={() => onNavigate("dashboard")} className="mb-3 flex min-h-11 items-center gap-2 text-sm font-bold text-slate-500">
            <ArrowLeft size={17} className={isRtl ? "rotate-180" : ""} /> {isRtl ? "لوحة التحكم" : "Dashboard"}
          </button>
          <h1 className="text-3xl font-black text-slate-900">{isRtl ? "كورس B2" : "B2 Kurs"}</h1>
          <p className="mt-2 max-w-3xl text-slate-600">
            {isRtl
              ? "وحدات مستقلة تضم المفردات والشرح والأمثلة والتمارين، مع تقدم محفوظ لهذا الكورس فقط."
              : "Eigenständige Einheiten mit Wortschatz, Erklärungen, Beispielen und Übungen sowie separatem Kursfortschritt."}
          </p>
        </div>
        <span className="rounded-lg bg-blue-100 px-4 py-2 text-sm font-black text-blue-700">B2</span>
      </div>

      {loading && (
        <div className="rounded-lg border border-slate-200 bg-white p-10 text-center font-bold text-slate-500">
          {isRtl ? "جاري تحميل الكورس..." : "Kurs wird geladen..."}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-5 text-rose-800">
          <p className="font-bold">{error}</p>
          <button type="button" onClick={() => void loadCourse()} className="mt-4 flex min-h-11 items-center gap-2 rounded-lg bg-rose-700 px-4 py-2 font-bold text-white">
            <RefreshCw size={17} /> {isRtl ? "إعادة المحاولة" : "Erneut versuchen"}
          </button>
        </div>
      )}

      {!loading && !error && index && (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-white p-4"><BookOpen className="text-blue-600" /><strong className="mt-2 block text-2xl" dir="ltr">{courseStats.vocabulary}</strong><span className="text-sm text-slate-500">{isRtl ? "مفردة جديدة" : "neue Begriffe"}</span></div>
            <div className="rounded-lg border border-slate-200 bg-white p-4"><Dumbbell className="text-emerald-600" /><strong className="mt-2 block text-2xl" dir="ltr">{courseStats.exercises}</strong><span className="text-sm text-slate-500">{isRtl ? "تمرينًا" : "Übungen"}</span></div>
            <div className="rounded-lg border border-slate-200 bg-white p-4"><Check className="text-violet-600" /><strong className="mt-2 block text-2xl" dir="ltr">{courseStats.completed}</strong><span className="text-sm text-slate-500">{isRtl ? "تمرينًا منجزًا" : "abgeschlossen"}</span></div>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {index.units.map((summary) => {
              const unit = units.get(summary.unit);
              const vocabularyIds = unit?.vocabulary.items.map((item) => item.courseItemId) ?? [];
              const exerciseIds = unit?.exercises.exercises.map((exercise) => exercise.id) ?? [];
              const stats = B2CourseProgressService.getUnitStats(vocabularyIds, exerciseIds);
              const reusedCount = unit?.vocabulary.reusedVocabularyRefs?.length ?? 0;
              return (
                <button
                  key={summary.unit}
                  type="button"
                  onClick={() => void openUnit(summary.unit)}
                  className="group rounded-lg border border-slate-200 bg-white p-6 text-start shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-black text-white" dir="ltr">Einheit {String(summary.unit).padStart(2, "0")}</span>
                    <span className="text-sm font-black text-slate-500" dir="ltr">{stats.percent}%</span>
                  </div>
                  <h2 className="mt-5 text-xl font-black leading-8 text-slate-900">{isRtl ? summary.title_ar : summary.title_de}</h2>
                  <p className="mt-2 text-sm text-slate-500" dir="ltr">S. {summary.pages[0]}-{summary.pages[1]}</p>
                  <div className="mt-5 grid grid-cols-2 gap-3 text-center text-sm">
                    <div className="rounded-lg bg-slate-50 p-3"><strong className="block text-xl" dir="ltr">{summary.vocabularyCount}</strong>{isRtl ? "مفردة جديدة" : "Begriffe"}</div>
                    <div className="rounded-lg bg-slate-50 p-3"><strong className="block text-xl" dir="ltr">{summary.exerciseCount}</strong>{isRtl ? "تمرين" : "Übungen"}</div>
                  </div>
                  {reusedCount > 0 && <p className="mt-3 text-xs font-semibold text-slate-500">{isRtl ? `+ ${reusedCount} مفردات مرتبطة من وحدات سابقة` : `+ ${reusedCount} verknüpfte Begriffe aus früheren Einheiten`}</p>}
                  <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-blue-600" style={{ width: `${stats.percent}%` }} /></div>
                  <span className="mt-4 flex items-center justify-end gap-1 text-sm font-bold text-blue-600">
                    {isRtl ? "فتح الوحدة" : "Einheit öffnen"}<ChevronRight size={17} className={isRtl ? "rotate-180" : ""} />
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
