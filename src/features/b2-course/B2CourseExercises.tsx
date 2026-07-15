import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronRight,
  CircleAlert,
  X,
} from "lucide-react";
import { B2CourseProgressService } from "./b2CourseProgressService";
import {
  checkChoiceAnswer,
  checkMatchingAnswer,
  checkOrderAnswer,
  checkTextAnswer,
  getDisplayAnswer,
  getSelfCheckItems,
  isChoiceExercise,
  isOrderExercise,
  isSelfCheckExercise,
  isSupportedExercise,
  isTextExercise,
} from "./exerciseEngine";
import type { B2CourseExercise, B2SelfAssessment } from "./types";

interface ListProps {
  exercises: B2CourseExercise[];
  isRtl: boolean;
  onStart: (index: number) => void;
}

export function B2CourseExerciseList({ exercises, isRtl, onStart }: ListProps) {
  const store = B2CourseProgressService.getStore();
  return (
    <div className="mt-5 grid gap-3">
      {exercises.map((exercise, index) => {
        const progress = store.exercises[exercise.id];
        const supported = isSupportedExercise(exercise);
        return (
          <button
            key={exercise.id}
            type="button"
            onClick={() => onStart(index)}
            className="flex min-h-20 items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4 text-start hover:border-blue-400"
          >
            <div className="min-w-0">
              <p className="text-xs font-black text-blue-600" dir="ltr">{index + 1}. {exercise.type}</p>
              <p className="mt-1 break-words font-bold text-slate-800">
                {isRtl ? exercise.title_ar : exercise.title_de}
              </p>
              {!supported && (
                <p className="mt-1 text-xs font-bold text-rose-600">
                  {isRtl ? "هذا النوع غير مدعوم حاليًا وسيظهر تنبيه واضح." : "Dieser Typ wird derzeit nicht unterstützt."}
                </p>
              )}
            </div>
            {progress?.completed ? <Check className="shrink-0 text-emerald-600" /> : <ChevronRight className={`shrink-0 text-slate-400 ${isRtl ? "rotate-180" : ""}`} />}
          </button>
        );
      })}
    </div>
  );
}

interface TrainerProps {
  exercises: B2CourseExercise[];
  unit: number;
  isRtl: boolean;
  initialIndex: number;
  onClose: () => void;
}

function hasArabic(value: string): boolean {
  return /[\u0600-\u06ff]/u.test(value);
}

function stableShuffle<T>(items: T[], seedText: string): T[] {
  const result = [...items];
  let seed = [...seedText].reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 2166136261);
  for (let index = result.length - 1; index > 0; index -= 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const target = seed % (index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export default function B2CourseExerciseTrainer({ exercises, unit, isRtl, initialIndex, onClose }: TrainerProps) {
  const [index, setIndex] = useState(Math.min(initialIndex, Math.max(0, exercises.length - 1)));
  const [textAnswer, setTextAnswer] = useState("");
  const [selectedChoice, setSelectedChoice] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<string[]>([]);
  const [matching, setMatching] = useState<Record<string, string>>({});
  const [result, setResult] = useState<boolean | null>(null);
  const [selfAssessment, setSelfAssessment] = useState<B2SelfAssessment | null>(null);
  const [checkedConcepts, setCheckedConcepts] = useState<string[]>([]);
  const [, setRevision] = useState(0);
  const exercise = exercises[index];

  const orderSource = useMemo(() => {
    if (!exercise) return [];
    const source = exercise.blocks?.map((block) => ({ id: block.id, text: block.text }))
      ?? exercise.tokens?.map((token, tokenIndex) => ({ id: `${tokenIndex}:${token}`, text: token }))
      ?? [];
    return stableShuffle(source, exercise.id);
  }, [exercise]);
  const selfCheckItems = useMemo(() => exercise ? getSelfCheckItems(exercise) : [], [exercise]);

  useEffect(() => {
    setTextAnswer("");
    setSelectedChoice("");
    setSelectedOrder([]);
    setMatching({});
    setResult(null);
    setSelfAssessment(null);
    setCheckedConcepts([]);
    B2CourseProgressService.setResume(unit, { exerciseIndex: index, lastMode: "exercises" });
  }, [exercise?.id, index, unit]);

  if (!exercise) return null;
  const choiceType = isChoiceExercise(exercise);
  const textType = isTextExercise(exercise);
  const orderType = isOrderExercise(exercise);
  const selfCheck = isSelfCheckExercise(exercise);
  const supported = isSupportedExercise(exercise);
  const progress = B2CourseProgressService.getStore().exercises[exercise.id];

  const answerValue = () => {
    if (choiceType) return selectedChoice;
    if (textType || selfCheck) return textAnswer;
    if (orderType) return selectedOrder;
    if (exercise.type === "matching") return matching;
    return "";
  };

  const canCheck = choiceType ? Boolean(selectedChoice)
    : textType ? Boolean(textAnswer.trim())
      : orderType ? orderSource.length > 0 && selectedOrder.length === orderSource.length
        : exercise.type === "matching" ? (exercise.pairs?.length ?? 0) > 0 && Object.keys(matching).length === exercise.pairs?.length
          : false;

  const check = () => {
    let correct = false;
    if (choiceType) correct = checkChoiceAnswer(exercise, selectedChoice);
    else if (textType) correct = checkTextAnswer(exercise, textAnswer);
    else if (orderType) correct = checkOrderAnswer(exercise, selectedOrder);
    else if (exercise.type === "matching") correct = checkMatchingAnswer(exercise, matching);
    setResult(correct);
    B2CourseProgressService.recordExerciseAttempt(unit, exercise.id, correct, answerValue());
  };

  const assess = (assessment: B2SelfAssessment) => {
    B2CourseProgressService.recordSelfAssessment(unit, exercise.id, assessment, textAnswer);
    setSelfAssessment(assessment);
  };

  const next = () => setIndex((current) => (current + 1) % exercises.length);

  if (!supported) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-8" dir={isRtl ? "rtl" : "ltr"}>
        <button type="button" onClick={onClose} className="mb-5 flex min-h-11 items-center gap-2 font-bold text-slate-600">
          <ArrowLeft size={18} className={isRtl ? "rotate-180" : ""} /> {isRtl ? "العودة إلى الوحدة" : "Zur Einheit"}
        </button>
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-rose-800">
          <CircleAlert className="mb-3" />
          <h2 className="font-black">{isRtl ? "نوع تمرين غير مدعوم" : "Nicht unterstützter Übungstyp"}</h2>
          <p className="mt-2">{exercise.type}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-4xl px-4 py-8" dir={isRtl ? "rtl" : "ltr"}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <button type="button" onClick={onClose} className="flex min-h-11 items-center gap-2 font-bold text-slate-600">
          <ArrowLeft size={18} className={isRtl ? "rotate-180" : ""} /> {isRtl ? "العودة إلى الوحدة" : "Zur Einheit"}
        </button>
        <span className="rounded-full bg-slate-900 px-4 py-2 text-xs font-black text-white" dir="ltr">{index + 1} / {exercises.length}</span>
      </div>

      <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-lg sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-black text-blue-600">{isRtl ? exercise.title_ar : exercise.title_de}</p>
          <button
            type="button"
            onClick={() => {
              B2CourseProgressService.setExerciseDifficult(unit, exercise.id, !progress?.difficult);
              setRevision((value) => value + 1);
            }}
            className={`shrink-0 rounded-lg p-2 ${progress?.difficult ? "bg-amber-100 text-amber-700" : "text-slate-400 hover:bg-slate-100"}`}
            title={isRtl ? "تمرين صعب" : "Schwierige Übung"}
          ><AlertCircle size={19} /></button>
        </div>
        <h2 className="mt-3 text-xl font-black leading-8 text-slate-900" dir={isRtl ? "rtl" : "ltr"}>
          {isRtl ? exercise.prompt_ar : exercise.prompt_de}
        </h2>
        <p className="mt-2 text-sm text-slate-500" dir={isRtl ? "ltr" : "rtl"}>
          {isRtl ? exercise.prompt_de : exercise.prompt_ar}
        </p>

        {choiceType && (
          <div className="mt-6 grid gap-3">
            {(exercise.options ?? []).map((option, optionIndex) => (
              <button
                key={`${exercise.id}-option-${optionIndex}`}
                type="button"
                onClick={() => result === null && setSelectedChoice(option)}
                dir={hasArabic(option) ? "rtl" : "ltr"}
                className={`min-h-12 rounded-lg border p-4 text-left font-semibold transition ${selectedChoice === option ? "border-blue-600 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}
              >{option}</button>
            ))}
          </div>
        )}

        {textType && (
          <input
            value={textAnswer}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setTextAnswer(event.target.value)}
            disabled={result !== null}
            className="mt-6 w-full rounded-lg border border-slate-300 px-4 py-3 text-left text-lg outline-none focus:border-blue-600"
            dir="ltr"
            placeholder={isRtl ? "اكتب الإجابة بالألمانية" : "Antwort eingeben"}
          />
        )}

        {orderType && (
          <div className="mt-6 space-y-4" dir="ltr">
            <div className="min-h-20 rounded-lg border-2 border-dashed border-blue-200 bg-blue-50 p-3 text-left">
              {selectedOrder.length === 0 ? (
                <span className="text-sm text-slate-500">{isRtl ? "اضغط على الأجزاء بالترتيب الصحيح" : "Teile in der richtigen Reihenfolge anklicken"}</span>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {selectedOrder.map((id) => (
                    <button
                      key={id}
                      type="button"
                      disabled={result !== null}
                      onClick={() => setSelectedOrder((current) => current.filter((value) => value !== id))}
                      className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white"
                    >{orderSource.find((candidate) => candidate.id === id)?.text ?? id}</button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {orderSource.filter((candidate) => !selectedOrder.includes(candidate.id)).map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  disabled={result !== null}
                  onClick={() => setSelectedOrder((current) => [...current, candidate.id])}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm font-semibold"
                >{candidate.text}</button>
              ))}
            </div>
          </div>
        )}

        {exercise.type === "matching" && (
          <div className="mt-6 space-y-3" dir="ltr">
            {(exercise.pairs ?? []).map(([left], pairIndex) => (
              <div key={`${exercise.id}-pair-${pairIndex}`} className="grid items-center gap-2 rounded-lg bg-slate-50 p-3 md:grid-cols-2">
                <span className="text-left font-semibold">{left}</span>
                <select
                  value={matching[left] ?? ""}
                  disabled={result !== null}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) => setMatching((current) => ({ ...current, [left]: event.target.value }))}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-left"
                >
                  <option value="">-</option>
                  {(exercise.pairs ?? []).map(([, right], optionIndex) => (
                    <option key={`${exercise.id}-match-${optionIndex}`} value={right}>{right}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}

        {selfCheck && (
          <div className="mt-6 space-y-4">
            <textarea
              value={textAnswer}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setTextAnswer(event.target.value)}
              rows={7}
              className="w-full rounded-lg border border-slate-300 p-4 text-left outline-none focus:border-blue-600"
              dir="ltr"
              placeholder={exercise.type === "guided_speaking"
                ? (isRtl ? "دوّن نقاط حديثك هنا (اختياري)..." : "Notizen zum Gespräch (optional)...")
                : (isRtl ? "اكتب إجابتك هنا..." : "Schreiben Sie Ihre Antwort hier...")}
            />
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="font-black text-slate-800">{isRtl ? "قائمة التقييم الذاتي" : "Checkliste zur Selbsteinschätzung"}</p>
              <div className="mt-3 space-y-2" dir="ltr">
                {selfCheckItems.map((concept) => (
                  <label key={concept} className="flex items-start gap-3 text-left text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={checkedConcepts.includes(concept)}
                      onChange={() => setCheckedConcepts((current) => current.includes(concept) ? current.filter((item) => item !== concept) : [...current, concept])}
                      className="mt-0.5 h-4 w-4"
                    />
                    <span>{concept}</span>
                  </label>
                ))}
              </div>
            </div>
            {selfAssessment === null && (
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => assess("completed")}
                  disabled={checkedConcepts.length !== selfCheckItems.length || (exercise.type === "guided_writing" && !textAnswer.trim())}
                  className="min-h-12 rounded-lg bg-emerald-600 px-5 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
                >{isRtl ? "أنجزت" : "Erledigt"}</button>
                <button
                  type="button"
                  onClick={() => assess("needs_review")}
                  className="min-h-12 rounded-lg bg-amber-100 px-5 py-3 font-black text-amber-800"
                >{isRtl ? "أحتاج مراجعة" : "Ich brauche Wiederholung"}</button>
              </div>
            )}
          </div>
        )}

        {!selfCheck && result === null && (
          <button
            type="button"
            onClick={check}
            disabled={!canCheck}
            className="mt-7 min-h-12 rounded-lg bg-blue-600 px-6 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
          >{isRtl ? "تحقق" : "Prüfen"}</button>
        )}

        {(result !== null || selfAssessment !== null) && (
          <div className={`mt-6 rounded-lg p-5 ${(result === true || selfAssessment === "completed") ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
            <div className="flex items-center gap-2 font-black">
              {(result === true || selfAssessment === "completed") ? <Check /> : <X />}
              {selfAssessment
                ? (selfAssessment === "completed" ? (isRtl ? "سُجّل كمنجز بعد تقييمك الذاتي" : "Nach Selbsteinschätzung erledigt") : (isRtl ? "سُجّل للمراجعة، ولم يُحتسب صحيحًا" : "Zur Wiederholung markiert, nicht als richtig gewertet"))
                : result ? (isRtl ? "إجابة صحيحة" : "Richtig") : (isRtl ? "الإجابة غير صحيحة" : "Noch nicht richtig")}
            </div>
            {result === false && <pre className="mt-3 whitespace-pre-wrap text-left font-sans text-sm" dir="ltr">{getDisplayAnswer(exercise)}</pre>}
            {result !== null && exercise.completedSentence_de && (
              <div className="mt-4 rounded-lg bg-white/70 p-3">
                <p className="text-left font-semibold" dir="ltr">{exercise.completedSentence_de}</p>
                {exercise.completedSentence_ar && <p className="mt-1 text-right text-sm" dir="rtl">{exercise.completedSentence_ar}</p>}
              </div>
            )}
            <button type="button" onClick={next} className="mt-4 min-h-11 rounded-lg bg-slate-900 px-5 py-2.5 font-black text-white">
              {isRtl ? "التمرين التالي" : "Nächste Übung"}
            </button>
          </div>
        )}
      </article>
    </section>
  );
}
