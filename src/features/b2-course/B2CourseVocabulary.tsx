import { useMemo, useState, type ChangeEvent } from "react";
import { AlertCircle, Heart, Search } from "lucide-react";
import { B2CourseProgressService } from "./b2CourseProgressService";
import { normalizeAnswer } from "./exerciseEngine";
import type { B2CourseVocabularyItem, B2VocabularyFilter } from "./types";

interface Props {
  items: B2CourseVocabularyItem[];
  isRtl: boolean;
}

function vocabularyFamily(type: string): Exclude<B2VocabularyFilter, "all"> {
  const normalized = type.toLowerCase();
  if (normalized.includes("phrase")) return "phrase";
  if (normalized.startsWith("noun")) return "noun";
  if (normalized.startsWith("verb")) return "verb";
  if (normalized.startsWith("adjective")) return "adjective";
  return "phrase";
}

function GrammarDetails({ item, isRtl }: { item: B2CourseVocabularyItem; isRtl: boolean }) {
  const grammar = item.grammar ?? {};
  const fields: Array<[string, unknown]> = [];
  const family = vocabularyFamily(item.type);
  if (family === "noun") {
    fields.push(["Artikel", grammar.article], ["Plural", grammar.plural], ["Numerus", grammar.numberType]);
  } else if (family === "verb" || item.type.includes("verb")) {
    fields.push(
      ["Präteritum", grammar.praeteritum],
      ["Perfekt", grammar.perfekt],
      ["Hilfsverb", grammar.auxiliary],
      ["Trennbar", typeof grammar.separable === "boolean" ? (grammar.separable ? "ja" : "nein") : grammar.separable],
    );
  } else if (family === "adjective") {
    fields.push(["Komparativ", grammar.comparative], ["Superlativ", grammar.superlative]);
  }
  const visible = fields.filter(([, value]) => value !== undefined && value !== null && value !== "");
  if (!visible.length) return null;
  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-2" dir="ltr">
      {visible.map(([label, value]) => (
        <div key={label} className="rounded-lg bg-slate-50 px-3 py-2 text-left text-sm">
          <span className="font-bold text-slate-500">{label}: </span>
          <span className="font-semibold text-slate-800">{String(value)}</span>
        </div>
      ))}
      {isRtl && <span className="sr-only">معلومات نحوية</span>}
    </div>
  );
}

function VocabularyCard({ item, isRtl }: { item: B2CourseVocabularyItem; isRtl: boolean }) {
  const [favorite, setFavorite] = useState(B2CourseProgressService.isFavorite(item.courseItemId));
  const [difficult, setDifficult] = useState(
    B2CourseProgressService.getVocabularyProgress(item.courseItemId).difficult,
  );
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-blue-600">{item.type}</p>
          <h3 className="mt-1 break-words text-xl font-black text-slate-900" dir="ltr">{item.term}</h3>
        </div>
        <div className="flex shrink-0 gap-1" dir="ltr">
          <button
            type="button"
            onClick={() => setDifficult((current) => {
              B2CourseProgressService.setVocabularyDifficult(item.courseItemId, !current);
              return !current;
            })}
            className={`rounded-lg p-2 ${difficult ? "bg-amber-100 text-amber-700" : "text-slate-400 hover:bg-slate-100"}`}
            title={isRtl ? "كلمة صعبة" : "Als schwierig markieren"}
            aria-pressed={difficult}
          >
            <AlertCircle size={19} />
          </button>
          <button
            type="button"
            onClick={() => setFavorite(B2CourseProgressService.toggleFavorite(item.courseItemId))}
            className={`rounded-lg p-2 ${favorite ? "bg-rose-50 text-rose-600" : "text-slate-400 hover:bg-slate-100"}`}
            title={isRtl ? "المفضلة" : "Favorit"}
            aria-pressed={favorite}
          >
            <Heart size={19} className={favorite ? "fill-current" : ""} />
          </button>
        </div>
      </div>
      <p className="mt-3 text-lg font-bold text-slate-800" dir="rtl">{item.arabic}</p>
      <GrammarDetails item={item} isRtl={isRtl} />
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg bg-blue-50 p-4 text-left" dir="ltr">
          <p className="text-xs font-black text-blue-700">Erklärung</p>
          <p className="mt-2 leading-7 text-slate-700">{item.explanation_de}</p>
        </div>
        <div className="rounded-lg bg-amber-50 p-4 text-right" dir="rtl">
          <p className="text-xs font-black text-amber-700">الشرح بالعربية</p>
          <p className="mt-2 leading-7 text-slate-700">{item.explanation_ar}</p>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {item.examples.map((example, index) => (
          <div key={`${item.courseItemId}-example-${index}`} className="rounded-lg border border-slate-100 p-3">
            <p className="text-left font-semibold text-slate-800" dir="ltr">{example.de}</p>
            <p className="mt-1 text-right text-sm text-slate-600" dir="rtl">{example.ar}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

export default function B2CourseVocabulary({ items, isRtl }: Props) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<B2VocabularyFilter>("all");
  const filters: Array<[B2VocabularyFilter, string, string]> = [
    ["all", "Alle", "الكل"],
    ["noun", "Nomen", "الأسماء"],
    ["verb", "Verben", "الأفعال"],
    ["adjective", "Adjektive", "الصفات"],
    ["phrase", "Phrasen", "العبارات"],
  ];
  const filtered = useMemo(() => {
    const query = normalizeAnswer(search);
    return items.filter((item) => {
      if (filter !== "all" && vocabularyFamily(item.type) !== filter) return false;
      if (!query) return true;
      return [item.term, item.arabic, item.explanation_de, item.explanation_ar, item.source.section]
        .some((value) => normalizeAnswer(value).includes(query));
    });
  }, [filter, items, search]);

  return (
    <section>
      <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <label className="relative block">
          <Search className={`absolute top-3.5 text-slate-400 ${isRtl ? "right-4" : "left-4"}`} size={19} />
          <input
            value={search}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)}
            className={`w-full rounded-lg border border-slate-300 bg-white py-3 ${isRtl ? "pr-12 pl-4" : "pl-12 pr-4"}`}
            placeholder={isRtl ? "ابحث في مفردات الوحدة..." : "Wortschatz durchsuchen..."}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {filters.map(([id, de, ar]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`min-h-11 rounded-lg px-4 text-sm font-bold ${filter === id ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-700"}`}
            >
              {isRtl ? ar : de}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-500">
        {isRtl ? `${filtered.length} من ${items.length} عنصرًا` : `${filtered.length} von ${items.length} Einträgen`}
      </p>
      {filtered.length ? (
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          {filtered.map((item) => (
            <div key={item.courseItemId}>
              <VocabularyCard item={item} isRtl={isRtl} />
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-lg border border-slate-200 bg-white p-8 text-center font-semibold text-slate-500">
          {isRtl ? "لا توجد نتائج مطابقة." : "Keine passenden Einträge gefunden."}
        </div>
      )}
    </section>
  );
}
