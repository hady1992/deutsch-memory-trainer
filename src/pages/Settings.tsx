import React, { useState } from "react";
import {
  ArrowLeft,
  Settings as SettingsIcon,
  Volume2,
  Target,
  FileText,
  Trash2,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  Eye,
  Languages,
} from "lucide-react";
import { ProgressService } from "../services/progressService";
import { ImportExportService } from "../services/importExportService";
import { UserSettings } from "../types";
import { getTranslation } from "../services/translationService";

interface SettingsProps {
  onNavigate: (page: string) => void;
  settings: UserSettings;
  onUpdateSettings: (newSettings: UserSettings) => void;
}

export default function Settings({ onNavigate, settings, onUpdateSettings }: SettingsProps) {
  const [speed, setSpeed] = useState<"slow" | "normal" | "fast">(settings.speechSpeed);
  const [dailyGoal, setDailyGoal] = useState<number>(settings.dailyGoal || 10);
  const [questions, setQuestions] = useState<number>(settings.questionsPerSession);
  const [showArabic, setShowArabic] = useState<boolean>(settings.showArabicImmediately);
  const [autoPlay, setAutoPlay] = useState<boolean>(settings.autoPlayPronunciation);
  const [language, setLanguage] = useState<"de" | "ar">(settings.language || "de");

  const [message, setMessage] = useState<{ success: boolean; text: string } | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const translate = (key: any, params?: any) => getTranslation(language, key, params);

  const handleSave = () => {
    onUpdateSettings({
      speechSpeed: speed,
      dailyGoal,
      questionsPerSession: questions,
      showArabicImmediately: showArabic,
      autoPlayPronunciation: autoPlay,
      language,
    });
    setMessage({ success: true, text: translate("settingsSaved") });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleReset = () => {
    setShowResetConfirm(true);
  };

  const confirmReset = () => {
    ProgressService.resetProgress();
    setShowResetConfirm(false);
    setMessage({ success: true, text: translate("progressResetDone") });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleExportBackup = () => {
    ImportExportService.exportFullBackup();
    setMessage({ success: true, text: translate("backupDownloaded") });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        const result = ImportExportService.importFullBackup(parsed);

        if (result.success) {
          setMessage({ success: true, text: translate("backupRestored") });
          // Force page reload or trigger updates
          setTimeout(() => window.location.reload(), 1500);
        } else {
          setMessage({ success: false, text: `${translate("importError")}: ${result.error}` });
        }
      } catch (err: any) {
        setMessage({ success: false, text: `${translate("readError")}: ${err.message}` });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const isRtl = language === "ar";

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 space-y-6" dir={isRtl ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <button
          onClick={() => onNavigate("dashboard")}
          className="inline-flex items-center text-xs uppercase tracking-wider font-bold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
        >
          <ArrowLeft className={isRtl ? "ml-1.5" : "mr-1.5"} size={16} /> {translate("dashboard")}
        </button>
        <div className="flex items-center space-x-2 space-x-reverse text-slate-700">
          <SettingsIcon size={18} />
          <span className="text-xs font-bold uppercase tracking-wider">{translate("settings")}</span>
        </div>
      </div>

      {/* Alert message */}
      {message && (
        <div
          className={`p-4 rounded-xl flex items-center space-x-3 space-x-reverse border ${
            message.success
              ? "bg-emerald-50 border-emerald-100 text-emerald-800"
              : "bg-rose-50 border-rose-100 text-rose-800"
          }`}
        >
          {message.success ? (
            <CheckCircle2 className="text-emerald-600 shrink-0" size={18} />
          ) : (
            <AlertCircle className="text-rose-600 shrink-0" size={18} />
          )}
          <span className="text-xs font-bold">{message.text}</span>
        </div>
      )}

      {/* Settings Sections */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
        
        {/* Language Selection Setting */}
        <div className="p-6 sm:p-8 space-y-4">
          <h3 className="font-extrabold text-slate-800 text-sm flex items-center">
            <Languages className={`text-blue-600 ${isRtl ? "ml-2" : "mr-2"}`} size={18} /> {translate("uiLanguage")}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-500 block uppercase tracking-wider">
                {translate("chooseLanguage")}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(["de", "ar"] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLanguage(l)}
                    className={`py-2 px-3 border rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      language === l
                        ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                        : "border-slate-200 text-slate-700 bg-white hover:bg-slate-50"
                    }`}
                  >
                    {l === "de" ? "Deutsch (🇩🇪)" : "العربية (🇸🇦)"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Pronunciation & Audio */}
        <div className="p-6 sm:p-8 space-y-4">
          <h3 className="font-extrabold text-slate-800 text-sm flex items-center">
            <Volume2 className={`text-blue-600 ${isRtl ? "ml-2" : "mr-2"}`} size={18} /> {translate("audioPronunciation")}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-500 block uppercase tracking-wider">
                {translate("speechSpeed")}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["slow", "normal", "fast"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setSpeed(r)}
                    className={`py-2 px-3 border rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      speed === r
                        ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                        : "border-slate-200 text-slate-700 bg-white hover:bg-slate-50"
                    }`}
                  >
                    {r === "slow" && translate("slow")}
                    {r === "normal" && translate("normal")}
                    {r === "fast" && translate("fast")}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl mt-3 sm:mt-0">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-slate-800 block">{translate("autoPlay")}</span>
                <span className="text-[10px] text-gray-500">{translate("autoPlayDesc")}</span>
              </div>
              <button
                type="button"
                onClick={() => setAutoPlay(!autoPlay)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  autoPlay ? "bg-blue-600" : "bg-slate-200"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    autoPlay ? (isRtl ? "-translate-x-5" : "translate-x-5") : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Lesson goals & counts */}
        <div className="p-6 sm:p-8 space-y-4">
          <h3 className="font-extrabold text-slate-800 text-sm flex items-center">
            <Target className={`text-indigo-600 ${isRtl ? "ml-2" : "mr-2"}`} size={18} /> {translate("goalsLimits")}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-500 block uppercase tracking-wider">
                {translate("dailyGoalSetting")}
              </label>
              <div className="relative rounded-xl shadow-xs">
                <input
                  type="number"
                  min={1}
                  max={100}
                  dir="ltr"
                  lang="en"
                  inputMode="numeric"
                  value={dailyGoal}
                  onChange={(e) => setDailyGoal(Math.max(1, Number(e.target.value)))}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-xs font-bold bg-white text-left focus:outline-none focus:border-indigo-500"
                />
                <div className={`absolute inset-y-0 ${isRtl ? "left-0 pl-3" : "right-0 pr-3"} flex items-center pointer-events-none`}>
                  <span className="text-xs font-semibold text-slate-400 uppercase">{translate("qpWords")}</span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-500 block uppercase tracking-wider">
                {translate("questionsSession")}
              </label>
              <select
                dir="ltr"
                lang="en"
                value={questions}
                onChange={(e) => setQuestions(Number(e.target.value))}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-xs font-bold bg-white focus:outline-none focus:border-indigo-500"
              >
                <option value={5}>5 {translate("qpWords")}</option>
                <option value={10}>10 {translate("qpWords")}</option>
                <option value={20}>20 {translate("qpWords")}</option>
                <option value={30}>30 {translate("qpWords")}</option>
              </select>
            </div>
          </div>
        </div>

        {/* Translation settings */}
        <div className="p-6 sm:p-8 space-y-4">
          <h3 className="font-extrabold text-slate-800 text-sm flex items-center">
            <Eye className={`text-emerald-600 ${isRtl ? "ml-2" : "mr-2"}`} size={18} /> {translate("displayOptions")}
          </h3>

          <div className="pt-2">
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-slate-800 block">{translate("showArabicImmediately")}</span>
                <span className="text-[10px] text-gray-500">
                  {translate("showArabicImmediatelyDesc")}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowArabic(!showArabic)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  showArabic ? "bg-blue-600" : "bg-slate-200"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    showArabic ? (isRtl ? "-translate-x-5" : "translate-x-5") : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Export / import Backup & reset */}
        <div className="p-6 sm:p-8 space-y-4 bg-slate-50/50">
          <h3 className="font-extrabold text-slate-800 text-sm flex items-center">
            <FileText className={`text-slate-800 ${isRtl ? "ml-2" : "mr-2"}`} size={18} /> {translate("systemBackup")}
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            {translate("backupDesc")}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <button
              onClick={handleExportBackup}
              className="inline-flex items-center justify-center px-4 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
            >
              <Download className={`text-slate-600 ${isRtl ? "ml-2" : "mr-2"}`} size={14} /> {translate("exportBackup")}
            </button>

            <label className="relative inline-flex items-center justify-center px-4 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all">
              <Upload className={`text-slate-600 ${isRtl ? "ml-2" : "mr-2"}`} size={14} /> {translate("importBackup")}
              <input
                type="file"
                accept=".json"
                onChange={handleImportBackup}
                className="hidden"
              />
            </label>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <button
              onClick={handleReset}
              className="inline-flex items-center justify-center px-5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-100 font-bold text-xs uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
            >
              <Trash2 className={`text-rose-500 ${isRtl ? "ml-1.5" : "mr-1.5"}`} size={14} /> {translate("resetProgress")}
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button
          onClick={handleSave}
          className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-md transition-colors cursor-pointer"
        >
          {translate("saveSettings")}
        </button>
      </div>

      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-xl p-6 space-y-4">
            <div className="space-y-2">
              <h3 className="text-base font-extrabold text-slate-900">{translate("resetProgress")}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{translate("resetConfirm")}</p>
            </div>
            <div className={`flex justify-end gap-3 ${isRtl ? "flex-row-reverse" : ""}`}>
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
              >
                {translate("back")}
              </button>
              <button
                type="button"
                onClick={confirmReset}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
              >
                {translate("resetProgress")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
