import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, RotateCcw } from "lucide-react";
import { B2GrammarProgressService } from "./b2GrammarProgressService";
import { getB2GrammarPromptPresentation } from "./b2GrammarPromptService";
import {
  B2GrammarExercise,
  B2GrammarLanguage,
  B2GrammarMode,
  B2GrammarTopic,
} from "./types";

interface Props {
  topic: B2GrammarTopic;
  mode: Exclude<B2GrammarMode, "learn">;
  language: B2GrammarLanguage;
  onBack: () => void;
  onProgress: () => void;
}

function normalizeAnswer(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("de-DE")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/[.!?]+$/g, "");
}

function answerText(exercise: B2GrammarExercise): string {
  return typeof exercise.answer === "string" ? exercise.answer : JSON.stringify(exercise.answer);
}

function acceptedAnswers(exercise: B2GrammarExercise): string[] {
  const base = typeof exercise.answer === "string" ? [exercise.answer] : [];
  return [...base, ...(exercise.acceptedAnswers || [])];
}

function requiredConcepts(exercise: B2GrammarExercise): string[] {
  if (exercise.requiredConcepts?.length) return exercise.requiredConcepts;
  if (typeof exercise.answer === "object" && !Array.isArray(exercise.answer) && "requiredConcepts" in exercise.answer) {
    return Array.isArray(exercise.answer.requiredConcepts) ? exercise.answer.requiredConcepts : [];
  }
  return [];
}

function isChoice(exercise: B2GrammarExercise): boolean {
  return ["multiple_choice", "dialogue_choice", "scenario_choice"].includes(exercise.type);
}

function isOrder(exercise: B2GrammarExercise): boolean {
  return ["sentence_order", "email_order"].includes(exercise.type);
}

export default function B2GrammarTrainer({ topic, mode, language, onBack, onProgress }: Props) {
  const isAr = language === "ar";
  const [progressRevision, setProgressRevision] = useState(0);
  const queue = useMemo(() => {
    if (mode !== "mistakes") return topic.exercises;
    const progress = B2GrammarProgressService.getProgress();
    return topic.exercises.filter((exercise) => progress.exercises[exercise.id]?.unresolvedMistake);
  }, [mode, topic, progressRevision]);
  const [position, setPosition] = useState(() => {
    if (mode === "mistakes") return 0;
    return B2GrammarProgressService.getResumePosition(topic.index.id, topic.exercises.map((exercise) => exercise.id));
  });
  const [runKey, setRunKey] = useState(0);
  const [sessionDone, setSessionDone] = useState(false);
  const [selectedOption, setSelectedOption] = useState("");
  const [inputAnswer, setInputAnswer] = useState("");
  const [checked, setChecked] = useState(false);
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [selectedTokenIndexes, setSelectedTokenIndexes] = useState<number[]>([]);
  const [selectedLeft, setSelectedLeft] = useState("");
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});

  const exercise = queue[Math.min(position, Math.max(queue.length - 1, 0))];

  useEffect(() => {
    setSelectedOption("");
    setInputAnswer("");
    setChecked(false);
    setCorrect(null);
    setSelectedTokenIndexes([]);
    setSelectedLeft("");
    setMatches({});
    setChecklist({});
    if (exercise) B2GrammarProgressService.visit(topic.index.id, exercise.id, position);
  }, [exercise?.id, position, runKey, topic.index.id]);

  const selectedOrder = exercise?.tokens
    ? selectedTokenIndexes.map((index) => exercise.tokens?.[index] || "").filter(Boolean)
    : [];
  const isGuided = exercise ? ["guided_writing", "guided_speaking"].includes(exercise.type) : false;
  const canCheck = Boolean(
    exercise && (
      (isChoice(exercise) && selectedOption)
      || (isOrder(exercise) && selectedTokenIndexes.length === (exercise.tokens?.length || 0))
      || (exercise.type === "matching" && Object.keys(matches).length === (exercise.pairs?.length || 0))
      || (!isChoice(exercise) && !isOrder(exercise) && exercise.type !== "matching" && !isGuided && inputAnswer.trim())
    ),
  );

  const record = (userAnswer: string, result: boolean) => {
    B2GrammarProgressService.recordAnswer(topic.index.id, exercise.id, userAnswer, result);
    setCorrect(result);
    setChecked(true);
    onProgress();
  };

  const handleCheck = () => {
    if (!exercise || !canCheck || checked) return;
    if (isChoice(exercise)) {
      record(selectedOption, selectedOption === String(exercise.answer));
      return;
    }
    if (exercise.type === "matching") {
      const result = (exercise.pairs || []).every(([left, right]) => matches[left] === right);
      record(JSON.stringify(matches), result);
      return;
    }
    const value = isOrder(exercise) ? selectedOrder.join(" ") : inputAnswer;
    const valid = acceptedAnswers(exercise).some((candidate) => normalizeAnswer(candidate) === normalizeAnswer(value));
    record(value, valid);
  };

  const handleSelfAssessment = (assessment: "completed" | "review") => {
    if (!exercise || checked) return;
    B2GrammarProgressService.recordSelfAssessment(topic.index.id, exercise.id, inputAnswer, assessment);
    setCorrect(null);
    setChecked(true);
    onProgress();
  };

  const next = () => {
    setProgressRevision((value) => value + 1);
    if (mode === "mistakes") {
      setPosition(0);
      setRunKey((value) => value + 1);
      return;
    }
    if (position >= queue.length - 1) {
      setSessionDone(true);
      return;
    }
    setPosition((value) => value + 1);
  };

  if (!queue.length) {
    return (
      <div className="border border-emerald-200 bg-emerald-50 p-8 text-center rounded-lg">
        <Check className="mx-auto text-emerald-600" size={32} />
        <h3 className="mt-3 text-lg font-black text-emerald-900">{isAr ? "لا توجد أخطاء غير محلولة في هذه الوحدة" : "Keine offenen Fehler in dieser Einheit"}</h3>
        <button type="button" onClick={onBack} className="mt-5 bg-slate-900 px-5 py-3 font-bold text-white rounded-lg">{isAr ? "العودة إلى الوحدة" : "Zurück zur Einheit"}</button>
      </div>
    );
  }

  if (sessionDone) {
    return (
      <div className="border border-blue-200 bg-blue-50 p-8 text-center rounded-lg">
        <Check className="mx-auto text-blue-600" size={34} />
        <h3 className="mt-3 text-xl font-black text-blue-950">{isAr ? "أنهيت جولة التدريب" : "Trainingsrunde abgeschlossen"}</h3>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => { setPosition(0); setRunKey((value) => value + 1); setSessionDone(false); }} className="flex items-center gap-2 border border-blue-300 bg-white px-5 py-3 font-bold text-blue-800 rounded-lg"><RotateCcw size={18} />{isAr ? "إعادة الجولة" : "Runde wiederholen"}</button>
          <button type="button" onClick={onBack} className="bg-slate-900 px-5 py-3 font-bold text-white rounded-lg">{isAr ? "العودة إلى الوحدة" : "Zurück zur Einheit"}</button>
        </div>
      </div>
    );
  }

  const concepts = requiredConcepts(exercise);
  const prompt = getB2GrammarPromptPresentation(exercise, language);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 text-sm font-bold text-slate-600">
        <span>{position + 1} / {queue.length}</span>
        <span className="rounded bg-slate-100 px-3 py-1 text-xs uppercase">{exercise.type.replaceAll("_", " ")}</span>
      </div>

      <article className="border border-slate-200 bg-white p-5 sm:p-7 rounded-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs font-black uppercase text-blue-600">{isAr ? exercise.title_ar : exercise.title_de}</span>
          <span className="text-xs font-bold text-slate-400">{exercise.difficulty}</span>
        </div>
        <h3 className="mt-5 text-lg font-black leading-8 text-slate-900" lang={isAr ? "ar" : "de"} dir={isAr ? "rtl" : "ltr"}>
          {prompt.localizedPrompt}
        </h3>
        {prompt.germanPrompt && (
          <p className="mt-3 break-words text-left text-base font-semibold leading-8 text-slate-700" lang="de" dir="ltr">
            {prompt.germanPrompt}
          </p>
        )}

        {isChoice(exercise) && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2" dir="ltr">
            {exercise.options?.map((option) => {
              const isSelected = selectedOption === option;
              const isAnswer = option === String(exercise.answer);
              const color = checked
                ? isAnswer ? "border-emerald-500 bg-emerald-50 text-emerald-900" : isSelected ? "border-red-500 bg-red-50 text-red-900" : "border-slate-200 bg-white"
                : isSelected ? "border-blue-500 bg-blue-50 text-blue-900" : "border-slate-200 bg-white hover:border-blue-300";
              return <button key={`${exercise.id}-${option}`} type="button" disabled={checked} onClick={() => setSelectedOption(option)} className={`min-h-14 border px-4 py-3 text-left font-semibold transition-colors rounded-lg ${color}`}>{option}</button>;
            })}
          </div>
        )}

        {exercise.type === "matching" && (
          <div className="mt-6 grid gap-5 md:grid-cols-2" dir="ltr">
            <div className="space-y-2">
              {(exercise.pairs || []).map(([left]) => <button key={`${exercise.id}-left-${left}`} type="button" disabled={checked} onClick={() => setSelectedLeft(left)} className={`w-full border px-4 py-3 text-left font-semibold rounded-lg ${selectedLeft === left ? "border-blue-500 bg-blue-50" : matches[left] ? "border-emerald-300 bg-emerald-50" : "border-slate-200"}`}>{left}</button>)}
            </div>
            <div className="space-y-2">
              {[...(exercise.pairs || [])].reverse().map(([, right], index) => <button key={`${exercise.id}-right-${index}-${right}`} type="button" disabled={checked || !selectedLeft} onClick={() => { if (selectedLeft) { setMatches((current) => ({ ...current, [selectedLeft]: right })); setSelectedLeft(""); } }} className="w-full border border-slate-200 px-4 py-3 text-left rounded-lg disabled:opacity-50">{right}</button>)}
            </div>
          </div>
        )}

        {isOrder(exercise) && (
          <div className="mt-6 space-y-4" dir="ltr">
            <div className="min-h-16 border border-blue-200 bg-blue-50 p-3 rounded-lg">
              <div className="flex flex-wrap gap-2">
                {selectedTokenIndexes.map((tokenIndex, selectedIndex) => <button key={`${exercise.id}-selected-${tokenIndex}`} type="button" disabled={checked} onClick={() => setSelectedTokenIndexes((items) => items.filter((_, index) => index !== selectedIndex))} className="border border-blue-300 bg-white px-3 py-2 font-semibold rounded">{exercise.tokens?.[tokenIndex]}</button>)}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {exercise.tokens?.map((token, tokenIndex) => selectedTokenIndexes.includes(tokenIndex) ? null : <button key={`${exercise.id}-token-${tokenIndex}`} type="button" disabled={checked} onClick={() => setSelectedTokenIndexes((items) => [...items, tokenIndex])} className="border border-slate-300 bg-white px-3 py-2 rounded">{token}</button>)}
            </div>
          </div>
        )}

        {!isChoice(exercise) && !isOrder(exercise) && exercise.type !== "matching" && (
          <div className="mt-6">
            {isGuided ? <textarea value={inputAnswer} disabled={checked} onChange={(event) => setInputAnswer(event.target.value)} rows={7} dir="ltr" className="w-full border border-slate-300 px-4 py-3 text-left outline-none focus:border-blue-500 rounded-lg" /> : <input value={inputAnswer} disabled={checked} onChange={(event) => setInputAnswer(event.target.value)} dir="ltr" className="w-full border border-slate-300 px-4 py-3 text-left outline-none focus:border-blue-500 rounded-lg" />}
          </div>
        )}

        {isGuided && concepts.length > 0 && (
          <div className="mt-5 border border-slate-200 bg-slate-50 p-4 rounded-lg">
            <p className="mb-3 text-sm font-black">{isAr ? "قائمة التقييم الذاتي" : "Checkliste zur Selbsteinschätzung"}</p>
            <div className="space-y-2" dir="ltr">
              {concepts.map((concept) => <label key={concept} className="flex items-start gap-3 text-sm"><input type="checkbox" checked={Boolean(checklist[concept])} onChange={(event) => setChecklist((current) => ({ ...current, [concept]: event.target.checked }))} className="mt-1" /> <span>{concept}</span></label>)}
            </div>
          </div>
        )}

        {!checked && !isGuided && <button type="button" disabled={!canCheck} onClick={handleCheck} className="mt-6 w-full bg-blue-600 px-5 py-3 font-black text-white rounded-lg disabled:cursor-not-allowed disabled:opacity-40">{isAr ? "تحقق من الإجابة" : "Antwort prüfen"}</button>}
        {!checked && isGuided && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button type="button" disabled={!inputAnswer.trim()} onClick={() => handleSelfAssessment("completed")} className="bg-emerald-600 px-5 py-3 font-black text-white rounded-lg disabled:opacity-40">{isAr ? "أنجزت" : "Erledigt"}</button>
            <button type="button" disabled={!inputAnswer.trim()} onClick={() => handleSelfAssessment("review")} className="bg-amber-500 px-5 py-3 font-black text-white rounded-lg disabled:opacity-40">{isAr ? "أحتاج مراجعة" : "Muss ich wiederholen"}</button>
          </div>
        )}

        {checked && (
          <div className={`mt-6 border p-5 rounded-lg ${correct === false ? "border-red-200 bg-red-50" : correct === true ? "border-emerald-200 bg-emerald-50" : "border-blue-200 bg-blue-50"}`}>
            <h4 className="font-black">{correct === true ? (isAr ? "إجابة صحيحة" : "Richtig") : correct === false ? (isAr ? "الإجابة تحتاج تصحيحًا" : "Noch nicht richtig") : (isAr ? "تم حفظ تقييمك" : "Selbsteinschätzung gespeichert")}</h4>
            {typeof exercise.answer === "string" && <p className="mt-3 font-bold" dir="ltr">{isAr ? "الإجابة: " : "Antwort: "}{exercise.answer}</p>}
            {exercise.type === "matching" && (
              <div className="mt-3 space-y-1 text-sm font-semibold" dir="ltr">
                {(exercise.pairs || []).map(([left, right]) => <p key={`${exercise.id}-feedback-${left}`}>{left} → {right}</p>)}
              </div>
            )}
            <p className="mt-3 text-sm leading-7" dir={isAr ? "rtl" : "ltr"}>{isAr ? exercise.explanation_ar : exercise.explanation_de}</p>
          </div>
        )}
      </article>

      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="flex items-center gap-2 border border-slate-300 bg-white px-4 py-3 font-bold rounded-lg">{isAr ? <ArrowRight size={18} /> : <ArrowLeft size={18} />}{isAr ? "الوحدة" : "Einheit"}</button>
        {checked && <button type="button" onClick={next} className="flex items-center gap-2 bg-slate-900 px-5 py-3 font-bold text-white rounded-lg">{isAr ? "التالي" : "Weiter"}{isAr ? <ArrowLeft size={18} /> : <ArrowRight size={18} />}</button>}
      </div>
    </div>
  );
}
