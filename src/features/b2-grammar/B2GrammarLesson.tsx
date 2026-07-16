import { AlertTriangle, CheckCircle2, Lightbulb } from "lucide-react";
import { B2GrammarLanguage, B2GrammarLesson as Lesson } from "./types";

interface Props {
  lesson: Lesson;
  language: B2GrammarLanguage;
}

export default function B2GrammarLesson({ lesson, language }: Props) {
  const isAr = language === "ar";
  const objectives = isAr ? lesson.learningObjectives_ar : lesson.learningObjectives_de;
  const summary = isAr ? lesson.quickSummary_ar : lesson.quickSummary_de;

  return (
    <div className="space-y-8">
      <section className="border-b border-slate-200 pb-6">
        <p className="text-sm font-semibold leading-7 text-slate-600" dir={isAr ? "rtl" : "ltr"}>
          {isAr ? lesson.shortDescription_ar : lesson.shortDescription_de}
        </p>
        <p className="mt-4 leading-8 text-slate-800" dir={isAr ? "rtl" : "ltr"}>
          {isAr ? lesson.explanation_ar : lesson.explanation_de}
        </p>
      </section>

      <section>
        <h3 className="mb-4 text-lg font-black text-slate-900">
          {isAr ? "أهداف التعلم" : "Lernziele"}
        </h3>
        <div className="grid gap-3 md:grid-cols-2">
          {objectives.map((objective) => (
            <div key={objective} className="flex items-start gap-3 border border-slate-200 bg-white p-4 rounded-lg">
              <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={18} />
              <span className="text-sm leading-6" dir={isAr ? "rtl" : "ltr"}>{objective}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-4 text-lg font-black text-slate-900">{isAr ? "القواعد" : "Regeln"}</h3>
        <div className="space-y-4">
          {lesson.rules.map((rule) => (
            <article key={rule.id} className="border border-slate-200 bg-white p-5 rounded-lg">
              <h4 className="font-black text-slate-900" dir={isAr ? "rtl" : "ltr"}>
                {isAr ? rule.title_ar : rule.title_de}
              </h4>
              <p className="mt-2 text-sm leading-7 text-slate-700" dir={isAr ? "rtl" : "ltr"}>
                {isAr ? rule.explanation_ar : rule.explanation_de}
              </p>
              {rule.formula && (
                <div className="mt-3 border-s-4 border-blue-500 bg-blue-50 px-4 py-3 font-semibold text-blue-900" dir="ltr">
                  {rule.formula}
                </div>
              )}
              {rule.examples?.length ? (
                <div className="mt-4 space-y-2">
                  {rule.examples.map((example) => (
                    <div key={`${rule.id}-${example.de}`} className="border-t border-slate-100 pt-3">
                      <p className="font-semibold text-slate-900" dir="ltr">{example.de}</p>
                      <p className="mt-1 text-sm text-slate-600" dir="rtl">{example.ar}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      {lesson.tables.length > 0 && (
        <section>
          <h3 className="mb-4 text-lg font-black text-slate-900">{isAr ? "الجداول" : "Tabellen"}</h3>
          <div className="space-y-5">
            {lesson.tables.map((table) => {
              const headers = isAr && table.headers_ar?.length ? table.headers_ar : table.headers_de;
              return (
                <div key={table.id}>
                  <h4 className="mb-2 font-bold" dir={isAr ? "rtl" : "ltr"}>{isAr ? table.title_ar : table.title_de}</h4>
                  <div className="overflow-x-auto border border-slate-200 rounded-lg" dir="ltr">
                    <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                      <thead className="bg-slate-100 text-slate-700">
                        <tr>{headers.map((header, index) => <th key={`${table.id}-h-${index}`} className="border-b border-slate-200 px-4 py-3 font-black">{header}</th>)}</tr>
                      </thead>
                      <tbody>
                        {table.rows.map((row, rowIndex) => (
                          <tr key={`${table.id}-r-${rowIndex}`} className="even:bg-slate-50">
                            {row.map((cell, cellIndex) => <td key={`${table.id}-${rowIndex}-${cellIndex}`} className="border-b border-slate-100 px-4 py-3">{cell}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {lesson.examples.length > 0 && (
        <section>
          <h3 className="mb-4 text-lg font-black text-slate-900">{isAr ? "أمثلة" : "Beispiele"}</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {lesson.examples.map((example) => (
              <article key={example.de} className="border border-slate-200 bg-white p-4 rounded-lg">
                <p className="font-bold text-slate-900" dir="ltr">{example.de}</p>
                <p className="mt-2 text-sm text-slate-600" dir="rtl">{example.ar}</p>
                {(isAr ? example.note_ar : example.note_de) && (
                  <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-blue-700" dir={isAr ? "rtl" : "ltr"}>
                    {isAr ? example.note_ar : example.note_de}
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {lesson.commonMistakes.length > 0 && (
        <section>
          <h3 className="mb-4 flex items-center gap-2 text-lg font-black text-slate-900">
            <AlertTriangle className="text-amber-600" size={20} />
            {isAr ? "أخطاء شائعة" : "Häufige Fehler"}
          </h3>
          <div className="space-y-3">
            {lesson.commonMistakes.map((mistake) => (
              <article key={`${mistake.wrong}-${mistake.correct}`} className="border border-amber-200 bg-amber-50 p-4 rounded-lg">
                <div className="grid gap-2 sm:grid-cols-2" dir="ltr">
                  <p className="text-red-700 line-through">{mistake.wrong}</p>
                  <p className="font-bold text-emerald-700">{mistake.correct}</p>
                </div>
                <p className="mt-3 text-sm text-slate-700" dir={isAr ? "rtl" : "ltr"}>
                  {isAr ? mistake.explanation_ar : mistake.explanation_de}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="border border-blue-200 bg-blue-50 p-5 rounded-lg">
        <h3 className="mb-3 flex items-center gap-2 font-black text-blue-900">
          <Lightbulb size={19} /> {isAr ? "ملخص سريع" : "Kurz zusammengefasst"}
        </h3>
        <ul className="space-y-2 text-sm leading-6 text-blue-950" dir={isAr ? "rtl" : "ltr"}>
          {summary.map((item) => <li key={item}>• {item}</li>)}
        </ul>
      </section>
    </div>
  );
}
