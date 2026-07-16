import { useEffect, useMemo, useState } from "react";
import { AlertCircle, BookOpen, CheckCircle2, Clock, Play, RotateCcw } from "lucide-react";
import { B2GrammarProgressService } from "./b2GrammarProgressService";
import { findB2GrammarTopic, loadB2GrammarCourse } from "./b2GrammarService";
import B2GrammarUnitPage from "./B2GrammarUnitPage";
import { B2GrammarCourse, B2GrammarMode } from "./types";
import { UserSettings } from "../../types";

interface Props {
  settings: UserSettings;
}

export default function B2GrammarPage({ settings }: Props) {
  const language = settings.language === "ar" ? "ar" : "de";
  const isAr = language === "ar";
  const [course, setCourse] = useState<B2GrammarCourse | null>(null);
  const [error, setError] = useState("");
  const [selectedTopicId, setSelectedTopicId] = useState("");
  const [initialMode, setInitialMode] = useState<B2GrammarMode>("learn");
  const [progressRevision, setProgressRevision] = useState(0);

  useEffect(() => {
    let active = true;
    loadB2GrammarCourse()
      .then((loaded) => { if (active) setCourse(loaded); })
      .catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : String(loadError)); });
    return () => { active = false; };
  }, []);

  const selectedTopic = useMemo(
    () => course && selectedTopicId ? findB2GrammarTopic(course, selectedTopicId) : undefined,
    [course, selectedTopicId],
  );

  const openTopic = (topicId: string, mode: B2GrammarMode) => {
    setSelectedTopicId(topicId);
    setInitialMode(mode);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="border border-red-200 bg-red-50 p-6 rounded-lg">
          <AlertCircle className="text-red-600" size={28} />
          <h2 className="mt-3 text-xl font-black text-red-900">{isAr ? "تعذر تحميل بيانات قواعد B2" : "B2-Grammatik konnte nicht geladen werden"}</h2>
          <p className="mt-2 text-sm text-red-800" dir="ltr">{error}</p>
        </div>
      </div>
    );
  }

  if (!course) {
    return <div className="mx-auto max-w-6xl px-4 py-14 text-center font-bold text-slate-500">{isAr ? "جارٍ تحميل قواعد B2..." : "B2-Grammatik wird geladen..."}</div>;
  }

  if (selectedTopic) {
    const mixedId = selectedTopic.phaseId === "grammar-phase-1" ? "gr-10" : "gr-20";
    return (
      <B2GrammarUnitPage
        topic={selectedTopic}
        initialMode={initialMode}
        language={language}
        onBack={() => { setSelectedTopicId(""); setProgressRevision((value) => value + 1); }}
        onMixed={() => openTopic(mixedId, "mixed")}
        onProgress={() => setProgressRevision((value) => value + 1)}
      />
    );
  }

  const progress = B2GrammarProgressService.getProgress();
  const allIds = course.topics.flatMap((topic) => topic.exercises.map((exercise) => exercise.id));
  const known = allIds.filter((id) => progress.exercises[id]?.status === "known").length;
  const reviews = allIds.filter((id) => progress.exercises[id]?.unresolvedMistake).length;
  const overallPercent = Math.round((known / course.exerciseCount) * 100);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
      <header className="mb-8 border-b border-slate-200 pb-7">
        <p className="text-xs font-black uppercase text-blue-600">B2 · Grammatik</p>
        <h1 className="mt-2 text-3xl font-black text-slate-950">{isAr ? "قواعد B2" : "B2 Grammatik"}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
          {isAr ? "عشرون وحدة مستقلة للتعلّم والتدريب ومراجعة الأخطاء، مع حفظ تقدمك محليًا." : "Zwanzig Einheiten zum Lernen, Üben und Wiederholen mit lokal gespeichertem Fortschritt."}
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="border border-slate-200 bg-white p-4 rounded-lg"><span className="text-xs font-bold text-slate-500">{isAr ? "الوحدات" : "Einheiten"}</span><p className="mt-1 text-2xl font-black">{course.topics.length}</p></div>
          <div className="border border-slate-200 bg-white p-4 rounded-lg"><span className="text-xs font-bold text-slate-500">{isAr ? "التمارين" : "Übungen"}</span><p className="mt-1 text-2xl font-black">{course.exerciseCount}</p></div>
          <div className="border border-slate-200 bg-white p-4 rounded-lg"><span className="text-xs font-bold text-slate-500">{isAr ? "التقدم" : "Fortschritt"}</span><p className="mt-1 text-2xl font-black">{overallPercent}%</p></div>
        </div>
        {reviews > 0 && <button type="button" onClick={() => { const topic = course.topics.find((item) => item.exercises.some((exercise) => progress.exercises[exercise.id]?.unresolvedMistake)); if (topic) openTopic(topic.index.id, "mistakes"); }} className="mt-4 flex items-center gap-2 border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-black text-amber-900 rounded-lg"><RotateCcw size={18} />{isAr ? `${reviews} أخطاء تحتاج مراجعة` : `${reviews} offene Fehler wiederholen`}</button>}
      </header>

      <div className="space-y-10">
        {course.phases.map((phase) => {
          const phaseTopics = course.topics.filter((topic) => topic.phaseId === phase.phaseId);
          return (
            <section key={phase.phaseId}>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black text-slate-900">{isAr ? phase.title_ar : phase.title_de}</h2>
                  <p className="mt-1 text-sm text-slate-500">{phase.topicCount} {isAr ? "وحدات" : "Einheiten"} · {phase.exerciseCount} {isAr ? "تمرينًا" : "Übungen"}</p>
                </div>
                <button type="button" onClick={() => openTopic(phase.phaseId === "grammar-phase-1" ? "gr-10" : "gr-20", "mixed")} className="flex items-center gap-2 border border-slate-300 bg-white px-4 py-2 text-sm font-bold rounded-lg"><Play size={16} />{isAr ? "التدريب المختلط" : "Gemischtes Training"}</button>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {phaseTopics.map((topic) => {
                  const ids = topic.exercises.map((exercise) => exercise.id);
                  const stats = B2GrammarProgressService.getTopicStats(topic.index.id, ids);
                  const topicProgress = progress.topics[topic.index.id];
                  return (
                    <article key={topic.index.id} className={`border bg-white p-5 rounded-lg ${stats.percent === 100 ? "border-emerald-300" : stats.started ? "border-blue-300" : "border-slate-200"}`}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-black text-blue-600">{topic.index.id}</span>
                        {stats.percent === 100 ? <CheckCircle2 className="text-emerald-600" size={19} /> : <Clock className="text-slate-400" size={18} />}
                      </div>
                      <h3 className="mt-3 text-lg font-black text-slate-950" dir="ltr">{topic.index.title_de}</h3>
                      <p className="mt-1 font-bold text-slate-600" dir="rtl">{topic.index.title_ar}</p>
                      <div className="mt-4 flex items-center justify-between text-xs font-bold text-slate-500">
                        <span>{topic.exercises.length} {isAr ? "تمرينًا" : "Übungen"}</span>
                        <span>{stats.percent}%</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden bg-slate-100 rounded"><div className="h-full bg-blue-600" style={{ width: `${stats.percent}%` }} /></div>
                      {stats.review > 0 && <p className="mt-3 text-xs font-bold text-amber-700">{stats.review} {isAr ? "للمراجعة" : "zu wiederholen"}</p>}
                      <div className="mt-5 grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => openTopic(topic.index.id, "learn")} className="flex min-h-11 items-center justify-center gap-2 border border-slate-300 px-3 text-sm font-bold rounded-lg"><BookOpen size={16} />{isAr ? "تعلّم" : "Lernen"}</button>
                        <button type="button" onClick={() => openTopic(topic.index.id, "practice")} className="flex min-h-11 items-center justify-center gap-2 bg-blue-600 px-3 text-sm font-bold text-white rounded-lg"><Play size={16} />{stats.percent === 100 ? (isAr ? "إعادة" : "Wiederholen") : topicProgress ? (isAr ? "متابعة" : "Fortsetzen") : (isAr ? "ابدأ" : "Starten")}</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <span className="sr-only">{progressRevision}</span>
    </div>
  );
}
