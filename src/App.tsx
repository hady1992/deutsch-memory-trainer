import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  BookOpen,
  Bookmark,
  AlertTriangle,
  Database,
  Settings as SettingsIcon,
  Menu,
  X,
  GraduationCap,
  Sparkles,
  Shuffle,
  Clock,
  Languages,
  Target,
  Tags,
  Layers,
  MessageSquareText,
  ListChecks,
  CaseSensitive,
} from "lucide-react";

import Dashboard from "./pages/Dashboard";
import VerbTrainer from "./pages/VerbTrainer";
import VocabularyTrainer from "./pages/VocabularyTrainer";
import Review from "./pages/Review";
import ManageData from "./pages/ManageData";
import MistakeReview from "./pages/MistakeReview";
import Settings from "./pages/Settings";
import QuickPractice from "./pages/QuickPractice";
import {
  ArticleTrainer,
  PluralTrainer,
  AdjectiveTrainer,
  PhraseTrainer,
  GeneralVocabularyTrainer,
} from "./pages/SpecializedVocabularyTrainer";
import VerbCategoryTrainer from "./pages/VerbCategoryTrainer";

import { ProgressService } from "./services/progressService";
import { UserSettings } from "./types";
import { getTranslation, Language } from "./services/translationService";

const SETTINGS_KEY = "dmt_settings";

const defaultSettings: UserSettings = {
  speechSpeed: "normal",
  dailyGoal: 10,
  questionsPerSession: 10,
  showArabicImmediately: false,
  autoPlayPronunciation: true,
  language: "de",
};

import ZeitenTrainer from "./pages/ZeitenTrainer";

export default function App() {
  const [currentPage, setCurrentPage] = useState<string>("dashboard");
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dailyCompletedCount, setDailyCompletedCount] = useState(0);
  const [streakDays, setStreakDays] = useState(0);

  // Load User Settings
  useEffect(() => {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSettings({ ...defaultSettings, ...parsed });
      } catch (e) {
        console.error("Error parsing settings", e);
      }
    }
  }, []);

  // Update Daily Completed Count & Streak when page changes or app loads
  useEffect(() => {
    const progress = ProgressService.getProgress();
    const todayStr = new Date().toDateString();
    
    let count = 0;
    Object.values(progress).forEach((item: any) => {
      if (item.lastReviewedAt) {
        const revDate = new Date(item.lastReviewedAt).toDateString();
        if (revDate === todayStr) {
          count++;
        }
      }
    });
    setDailyCompletedCount(count);

    // Calculate streak
    const uniqueDates = new Set<string>();
    Object.values(progress).forEach((item: any) => {
      if (item.lastReviewedAt) {
        uniqueDates.add(new Date(item.lastReviewedAt).toDateString());
      }
    });

    let streak = 0;
    const checkDate = new Date();
    const todayKey = checkDate.toDateString();
    checkDate.setDate(checkDate.getDate() - 1);
    const yesterdayKey = checkDate.toDateString();

    if (uniqueDates.has(todayKey) || uniqueDates.has(yesterdayKey)) {
      let curr = new Date();
      if (!uniqueDates.has(todayKey) && uniqueDates.has(yesterdayKey)) {
        curr.setDate(curr.getDate() - 1);
      }
      while (uniqueDates.has(curr.toDateString())) {
        streak++;
        curr.setDate(curr.getDate() - 1);
      }
    }
    setStreakDays(streak);
  }, [currentPage]);

  const handleUpdateSettings = (newSettings: UserSettings) => {
    setSettings(newSettings);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
  };

  const handleNavigate = (page: string) => {
    setCurrentPage(page);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const lang = settings.language || "de";
  const isRtl = lang === "ar";

  const translate = (key: any, params?: any) => getTranslation(lang, key, params);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = isRtl ? "rtl" : "ltr";
    document.title = translate("title");
  }, [lang, isRtl]);

  const switchLanguage = (nextLang: Language) => {
    if (nextLang === lang) return;
    handleUpdateSettings({ ...settings, language: nextLang });
  };

  const languageOptions: Array<{ id: Language; label: string; short: string }> = [
    { id: "de", label: "Deutsch", short: "DE" },
    { id: "ar", label: "العربية", short: "AR" },
  ];

  const LanguageSwitcher = ({ compact = false }: { compact?: boolean }) => (
    <div
      dir="ltr"
      className={`inline-flex items-center rounded-full border border-slate-200 bg-white shadow-sm ${
        compact ? "h-9 p-0.5" : "h-10 p-1"
      }`}
      aria-label={translate("switchLanguage")}
      title={translate("switchLanguage")}
    >
      {!compact && <Languages className="mx-2 text-slate-500" size={16} />}
      {languageOptions.map((option) => {
        const isActive = lang === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => switchLanguage(option.id)}
            aria-pressed={isActive}
            className={`h-full rounded-full px-3 text-xs font-black transition-all cursor-pointer ${
              isActive
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            } ${compact ? "min-w-11" : "min-w-20"}`}
          >
            <span className={option.id === "ar" ? "font-sans" : ""}>
              {compact ? option.short : option.label}
            </span>
          </button>
        );
      })}
    </div>
  );

  const navItems = [
    { id: "dashboard", label: translate("dashboard"), icon: LayoutDashboard },
    { id: "verbs", label: translate("verbTrainer"), icon: BookOpen },
    { id: "zeiten", label: translate("tensesTrainer"), icon: Clock },
    { id: "vocabulary", label: translate("vocabulary"), icon: Bookmark },
    { id: "article-trainer", label: translate("articleTrainer"), icon: Tags },
    { id: "plural-trainer", label: translate("pluralTrainer"), icon: Layers },
    { id: "adjective-trainer", label: translate("adjectiveTrainer"), icon: CaseSensitive },
    { id: "phrase-trainer", label: translate("phraseTrainer"), icon: MessageSquareText },
    { id: "general-vocabulary-trainer", label: translate("generalVocabularyTrainer"), icon: ListChecks },
    { id: "verb-category-trainer", label: translate("verbCategoryTrainer"), icon: Target },
    { id: "quick", label: translate("quickPractice"), icon: Shuffle },
    { id: "review", label: translate("reviewMode"), icon: AlertTriangle },
    { id: "mistakes", label: translate("mistakeReview"), icon: Target },
    { id: "manage", label: translate("manageData"), icon: Database },
    { id: "settings", label: translate("settings"), icon: SettingsIcon },
  ];

  const dailyGoalPercent = Math.min(100, Math.round((dailyCompletedCount / (settings.dailyGoal || 10)) * 100));

  return (
    <div 
      className="min-h-screen bg-slate-50 flex text-slate-900 antialiased font-sans"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* DESKTOP SIDEBAR */}
      <aside 
        className={`hidden lg:flex flex-col w-64 bg-slate-900 text-white shrink-0 fixed h-full z-20 ${
          isRtl ? "right-0 border-l border-slate-800" : "left-0 border-r border-slate-800"
        }`}
      >
        {/* Logo / Header */}
        <div className="p-6 border-b border-slate-800 flex flex-col">
          <h1 className="text-xl font-bold tracking-tight text-blue-400 leading-tight">
            DEUTSCH<br />
            <span className="text-white">Memory Trainer</span>
          </h1>
          <span className="text-[10px] uppercase tracking-widest text-slate-400 mt-1 block font-semibold">
            {translate("levelSubtitle")}
          </span>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = currentPage === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => handleNavigate(item.id)}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  isRtl ? "space-x-reverse" : ""
                } ${
                  isActive
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/10"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Icon size={18} className={isActive ? "text-white" : "text-slate-400 group-hover:text-white"} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Daily Goal Card */}
        <div className="p-4 m-4 bg-slate-800/40 border border-slate-800/85 rounded-xl space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-slate-300">
            <span className="flex items-center">
              <Sparkles className={`text-blue-400 ${isRtl ? "ml-1.5" : "mr-1.5"}`} size={14} /> {translate("dailyGoal")}
            </span>
            <span>
              {dailyCompletedCount}/{settings.dailyGoal}
            </span>
          </div>
          <div className="w-full bg-slate-700/50 h-2 rounded-full overflow-hidden">
            <div
              className="bg-blue-500 h-full transition-all duration-500"
              style={{ width: `${dailyGoalPercent}%` }}
            />
          </div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block text-center">
            {dailyGoalPercent === 100 
              ? translate("goalAchieved") 
              : `${settings.dailyGoal - dailyCompletedCount} ${translate("remaining")}`
            }
          </span>
        </div>
      </aside>

      {/* MOBILE HEADER */}
      <div 
        className={`lg:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 z-40 shadow-sm`}
      >
        <div className="flex items-center space-x-2.5 space-x-reverse">
          <span className="p-1.5 bg-slate-900 text-blue-400 rounded-lg">
            <GraduationCap size={18} />
          </span>
          <span className="font-extrabold text-slate-900 text-sm tracking-tight uppercase">DEUTSCH</span>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher compact />
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            aria-label={mobileMenuOpen ? translate("closeMenu") : translate("openMenu")}
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* MOBILE DRAWER SIDEBAR */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs" onClick={() => setMobileMenuOpen(false)} />

          <aside 
            className={`relative flex flex-col w-64 max-w-xs bg-slate-900 text-white h-full shadow-2xl z-10 animate-slide-in ${
              isRtl ? "mr-auto" : "ml-auto"
            }`}
          >
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="font-bold text-blue-400 text-sm tracking-wider uppercase">DEUTSCH</span>
                <span className="text-[10px] text-slate-400">Memory Trainer</span>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
              {navItems.map((item) => {
                const isActive = currentPage === item.id;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavigate(item.id)}
                    className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                      isRtl ? "space-x-reverse" : ""
                    } ${
                      isActive
                        ? "bg-blue-600 text-white"
                        : "text-slate-400 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>

            {/* Daily Goal Card for Mobile */}
            <div className="p-4 m-4 bg-slate-800/40 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
                <span>{translate("dailyGoal")}</span>
                <span>{dailyCompletedCount}/{settings.dailyGoal}</span>
              </div>
              <div className="w-full bg-slate-700/50 h-1.5 rounded-full overflow-hidden">
                <div className="bg-blue-500 h-full" style={{ width: `${dailyGoalPercent}%` }} />
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* MAIN VIEW CONTENT CONTAINER */}
      <main 
        className={`flex-1 pt-16 lg:pt-0 min-h-screen flex flex-col justify-between transition-all ${
          isRtl ? "lg:pr-64 lg:pl-0" : "lg:pl-64 lg:pr-0"
        }`}
      >
        <div>
          {/* Top Header */}
          <header className="hidden lg:flex h-16 bg-white border-b border-slate-200 items-center justify-between px-8 shrink-0 z-10 sticky top-0">
            <div className="flex items-center space-x-4 space-x-reverse">
              <div className="bg-blue-50 text-blue-600 px-4 py-1.5 rounded-full text-xs font-black">
                {translate("goalProgress", { percent: dailyGoalPercent })}
              </div>
            </div>
            <div className="flex items-center space-x-6 space-x-reverse">
              <div className={isRtl ? "text-left" : "text-right"}>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-black">
                  {translate("learningStreak")}
                </p>
                <p className="text-sm font-black text-slate-800">
                  {streakDays} {streakDays === 1 ? translate("day") : translate("days")}
                </p>
              </div>
              
              <LanguageSwitcher />
            </div>
          </header>

          <div className="py-6 sm:py-8 md:py-10">
            {currentPage === "dashboard" && <Dashboard onNavigate={handleNavigate} settings={settings} />}
            {currentPage === "verbs" && <VerbTrainer onNavigate={handleNavigate} settings={settings} />}
            {currentPage === "zeiten" && <ZeitenTrainer onNavigate={handleNavigate} settings={settings} />}
            {currentPage === "vocabulary" && (
              <VocabularyTrainer onNavigate={handleNavigate} settings={settings} />
            )}
            {currentPage === "article-trainer" && (
              <ArticleTrainer onNavigate={handleNavigate} settings={settings} />
            )}
            {currentPage === "plural-trainer" && (
              <PluralTrainer onNavigate={handleNavigate} settings={settings} />
            )}
            {currentPage === "adjective-trainer" && (
              <AdjectiveTrainer onNavigate={handleNavigate} settings={settings} />
            )}
            {currentPage === "phrase-trainer" && (
              <PhraseTrainer onNavigate={handleNavigate} settings={settings} />
            )}
            {currentPage === "general-vocabulary-trainer" && (
              <GeneralVocabularyTrainer onNavigate={handleNavigate} settings={settings} />
            )}
            {currentPage === "verb-category-trainer" && (
              <VerbCategoryTrainer onNavigate={handleNavigate} settings={settings} />
            )}
            {currentPage === "quick" && (
              <QuickPractice onNavigate={handleNavigate} settings={settings} />
            )}
            {currentPage === "review" && <Review onNavigate={handleNavigate} settings={settings} />}
            {currentPage === "mistakes" && <MistakeReview onNavigate={handleNavigate} settings={settings} />}
            {currentPage === "manage" && <ManageData onNavigate={handleNavigate} settings={settings} />}
            {currentPage === "settings" && (
              <Settings
                onNavigate={handleNavigate}
                settings={settings}
                onUpdateSettings={handleUpdateSettings}
              />
            )}
          </div>
        </div>

        {/* Humblest footer */}
        <footer className="py-6 text-center border-t border-slate-200 text-[10px] text-gray-400 uppercase tracking-widest font-extrabold bg-white">
          {translate("footerText")}
        </footer>
      </main>
    </div>
  );
}
