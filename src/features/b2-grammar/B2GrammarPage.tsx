import { useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, BookOpen, CheckCircle2, Clock, Play, RotateCcw } from "lucide-react";
import { B2GrammarProgressService } from "./b2GrammarProgressService";
import {
  clearB2GrammarCache,
  loadB2GrammarCatalog,
  loadB2GrammarTopic,
} from "./b2GrammarService";
import B2GrammarUnitPage from "./B2GrammarUnitPage";
import { B2GrammarCatalog, B2GrammarMode, B2GrammarTopic } from "./types";
import { UserSettings } from "../../types";

interface Props {
  onNavigate: (page: string, params?: unknown) => void;
  settings: UserSettings;
}

const GRAMMAR_MODES: readonly B2GrammarMode[] = ["learn", "practice", "mistakes", "mixed"];

function readGrammarRoute(): { topicId: string; mode: B2GrammarMode } {
  const [page, topicId = "", rawMode = "learn"] = window.location.hash.slice(1).split("/");
  const mode = GRAMMAR_MODES.includes(rawMode as B2GrammarMode) ? rawMode as B2GrammarMode : "learn";
  return page === "b2-grammar" && /^gr-\d{2}$/.test(topicId) ? { topicId, mode } : { topicId: "", mode: "learn" };
}

function setGrammarRoute(topicId = "", mode: B2GrammarMode = "learn"): void {
  const suffix = topicId ? `/${topicId}/${mode}` : "";
  window.history.pushState(null, "", `${window.location.pathname}${window.location.search}#b2-grammar${suffix}`);
}

export default function B2GrammarPage({ onNavigate, settings }: Props) {
  const language = settings.language === "ar" ? "ar" : "de";
  const isAr = language === "ar";
  const [catalog, setCatalog] = useState<B2GrammarCatalog | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<B2GrammarTopic | null>(null);
  const [topicLoading, setTopicLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedTopicId, setSelectedTopicId] = useState(() => readGrammarRoute().topicId);
  const [initialMode, setInitialMode] = useState<B2GrammarMode>(() => readGrammarRoute().mode);
  const [progressRevision, setProgressRevision] = useState(0);
  const [retryRevision, setRetryRevision] = useState(0);

  useEffect(() => {
    let active = true;
    loadB2GrammarCatalog()
      .then((loaded) => { if (active) setCatalog(loaded); })
      .catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : String(loadError)); });
    return () => { active = false; };
  }, [retryRevision]);

  useEffect(() => {
    if (!catalog || !selectedTopicId) {
      setSelectedTopic(null);
      setTopicLoading(false);
      return;
    }
    let active = true;
    setTopicLoading(true);
    setError("");
    loadB2GrammarTopic(selectedTopicId)
      .then((topic) => { if (active) setSelectedTopic(topic); })
      .catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : String(loadError)); })
      .finally(() => { if (active) setTopicLoading(false); });
    return () => { active = false; };
  }, [catalog, selectedTopicId, retryRevision]);

  useEffect(() => {
    const syncRoute = () => {
      const route = readGrammarRoute();
      setSelectedTopicId(route.topicId);
      setSelectedTopic((current) => current?.index.id === route.topicId ? current : null);
      setInitialMode(route.mode);
    };
    window.addEventListener("popstate", syncRoute);
    window.addEventListener("hashchange", syncRoute);
    return () => {
      window.removeEventListener("popstate", syncRoute);
      window.removeEventListener("hashchange", syncRoute);
    };
  }, []);

  const openTopic = (topicId: string, mode: B2GrammarMode) => {
    setGrammarRoute(topicId, mode);
    setSelectedTopicId(topicId);
    setSelectedTopic((current) => current?.index.id === topicId ? current : null);
    setInitialMode(mode);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const retry = () => {
    clearB2GrammarCache(selectedTopicId || undefined);
    setError("");
    setRetryRevision((value) => value + 1);
  };

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="border border-red-200 bg-red-50 p-6 rounded-lg">
          <AlertCircle className="text-red-600" size={28} />
          <h2 className="mt-3 text-xl font-black text-red-900">{isAr ? "تعذر تحميل بيانات قواعد B2" : "B2-Grammatik konnte nicht geladen werden"}</h2>
          <p className="mt-2 text-sm text-red-800" dir="ltr">{error}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={retry} className="min-h-11 rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white">{isAr ? "إعادة المحاولة" : "Erneut versuchen"}</button>
            {selectedTopicId && <button type="button" onClick={() => { setGrammarRoute(); setSelectedTopicId(""); setSelectedTopic(null); setError(""); }} className="min-h-11 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-bold text-red-800">{isAr ? "العودة إلى الوحدات" : "Zurück zu den Einheiten"}</button>}
          </div>
        </div>
      </div>
    );
  }

  if (!catalog || topicLoading) {
    return <div className="mx-auto max-w-6xl px-4 py-14 text-center font-bold text-slate-500">{isAr ? "جارٍ تحميل قواعد B2..." : "B2-Grammatik wird geladen..."}</div>;
  }

  if (selectedTopic) {
    const mixedId = catalog.topics
      .filter((topic) => topic.phaseId === selectedTopic.phaseId)
      .sort((a, b) => a.index.order - b.index.order)
      .at(-1)?.index.id ?? selectedTopic.index.id;
    return (
      <B2GrammarUnitPage
        topic={selectedTopic}
        initialMode={initialMode}
        language={language}
        onBack={() => { setGrammarRoute(); setSelectedTopicId(""); setSelectedTopic(null); setProgressRevision((value) => value + 1); }}
        onModeChange={(mode) => { setGrammarRoute(selectedTopic.index.id, mode); setInitialMode(mode); }}
        onMixed={() => openTopic(mixedId, "mixed")}
        onProgress={() => setProgressRevision((value) => value + 1)}
      />
    );
  }

  const progress = B2GrammarProgressService.getProgress();
  const progressEntries = Object.entries(progress.exercises);
  const known = progressEntries.filter(([, item]) => item.status === "known").length;
  const reviews = progressEntries.filter(([, item]) => item.unresolvedMistake).length;
  const overallPercent = Math.round((Math.min(known, catalog.exerciseCount) / catalog.exerciseCount) * 100);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
      <header className="mb-8 border-b border-slate-200 pb-7">
        <button
          type="button"
          onClick={() => onNavigate("b2-course")}
          className="mb-4 flex min-h-11 items-center gap-2 text-sm font-bold text-slate-500 hover:text-blue-700"
        >
          <ArrowLeft size={17} className={isAr ? "rotate-180" : ""} />
          {isAr ? "العودة إلى كورس B2" : "Zurück zum B2 Kurs"}
        </button>
        <p className="text-xs font-black uppercase text-blue-600">B2 · Grammatik</p>
        <h1 className="mt-2 text-3xl font-black text-slate-950">{isAr ? "قواعد B2" : "B2 Grammatik"}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
          {isAr
            ? `${catalog.topics.length} وحدة مستقلة للتعلّم والتدريب ومراجعة الأخطاء، مع حفظ تقدمك محليًا.`
            : `${catalog.topics.length} Einheiten zum Lernen, Üben und Wiederholen mit lokal gespeichertem Fortschritt.`}
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="border border-slate-200 bg-white p-4 rounded-lg"><span className="text-xs font-bold text-slate-500">{isAr ? "الوحدات" : "Einheiten"}</span><p className="mt-1 text-2xl font-black">{catalog.topics.length}</p></div>
          <div className="border border-slate-200 bg-white p-4 rounded-lg"><span className="text-xs font-bold text-slate-500">{isAr ? "التمارين" : "Übungen"}</span><p className="mt-1 text-2xl font-black">{catalog.exerciseCount}</p></div>
          <div className="border border-slate-200 bg-white p-4 rounded-lg"><span className="text-xs font-bold text-slate-500">{isAr ? "التقدم" : "Fortschritt"}</span><p className="mt-1 text-2xl font-black">{overallPercent}%</p></div>
        </div>
        {reviews > 0 && <button type="button" onClick={() => { const mistakeId = progressEntries.find(([, item]) => item.unresolvedMistake)?.[0]; const topic = mistakeId ? catalog.topics.find((item) => mistakeId.startsWith(`${item.index.id.replace("-", "")}-`)) : undefined; if (topic) openTopic(topic.index.id, "mistakes"); }} className="mt-4 flex items-center gap-2 border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-black text-amber-900 rounded-lg"><RotateCcw size={18} />{isAr ? `${reviews} أخطاء تحتاج مراجعة` : `${reviews} offene Fehler wiederholen`}</button>}
      </header>

      <div className="space-y-10">
        {catalog.phases.map((phase) => {
          const phaseTopics = catalog.topics.filter((topic) => topic.phaseId === phase.phaseId);
          return (
            <section key={phase.phaseId}>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black text-slate-900">{isAr ? phase.title_ar : phase.title_de}</h2>
                  <p className="mt-1 text-sm text-slate-500">{phase.topicCount} {isAr ? "وحدات" : "Einheiten"} · {phase.exerciseCount} {isAr ? "تمرينًا" : "Übungen"}</p>
                </div>
                <button type="button" onClick={() => { const mixedTopic = phaseTopics.slice().sort((a, b) => a.index.order - b.index.order).at(-1); if (mixedTopic) openTopic(mixedTopic.index.id, "mixed"); }} className="flex items-center gap-2 border border-slate-300 bg-white px-4 py-2 text-sm font-bold rounded-lg"><Play size={16} />{isAr ? "التدريب المختلط" : "Gemischtes Training"}</button>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {phaseTopics.map((topic) => {
                  const stats = B2GrammarProgressService.getTopicSummaryStats(topic.index.id, topic.index.exerciseCount);
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
                        <span>{topic.index.exerciseCount} {isAr ? "تمرينًا" : "Übungen"}</span>
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
