import { useState, useEffect } from "react";
import { ArrowLeft, AlertTriangle, ChevronRight, Eye, Check, X, Award, RotateCw, BookOpen, Bookmark } from "lucide-react";
import { DataService } from "../services/dataService";
import { ProgressService } from "../services/progressService";
import { AudioService } from "../services/audioService";
import { Verb, Vocabulary, UserSettings } from "../types";
import AudioButton from "../components/AudioButton";

interface ReviewProps {
  onNavigate: (page: string) => void;
  settings: UserSettings;
}

interface ReviewItem {
  key: string; // "verb-X" or "vocab-Y"
  type: "verb" | "vocab";
  term: string; // infinitiv or term
  arabic: string;
  details: string; // e.g. "Präsens, Präteritum, Perfekt" or "Type, Chapter"
  itemObj: any;
}

export default function Review({ onNavigate, settings }: ReviewProps) {
  const [loading, setLoading] = useState(true);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);

  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const isRtl = settings.language === "ar";
  const ui = isRtl
    ? {
        loading: "جاري تحميل العناصر الصعبة...",
        excellent: "ممتاز!",
        empty: "لا توجد حالياً عناصر صعبة للمراجعة. تابع التدريب وسيظهر هنا أي عنصر يحتاج تركيزاً إضافياً.",
        dashboard: "لوحة التحكم",
        reviewTitle: "عناصر صعبة",
        reviewDone: "انتهت المراجعة!",
        reviewDoneDesc: "راجعت العناصر الصعبة التي كانت تحتاج تركيزاً إضافياً.",
        known: "عرفتها",
        forgotten: "نسيتها",
        backDashboard: "العودة إلى لوحة التحكم",
        word: "كلمة",
        of: "من",
        solved: "محلول",
        open: "متبقٍ",
        difficult: "صعب",
        verb: "فعل",
        vocabulary: "مفردات",
        details: "التفاصيل",
        reveal: "إظهار الإجابة",
        forgot: "لم أعرفها",
        knew: "عرفتها",
      }
    : {
        loading: "Lade schwierige Wörter...",
        excellent: "Hervorragend!",
        empty: "Du hast derzeit keine schwierigen Wörter auf deiner Wiederholungsliste. Mach weiter so!",
        dashboard: "Dashboard",
        reviewTitle: "Difficult Review",
        reviewDone: "Review abgeschlossen!",
        reviewDoneDesc: "Du hast deine schwierigen Wörter wiederholt.",
        known: "Gewusst",
        forgotten: "Vergessen",
        backDashboard: "Zurück zum Dashboard",
        word: "Wort",
        of: "von",
        solved: "Gelöst",
        open: "Offen",
        difficult: "Schwierig",
        verb: "Verb",
        vocabulary: "Wortschatz",
        details: "Details",
        reveal: "Antwort aufdecken",
        forgot: "Ich wusste es nicht",
        knew: "Ich wusste es",
      };

  useEffect(() => {
    async function loadDifficultItems() {
      try {
        const verbs = await DataService.getVerbs();
        const vocab = await DataService.getVocabulary();

        const difficultKeys = ProgressService.getDifficultKeys();
        const keysSet = new Set(difficultKeys);

        const list: ReviewItem[] = [];

        verbs.forEach((v) => {
          const key = `verb-${v.id}`;
          if (keysSet.has(key)) {
            list.push({
              key,
              type: "verb",
              term: v.infinitiv,
              arabic: v.arabic,
              details: `${v.praesens} | ${v.praeteritum} | ${v.perfekt}`,
              itemObj: v,
            });
          }
        });

        vocab.forEach((item) => {
          const key = `vocab-${item.id}`;
          if (keysSet.has(key)) {
            list.push({
              key,
              type: "vocab",
              term: item.term,
              arabic: item.arabic,
              details: `${item.type} ${item.chapter ? `• Kapitel ${item.chapter}` : ""}`,
              itemObj: item,
            });
          }
        });

        // Randomize list
        list.sort(() => Math.random() - 0.5);
        setReviewItems(list);
      } catch (e) {
        console.error("Error loading review items", e);
      } finally {
        setLoading(false);
      }
    }

    loadDifficultItems();
  }, []);

  const handleKnew = () => {
    const item = reviewItems[currentIndex];
    ProgressService.recordReview(item.key, true);
    setCorrectCount((prev) => prev + 1);
    handleNext();
  };

  const handleForgot = () => {
    const item = reviewItems[currentIndex];
    ProgressService.recordReview(item.key, false);
    setWrongCount((prev) => prev + 1);
    handleNext();
  };

  const handleNext = () => {
    const nextIdx = currentIndex + 1;
    if (nextIdx >= reviewItems.length) {
      setFinished(true);
    } else {
      setCurrentIndex(nextIdx);
      setShowAnswer(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-gray-500 font-medium">{ui.loading}</p>
      </div>
    );
  }

  if (reviewItems.length === 0 && !finished) {
    return (
      <div className="max-w-md mx-auto text-center p-8 bg-white border border-slate-100 rounded-2xl shadow-sm space-y-4" dir={isRtl ? "rtl" : "ltr"}>
        <span className="p-3 bg-emerald-50 text-emerald-600 rounded-full inline-flex items-center justify-center">
          <Check size={36} />
        </span>
        <h2 className="text-xl font-bold text-slate-800">{ui.excellent}</h2>
        <p className="text-xs text-gray-500">
          {ui.empty}
        </p>
        <button
          onClick={() => onNavigate("dashboard")}
          className="inline-flex items-center justify-center px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
        >
          {ui.dashboard}
        </button>
      </div>
    );
  }

  const currentItem = reviewItems[currentIndex];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 space-y-6" dir={isRtl ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <button
          onClick={() => onNavigate("dashboard")}
          className="inline-flex items-center text-xs uppercase tracking-wider font-bold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className={`${isRtl ? "ml-1.5 rotate-180" : "mr-1.5"}`} size={16} /> {ui.dashboard}
        </button>
        <div className={`flex items-center space-x-2 text-rose-600 ${isRtl ? "space-x-reverse" : ""}`}>
          <AlertTriangle size={18} />
          <span className="text-xs font-bold uppercase tracking-wider">{ui.reviewTitle}</span>
        </div>
      </div>

      {finished ? (
        <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-100 shadow-xl max-w-lg mx-auto text-center space-y-6">
          <span className="p-3 bg-indigo-50 text-indigo-600 rounded-full inline-flex items-center justify-center">
            <Award size={36} />
          </span>
          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-black text-slate-800">{ui.reviewDone}</h2>
            <p className="text-xs text-gray-500">{ui.reviewDoneDesc}</p>
          </div>

          <div className="grid grid-cols-2 gap-4 py-4 border-y border-slate-50">
            <div className="p-4 bg-emerald-50/50 rounded-xl">
              <span className="text-xs text-emerald-800 font-semibold uppercase tracking-wider block">{ui.known}</span>
              <span className="text-2xl font-bold text-emerald-600">{correctCount}</span>
            </div>
            <div className="p-4 bg-rose-50/50 rounded-xl">
              <span className="text-xs text-rose-800 font-semibold uppercase tracking-wider block">{ui.forgotten}</span>
              <span className="text-2xl font-bold text-rose-600">{wrongCount}</span>
            </div>
          </div>

          <button
            onClick={() => onNavigate("dashboard")}
            className="w-full inline-flex items-center justify-center px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
          >
            {ui.backDashboard}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Progress Indicator */}
          <div className="flex items-center justify-between text-xs font-semibold text-gray-500">
            <span>
              {ui.word} {currentIndex + 1} {ui.of} {reviewItems.length}
            </span>
            <span>{ui.solved}: {correctCount} • {ui.open}: {reviewItems.length - currentIndex}</span>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-rose-500 h-full transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / reviewItems.length) * 100}%` }}
            />
          </div>

          {/* Review Card */}
          <div className="bg-white rounded-2xl border border-rose-100 shadow-md p-6 sm:p-8 flex flex-col justify-between min-h-[250px] relative space-y-4">
            <div className="flex justify-between items-start">
              <div className={`flex items-center space-x-2 ${isRtl ? "space-x-reverse" : ""}`}>
                <span className="bg-rose-50 text-rose-700 text-xs px-2.5 py-0.5 rounded font-bold uppercase flex items-center">
                  <AlertTriangle className={isRtl ? "ml-1" : "mr-1"} size={12} /> {ui.difficult}
                </span>
                <span className="bg-slate-100 text-slate-600 text-xs px-2.5 py-0.5 rounded font-semibold uppercase">
                  {currentItem.type === "verb" ? ui.verb : ui.vocabulary}
                </span>
              </div>
              <AudioButton text={currentItem.term} speed={settings.speechSpeed} />
            </div>

            <div className="text-center py-4">
              <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight">
                {currentItem.term}
              </h2>

              {(showAnswer || settings.showArabicImmediately) && (
                <p dir="rtl" className="text-2xl font-bold text-blue-600 mt-4 font-arabic">
                  {currentItem.arabic}
                </p>
              )}
            </div>

            {showAnswer && (
              <div className="border-t border-slate-50 pt-4 text-center">
                <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">{ui.details}</div>
                <div className="text-sm font-semibold text-slate-700">{currentItem.details}</div>
              </div>
            )}

            {showAnswer && currentItem.itemObj.example_de && (
              <div className="mt-4 p-4 bg-blue-50/50 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs sm:text-sm font-semibold text-slate-800">
                    {currentItem.itemObj.example_de}
                  </p>
                  <AudioButton
                    text={currentItem.itemObj.example_de}
                    speed={settings.speechSpeed}
                    size={16}
                    className="p-1.5"
                  />
                </div>
                {currentItem.itemObj.example_ar && (
                  <p dir="rtl" className="text-xs sm:text-sm font-bold text-blue-600 font-arabic text-right">
                    {currentItem.itemObj.example_ar}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex justify-center pt-2">
            {!showAnswer ? (
              <button
                onClick={() => setShowAnswer(true)}
                className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-colors cursor-pointer"
              >
                <Eye className={isRtl ? "ml-2" : "mr-2"} size={18} /> {ui.reveal}
              </button>
            ) : (
              <div className={`flex space-x-4 w-full sm:w-auto ${isRtl ? "space-x-reverse" : ""}`}>
                <button
                  onClick={handleForgot}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center px-8 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-md transition-colors cursor-pointer"
                >
                  <X className={isRtl ? "ml-2" : "mr-2"} size={18} /> {ui.forgot}
                </button>
                <button
                  onClick={handleKnew}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md cursor-pointer"
                >
                  <span>✓ {ui.knew}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
