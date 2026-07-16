import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Dumbbell, RefreshCw, Shuffle } from "lucide-react";
import B2GrammarLesson from "./B2GrammarLesson";
import B2GrammarTrainer from "./B2GrammarTrainer";
import { B2GrammarLanguage, B2GrammarMode, B2GrammarTopic } from "./types";

interface Props {
  topic: B2GrammarTopic;
  initialMode: B2GrammarMode;
  language: B2GrammarLanguage;
  onBack: () => void;
  onMixed: () => void;
  onProgress: () => void;
}

export default function B2GrammarUnitPage({ topic, initialMode, language, onBack, onMixed, onProgress }: Props) {
  const [mode, setMode] = useState<B2GrammarMode>(initialMode);
  const isAr = language === "ar";

  useEffect(() => setMode(initialMode), [initialMode, topic.index.id]);

  const modes = [
    { id: "learn" as const, label: isAr ? "تعلّم" : "Lernen", icon: BookOpen },
    { id: "practice" as const, label: isAr ? "تدرّب" : "Üben", icon: Dumbbell },
    { id: "mistakes" as const, label: isAr ? "تدريب الأخطاء" : "Fehlertraining", icon: RefreshCw },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
      <button type="button" onClick={onBack} className="mb-5 flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-900">
        {isAr ? <ArrowRight size={18} /> : <ArrowLeft size={18} />}
        {isAr ? "كل وحدات القواعد" : "Alle Grammatikeinheiten"}
      </button>

      <header className="mb-6 border-b border-slate-200 pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="text-xs font-black uppercase text-blue-600">{topic.index.id} · B2</span>
            <h2 className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl" dir="ltr">{topic.index.title_de}</h2>
            <p className="mt-2 text-lg font-bold text-slate-600" dir="rtl">{topic.index.title_ar}</p>
          </div>
          <div className="border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 rounded-lg">
            {topic.exercises.length} {isAr ? "تمرينًا" : "Übungen"} · {topic.index.estimatedMinutes} min
          </div>
        </div>
      </header>

      <div className="mb-7 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {modes.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => setMode(id)} className={`flex min-h-12 items-center justify-center gap-2 border px-3 py-2 text-sm font-black rounded-lg ${mode === id ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-blue-300"}`}>
            <Icon size={17} /> {label}
          </button>
        ))}
        <button type="button" onClick={onMixed} className={`flex min-h-12 items-center justify-center gap-2 border px-3 py-2 text-sm font-black rounded-lg ${mode === "mixed" ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-blue-300"}`}>
          <Shuffle size={17} /> {isAr ? "تدريب مختلط" : "Gemischtes Training"}
        </button>
      </div>

      {mode === "learn" ? (
        <B2GrammarLesson lesson={topic.lesson} language={language} />
      ) : (
        <div key={`${topic.index.id}-${mode}`}>
          <B2GrammarTrainer topic={topic} mode={mode} language={language} onBack={() => setMode("learn")} onProgress={onProgress} />
        </div>
      )}
    </div>
  );
}
