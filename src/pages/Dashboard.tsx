import { useEffect, useState } from "react";
import { BookOpen, Award, AlertTriangle, Clock, RefreshCw, BarChart2, Play, Plus, UploadCloud, Shuffle } from "lucide-react";
import { DataService } from "../services/dataService";
import { ProgressService } from "../services/progressService";
import {
  detectArticle,
  detectAuxiliary,
  detectPlural,
  detectSeparable,
  detectVerbPrefix,
} from "../services/dataEnrichmentService.js";
import { LastSessionResult, UserSettings } from "../types";
import { getTranslation } from "../services/translationService";

interface DashboardProps {
  onNavigate: (page: string, params?: any) => void;
  id?: string;
  settings?: UserSettings;
}

export default function Dashboard({ onNavigate, id, settings }: DashboardProps) {
  const [stats, setStats] = useState({
    totalVerbs: 0,
    totalVocab: 0,
    learnedVerbs: 0,
    learnedVocab: 0,
    difficultVerbs: 0,
    difficultVocab: 0,
    dueVerbsCount: 0,
    dueVocabCount: 0,
    masteredVerbs: 0,
    masteredVocab: 0,
  });
  const [qualityStats, setQualityStats] = useState({
    verbsWithAuxiliary: 0,
    verbsWithTenseTables: 0,
    verbsNeedingReview: 0,
    separableVerbs: 0,
    nounsWithArticle: 0,
    vocabWithExamples: 0,
    vocabNeedingReview: 0,
    vocabWithPlural: 0,
  });

  const [lastSession, setLastSession] = useState<LastSessionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [recentDifficult, setRecentDifficult] = useState<any[]>([]);

  const currentLang = settings?.language || "de";
  const isRtl = currentLang === "ar";

  const translate = (key: any, params?: any) => getTranslation(currentLang, key, params);

  useEffect(() => {
    async function loadDashboardStats() {
      try {
        const verbs = await DataService.getVerbs();
        const vocab = await DataService.getVocabulary();

        const verbKeys = verbs.map((v) => `verb-${v.id}`);
        const vocabKeys = vocab.map((v) => `vocab-${v.id}`);

        const calculatedStats = ProgressService.getStats(verbKeys, vocabKeys);
        setStats(calculatedStats);
        setQualityStats({
          verbsWithAuxiliary: verbs.filter((v) => v.auxiliary || detectAuxiliary(v.perfekt || "")).length,
          verbsWithTenseTables: verbs.filter((v) => v.tenses && Object.keys(v.tenses).length > 0).length,
          verbsNeedingReview: verbs.filter((v) => v.dataMeta?.needsReview || v.tensesMeta?.needsReview).length,
          separableVerbs: verbs.filter((v) => v.separable ?? detectSeparable(v.prefix || detectVerbPrefix(v.infinitiv))).length,
          nounsWithArticle: vocab.filter((v) => (v.type === "Nomen" || v.article) && (v.article || detectArticle(v.term))).length,
          vocabWithExamples: vocab.filter((v) => v.example_de || v.example_ar).length,
          vocabNeedingReview: vocab.filter((v) => v.vocabMeta?.needsReview).length,
          vocabWithPlural: vocab.filter((v) => v.plural || detectPlural(v.term)).length,
        });

        const last = ProgressService.getLastSessionResult();
        setLastSession(last);

        // Fetch actual dynamic difficult items
        const progress = ProgressService.getProgress();
        const list: any[] = [];
        
        verbs.forEach((v) => {
          const p = progress[`verb-${v.id}`];
          if (p && p.difficulty === "difficult") {
            list.push({
              id: v.id,
              type: "verb",
              title: v.infinitiv,
              subtitle: `${v.praeteritum} • ${v.perfekt}`,
              translation: v.arabic,
              badge: `${translate("verb")} • B1`,
              statusColor: "bg-rose-400"
            });
          }
        });

        vocab.forEach((vc) => {
          const p = progress[`vocab-${vc.id}`];
          if (p && p.difficulty === "difficult") {
            list.push({
              id: vc.id,
              type: "vocab",
              title: vc.term,
              subtitle: `${vc.type === 'noun' ? translate('noun') : vc.type === 'verb' ? translate('verb') : vc.type === 'adjective' ? translate('adjective') : translate('word')}`,
              translation: vc.arabic,
              badge: `${translate("vocabularyTitle")} • ${vc.level}`,
              statusColor: "bg-amber-400"
            });
          }
        });

        // Removed fallback to high priority default study items

        setRecentDifficult(list.slice(0, 4));

      } catch (e) {
        console.error("Error loading dashboard data", e);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardStats();
  }, [currentLang]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center space-y-4">
          <RefreshCw className="animate-spin text-blue-600" size={32} />
          <p className="text-slate-500 font-medium">{translate("loading")}</p>
        </div>
      </div>
    );
  }

  const totalItems = stats.totalVerbs + stats.totalVocab;
  const totalLearned = stats.learnedVerbs + stats.learnedVocab;
  const totalDifficult = stats.difficultVerbs + stats.difficultVocab;
  const totalDue = stats.dueVerbsCount + stats.dueVocabCount;
  const totalMastered = stats.masteredVerbs + stats.masteredVocab;

  const progressPercent = totalItems > 0 ? Math.round((totalLearned / totalItems) * 100) : 0;
  const masteredPercent = totalItems > 0 ? Math.round((totalMastered / totalItems) * 100) : 0;

  const dailyGoalTarget = settings?.dailyGoal || 10;
  const todayKey = new Date().toDateString();
  const learnedTodayCount = Math.min(
    dailyGoalTarget,
    Object.values(ProgressService.getProgress()).filter((item) => {
      return item.lastReviewedAt && new Date(item.lastReviewedAt).toDateString() === todayKey;
    }).length
  );
  const dailyGoalPercent = Math.round((learnedTodayCount / dailyGoalTarget) * 100);
  const qualityLabels = isRtl
    ? {
        title: "جودة البيانات",
        verbsWithAuxiliary: "أفعال مع فعل مساعد",
        verbsWithTenseTables: "أفعال مع جداول أزمنة",
        verbsNeedingReview: "أفعال تحتاج مراجعة",
        separableVerbs: "أفعال قابلة للفصل",
        nounsWithArticle: "أسماء مع أداة تعريف",
        vocabWithExamples: "مفردات مع أمثلة",
        vocabNeedingReview: "مفردات تحتاج مراجعة",
        vocabWithPlural: "مفردات مع جمع",
      }
    : {
        title: "Data Quality",
        verbsWithAuxiliary: "Verbs with auxiliary",
        verbsWithTenseTables: "Verbs with tense tables",
        verbsNeedingReview: "Verbs needing review",
        separableVerbs: "Separable verbs",
        nounsWithArticle: "Nouns with article",
        vocabWithExamples: "Vocabulary with examples",
        vocabNeedingReview: "Vocabulary needing review",
        vocabWithPlural: "Vocabulary with plural",
      };
  const qualityCards = [
    { label: qualityLabels.verbsWithAuxiliary, value: qualityStats.verbsWithAuxiliary, color: "text-blue-600" },
    { label: qualityLabels.verbsWithTenseTables, value: qualityStats.verbsWithTenseTables, color: "text-emerald-600" },
    { label: qualityLabels.verbsNeedingReview, value: qualityStats.verbsNeedingReview, color: "text-amber-600" },
    { label: qualityLabels.separableVerbs, value: qualityStats.separableVerbs, color: "text-indigo-600" },
    { label: qualityLabels.nounsWithArticle, value: qualityStats.nounsWithArticle, color: "text-blue-600" },
    { label: qualityLabels.vocabWithExamples, value: qualityStats.vocabWithExamples, color: "text-emerald-600" },
    { label: qualityLabels.vocabNeedingReview, value: qualityStats.vocabNeedingReview, color: "text-amber-600" },
    { label: qualityLabels.vocabWithPlural, value: qualityStats.vocabWithPlural, color: "text-indigo-600" },
  ];

  return (
    <div id={id} className="space-y-6 max-w-6xl mx-auto px-4 sm:px-6" dir={isRtl ? "rtl" : "ltr"}>
      {/* Daily Goal Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center space-x-4 space-x-reverse w-full md:w-auto">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <Award size={24} />
          </div>
          <div className="space-y-1 flex-1">
            <h4 className="font-extrabold text-slate-800 text-sm sm:text-base">
              {translate("dailyGoal")} ({learnedTodayCount}/{dailyGoalTarget})
            </h4>
            <p className="text-xs text-slate-500">
              {dailyGoalPercent >= 100 ? translate("goalCompletedToday") : translate("keepGoingGoal")}
            </p>
          </div>
        </div>
        
        {/* Progress Bar */}
        <div className="w-full md:w-80 space-y-2">
          <div className="flex justify-between items-center text-xs font-bold text-slate-500 uppercase tracking-wider">
            <span>{translate("progress")}</span>
            <span className="text-indigo-600">{dailyGoalPercent}%</span>
          </div>
          <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div 
              className="bg-indigo-600 h-full rounded-full transition-all duration-750" 
              style={{ width: `${Math.min(100, dailyGoalPercent)}%` }} 
            />
          </div>
        </div>
      </div>

      {/* Statistics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Verbs Card */}
        <div className="bg-white p-5 rounded-xl border border-slate-250 shadow-xs flex flex-col justify-between">
          <div>
            <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">{translate("totalVerbs")}</p>
            <h3 className="text-2xl font-black text-slate-800">{stats.totalVerbs}</h3>
            <div className="mt-3 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="bg-blue-500 h-full transition-all duration-500" 
                style={{ width: `${stats.totalVerbs > 0 ? Math.min(100, Math.round((stats.learnedVerbs / stats.totalVerbs) * 100)) : 0}%` }} 
              />
            </div>
          </div>
          <p className="text-[10px] text-slate-400 mt-3 font-semibold uppercase tracking-wider">
            {translate("learned")}: <span className="text-slate-700">{stats.learnedVerbs}</span> • {translate("masterBadge")}: <span className="text-emerald-600">{stats.masteredVerbs}</span>
          </p>
        </div>

        {/* Mastered Card */}
        <div className="bg-white p-5 rounded-xl border border-slate-250 shadow-xs flex flex-col justify-between">
          <div>
            <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">{translate("mastered")}</p>
            <h3 className="text-2xl font-black text-emerald-600">{totalMastered}</h3>
            <p className="text-[10px] text-emerald-500 mt-2.5 font-bold uppercase tracking-wider">{masteredPercent}% {translate("completed")}</p>
          </div>
          <p className="text-[10px] text-slate-400 mt-1 font-semibold uppercase tracking-wider">
            {translate("totalVerbs")}: <span className="text-emerald-600">{stats.masteredVerbs}</span> • {translate("vocabularyTitle")}: <span className="text-emerald-600">{stats.masteredVocab}</span>
          </p>
        </div>

        {/* Difficult Card */}
        <div className="bg-white p-5 rounded-xl border border-slate-250 shadow-xs flex flex-col justify-between">
          <div>
            <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">{translate("difficultItems")}</p>
            <h3 className="text-2xl font-black text-rose-600">{totalDifficult}</h3>
            <p className="text-[10px] text-rose-500 mt-2.5 font-bold uppercase tracking-wider">{translate("reviewRecommended")}</p>
          </div>
          <p className="text-[10px] text-slate-400 mt-1 font-semibold uppercase tracking-wider">
            {translate("totalVerbs")}: <span className="text-rose-500">{stats.difficultVerbs}</span> • {translate("vocabularyTitle")}: <span className="text-rose-500">{stats.difficultVocab}</span>
          </p>
        </div>

        {/* Vocabulary Card */}
        <div className="bg-white p-5 rounded-xl border border-slate-250 shadow-xs flex flex-col justify-between">
          <div>
            <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">{translate("vocabularyTitle")}</p>
            <h3 className="text-2xl font-black text-slate-800">{stats.totalVocab}</h3>
            <div className="mt-3 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="bg-blue-400 h-full transition-all duration-500" 
                style={{ width: `${stats.totalVocab > 0 ? Math.min(100, Math.round((stats.learnedVocab / stats.totalVocab) * 100)) : 0}%` }} 
              />
            </div>
          </div>
          <p className="text-[10px] text-slate-400 mt-3 font-semibold uppercase tracking-wider">
            {translate("learned")}: <span className="text-slate-700">{stats.learnedVocab}</span> • {translate("masterBadge")}: <span className="text-emerald-600">{stats.masteredVocab}</span>
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
          {qualityLabels.title}
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {qualityCards.map((card) => (
            <div key={card.label} className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">{card.label}</p>
              <h4 className={`text-xl font-black ${card.color}`}>{card.value}</h4>
            </div>
          ))}
        </div>
      </div>

      {/* Main Actions & Focus List Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Start Training Card */}
        <div className="lg:col-span-7 bg-blue-900 rounded-2xl p-8 relative overflow-hidden flex flex-col justify-between text-white shadow-lg min-h-[340px]">
          <div className="relative z-10 max-w-md">
            <h2 className="text-3xl sm:text-4xl font-black mb-4 leading-tight">
              {translate("readyToLearn")}<br />
            </h2>
            <p className="text-blue-200 text-sm mb-8 leading-relaxed font-light">
              {translate("readyDesc")}
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => onNavigate("verbs")}
                className="bg-white text-blue-900 font-bold px-5 py-3 rounded-xl shadow-xl hover:bg-blue-50 transition-all cursor-pointer text-xs uppercase tracking-wider"
              >
                {translate("startVerbs")}
              </button>
              <button
                onClick={() => onNavigate("vocabulary")}
                className="bg-blue-750 text-white font-bold px-5 py-3 rounded-xl hover:bg-blue-800 transition-all cursor-pointer text-xs uppercase tracking-wider border border-blue-600/30"
              >
                {translate("startVocab")}
              </button>
              <button
                onClick={() => onNavigate("article-trainer")}
                className="bg-blue-750 text-white font-bold px-5 py-3 rounded-xl hover:bg-blue-800 transition-all cursor-pointer text-xs uppercase tracking-wider border border-blue-600/30"
              >
                {translate("startArticlePractice")}
              </button>
              <button
                onClick={() => onNavigate("plural-trainer")}
                className="bg-blue-750 text-white font-bold px-5 py-3 rounded-xl hover:bg-blue-800 transition-all cursor-pointer text-xs uppercase tracking-wider border border-blue-600/30"
              >
                {translate("startPluralPractice")}
              </button>
              <button
                onClick={() => onNavigate("phrase-trainer")}
                className="bg-blue-750 text-white font-bold px-5 py-3 rounded-xl hover:bg-blue-800 transition-all cursor-pointer text-xs uppercase tracking-wider border border-blue-600/30"
              >
                {translate("startPhrasePractice")}
              </button>
              <button
                onClick={() => onNavigate("verb-category-trainer")}
                className="bg-blue-750 text-white font-bold px-5 py-3 rounded-xl hover:bg-blue-800 transition-all cursor-pointer text-xs uppercase tracking-wider border border-blue-600/30"
              >
                {translate("startVerbCategoryPractice")}
              </button>
              
              {/* Quick Practice Mode Button */}
              <button
                onClick={() => onNavigate("quick")}
                className="bg-emerald-600 text-white font-bold px-5 py-3 rounded-xl hover:bg-emerald-700 transition-all cursor-pointer text-xs uppercase tracking-wider flex items-center space-x-2 space-x-reverse shadow-md"
              >
                <Shuffle size={14} />
                <span>{translate("quickPractice")}</span>
              </button>
            </div>
          </div>
          {/* Decorative Geometry */}
          <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-blue-850 rounded-full opacity-40 pointer-events-none" />
          <div className="absolute right-10 top-10 w-20 h-20 border-4 border-blue-400 rounded-full opacity-25 pointer-events-none" />
        </div>

        {/* Recent Difficult Words / Focus List */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl flex flex-col shadow-sm">
          <div className="p-5 border-b border-slate-100 flex justify-between items-center">
            <h3 className="font-bold text-slate-800">{translate("focusList")}</h3>
            <span className="text-[10px] uppercase font-bold tracking-widest bg-rose-50 text-rose-600 px-2 py-1 rounded">{translate("priority")}</span>
          </div>

          <div className="flex-1 p-2 space-y-1">
            {recentDifficult.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center text-slate-400">
                <p className="text-sm">{translate("noDifficultItemsYet") || "No difficult items yet"}</p>
              </div>
            ) : (
              recentDifficult.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl group transition-all">
                  <div className="flex items-center space-x-3.5 space-x-reverse">
                    <div className={`w-1.5 h-8 ${item.statusColor || 'bg-blue-400'} rounded-full shrink-0`} />
                    <div>
                      <p className="text-sm font-black text-slate-950 leading-tight">{item.title}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 font-mono">{item.subtitle}</p>
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end">
                    <p className="text-sm font-semibold text-slate-800" dir="rtl">{item.translation}</p>
                    <p className="text-[9px] text-slate-400 uppercase font-black tracking-tighter mt-1">{item.badge}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl">
            <button
              onClick={() => onNavigate("review")}
              className="w-full text-center text-xs font-bold text-blue-600 uppercase tracking-widest hover:text-blue-800 transition-colors cursor-pointer"
            >
              {translate("viewAllDifficult", { count: totalDifficult })}
            </button>
          </div>
        </div>
      </div>

      {/* Spaced Repetition Notification / Info banner if any due */}
      {totalDue > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-150 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start space-x-3 space-x-reverse">
            <span className="p-2.5 bg-amber-100 text-amber-700 rounded-lg">
              <Clock size={20} />
            </span>
            <div>
              <h4 className="font-bold text-amber-950 text-sm">{translate("dueRepetitions")}</h4>
              <p className="text-xs text-amber-800 mt-0.5">
                {translate("dueRepetitionsDesc", { count: totalDue, verbs: stats.dueVerbsCount, vocab: stats.dueVocabCount })}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              if (stats.dueVerbsCount > 0) {
                onNavigate("verbs");
              } else {
                onNavigate("vocabulary");
              }
            }}
            className="inline-flex items-center justify-center px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold uppercase tracking-widest rounded-lg transition-colors cursor-pointer shadow-xs"
          >
            {translate("reviewNow")}
          </button>
        </div>
      )}

      {/* Quick Add & Export Bar */}
      <footer className="flex flex-col sm:flex-row justify-between items-center pt-4 border-t border-slate-100 gap-4">
        <div className="flex space-x-3 space-x-reverse w-full sm:w-auto">
          <button 
            onClick={() => onNavigate("manage")}
            className="flex-1 sm:flex-initial flex items-center justify-center space-x-2 space-x-reverse text-xs font-bold uppercase tracking-wider text-slate-600 hover:text-blue-600 bg-white px-4 py-2.5 rounded-lg border border-slate-200 transition-colors cursor-pointer"
          >
            <Plus size={14} />
            <span>{translate("addNewWord")}</span>
          </button>
          <button 
            onClick={() => onNavigate("manage")}
            className="flex-1 sm:flex-initial flex items-center justify-center space-x-2 space-x-reverse text-xs font-bold uppercase tracking-wider text-slate-600 hover:text-blue-600 bg-white px-4 py-2.5 rounded-lg border border-slate-200 transition-colors cursor-pointer"
          >
            <UploadCloud size={14} />
            <span>{translate("importExport")}</span>
          </button>
        </div>
        <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
          {translate("dbSynced")} • <span className="text-slate-600">v1.0.5 Static</span>
        </div>
      </footer>
    </div>
  );
}
