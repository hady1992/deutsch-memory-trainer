import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  BookOpenCheck,
  Database,
  Download,
  FilePlus2,
  LogIn,
  LogOut,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import type { UserSettings } from "../../types";
import ManageData from "../../pages/ManageData";

interface AdminPageProps {
  onNavigate: (page: string, params?: unknown) => void;
  settings: UserSettings;
}

type AdminView = "home" | "exam-vocabulary" | "data-manager";
type ExamSectionId = "lesen-teil-1" | "lesen-teil-2";
type ExamItemType = "word" | "phrase" | "verb" | "noun" | "adjective" | "other";

interface ExamVocabularyDraftItem {
  id: string;
  term: string;
  arabic: string;
  type: ExamItemType;
  sectionId: ExamSectionId;
  modelNumber: number;
  example: {
    de: string;
    ar: string;
  };
  notes_ar: string;
  status: "draft";
  createdAt: string;
}

const DRAFT_STORAGE_KEY = "dmt_admin_exam_vocab_draft_v1";

const EXAM_SECTIONS: Array<{
  id: ExamSectionId;
  title_de: string;
  title_ar: string;
  idPrefix: string;
}> = [
  {
    id: "lesen-teil-1",
    title_de: "Lesen Teil 1",
    title_ar: "القراءة – الجزء الأول",
    idPrefix: "exam-l1",
  },
  {
    id: "lesen-teil-2",
    title_de: "Lesen Teil 2",
    title_ar: "القراءة – الجزء الثاني",
    idPrefix: "exam-l2",
  },
];

function loadDrafts(): ExamVocabularyDraftItem[] {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDrafts(items: ExamVocabularyDraftItem[]): void {
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(items));
}

function nextDraftId(
  items: ExamVocabularyDraftItem[],
  sectionId: ExamSectionId,
  modelNumber: number,
): string {
  const section = EXAM_SECTIONS.find((entry) => entry.id === sectionId)!;
  const modelPart = `m${String(modelNumber).padStart(2, "0")}`;
  const prefix = `${section.idPrefix}-${modelPart}-`;
  const max = items.reduce((current, item) => {
    if (!item.id.startsWith(prefix)) return current;
    const match = item.id.match(/-(\d+)$/);
    return match ? Math.max(current, Number(match[1])) : current;
  }, 0);
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

function downloadJson(data: unknown, fileName: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function AdminPage({ onNavigate, settings }: AdminPageProps) {
  const isRtl = settings.language === "ar";
  const [checkingSession, setCheckingSession] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [view, setView] = useState<AdminView>("home");

  const [drafts, setDrafts] = useState<ExamVocabularyDraftItem[]>(() => loadDrafts());
  const [sectionId, setSectionId] = useState<ExamSectionId>("lesen-teil-1");
  const [modelNumber, setModelNumber] = useState(1);
  const [term, setTerm] = useState("");
  const [arabic, setArabic] = useState("");
  const [type, setType] = useState<ExamItemType>("word");
  const [exampleDe, setExampleDe] = useState("");
  const [exampleAr, setExampleAr] = useState("");
  const [notesAr, setNotesAr] = useState("");
  const [draftNotice, setDraftNotice] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/admin/session", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (active) setAuthenticated(Boolean(payload.authenticated));
      })
      .catch(() => {
        if (active) setAuthenticated(false);
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const selectedSection = EXAM_SECTIONS.find((entry) => entry.id === sectionId)!;
  const selectedDrafts = useMemo(
    () => drafts.filter((item) => item.sectionId === sectionId && item.modelNumber === modelNumber),
    [drafts, sectionId, modelNumber],
  );

  const sameTermCount = useMemo(() => {
    const normalized = term.trim().toLocaleLowerCase("de-DE");
    if (!normalized) return 0;
    return drafts.filter((item) => item.term.trim().toLocaleLowerCase("de-DE") === normalized).length;
  }, [drafts, term]);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setLoginError("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.authenticated) {
        setLoginError(
          payload.error ||
            (isRtl ? "تعذر تسجيل الدخول. تحقق من بيانات الدخول." : "Anmeldung fehlgeschlagen."),
        );
        return;
      }
      setPassword("");
      setAuthenticated(true);
    } catch {
      setLoginError(isRtl ? "تعذر الاتصال بخدمة الإدارة." : "Admin-Dienst ist nicht erreichbar.");
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/admin/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    } finally {
      setAuthenticated(false);
      setView("home");
      setPassword("");
    }
  };

  const addDraft = (event: FormEvent) => {
    event.preventDefault();
    const cleanTerm = term.trim();
    const cleanArabic = arabic.trim();
    if (!cleanTerm || !cleanArabic) {
      setDraftNotice(isRtl ? "الكلمة الألمانية والمعنى العربي مطلوبان." : "Deutsch und Arabisch sind erforderlich.");
      return;
    }

    const item: ExamVocabularyDraftItem = {
      id: nextDraftId(drafts, sectionId, modelNumber),
      term: cleanTerm,
      arabic: cleanArabic,
      type,
      sectionId,
      modelNumber,
      example: {
        de: exampleDe.trim(),
        ar: exampleAr.trim(),
      },
      notes_ar: notesAr.trim(),
      status: "draft",
      createdAt: new Date().toISOString(),
    };

    const next = [...drafts, item];
    setDrafts(next);
    saveDrafts(next);
    setTerm("");
    setArabic("");
    setExampleDe("");
    setExampleAr("");
    setNotesAr("");
    setType("word");
    setDraftNotice(
      isRtl
        ? `تمت إضافة ${item.id} إلى المسودة. التكرار مسموح في هذا القسم.`
        : `${item.id} wurde als Entwurf gespeichert. Wiederholungen sind hier erlaubt.`,
    );
  };

  const removeDraft = (id: string) => {
    const next = drafts.filter((item) => item.id !== id);
    setDrafts(next);
    saveDrafts(next);
  };

  const exportSelectedModel = () => {
    const modelId = `model-${String(modelNumber).padStart(2, "0")}`;
    const payload = {
      schemaVersion: "exam-vocabulary-model-v1",
      exam: "B2 Beruf",
      section: {
        id: selectedSection.id,
        title_de: selectedSection.title_de,
        title_ar: selectedSection.title_ar,
      },
      model: {
        id: modelId,
        number: modelNumber,
      },
      duplicatePolicy: "allowed-across-and-within-exam-models",
      items: selectedDrafts.map(({ createdAt, status, ...item }) => item),
    };
    downloadJson(payload, `${sectionId}-${modelId}.json`);
  };

  if (checkingSession) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center">
        <ShieldCheck className="mx-auto mb-3 text-slate-400" size={34} />
        <p className="font-bold text-slate-600">{isRtl ? "جاري التحقق من جلسة الإدارة..." : "Admin-Sitzung wird geprüft..."}</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="mx-auto max-w-md px-4 py-12" dir={isRtl ? "rtl" : "ltr"}>
        <button
          type="button"
          onClick={() => onNavigate("dashboard")}
          className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft size={18} className={isRtl ? "rotate-180" : ""} />
          {isRtl ? "العودة للموقع" : "Zurück"}
        </button>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white">
              <ShieldCheck size={24} />
            </div>
            <h1 className="text-2xl font-black text-slate-900">
              {isRtl ? "دخول الإدارة" : "Admin-Anmeldung"}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              {isRtl ? "هذه الصفحة غير مخصصة للمستخدمين العاديين." : "Dieser Bereich ist nicht öffentlich."}
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-600">
                {isRtl ? "اسم المستخدم" : "Benutzername"}
              </label>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-600">
                {isRtl ? "كلمة المرور" : "Passwort"}
              </label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
              />
            </div>
            {loginError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">
                {loginError}
              </div>
            )}
            <button
              type="submit"
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 font-black text-white hover:bg-slate-800"
            >
              <LogIn size={18} />
              {isRtl ? "دخول" : "Anmelden"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (view === "data-manager") {
    return (
      <div dir={isRtl ? "rtl" : "ltr"}>
        <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-6">
          <button
            type="button"
            onClick={() => setView("home")}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700"
          >
            <ArrowLeft size={17} className={isRtl ? "rotate-180" : ""} />
            {isRtl ? "مركز الإدارة" : "Admin-Zentrale"}
          </button>
        </div>
        <ManageData onNavigate={onNavigate} settings={settings} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8" dir={isRtl ? "rtl" : "ltr"}>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <button
            type="button"
            onClick={() => (view === "home" ? onNavigate("dashboard") : setView("home"))}
            className="mb-3 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-slate-500"
          >
            <ArrowLeft size={17} className={isRtl ? "rotate-180" : ""} />
            {view === "home"
              ? (isRtl ? "العودة للموقع" : "Zur Website")
              : (isRtl ? "مركز الإدارة" : "Admin-Zentrale")}
          </button>
          <h1 className="text-3xl font-black text-slate-900">
            {view === "exam-vocabulary"
              ? (isRtl ? "مفردات نماذج الامتحان" : "Prüfungsvokabeln")
              : (isRtl ? "مركز الإدارة الخاص" : "Private Admin-Zentrale")}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {isRtl
              ? "هذا القسم غير ظاهر في قائمة الموقع العامة."
              : "Dieser Bereich erscheint nicht in der öffentlichen Navigation."}
          </p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700"
        >
          <LogOut size={17} />
          {isRtl ? "تسجيل الخروج" : "Abmelden"}
        </button>
      </div>

      {view === "home" && (
        <div className="grid gap-5 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setView("exam-vocabulary")}
            className="rounded-2xl border border-blue-200 bg-white p-6 text-start shadow-sm transition hover:border-blue-400 hover:shadow-md"
          >
            <BookOpenCheck className="text-blue-600" size={28} />
            <h2 className="mt-4 text-xl font-black text-slate-900">
              {isRtl ? "مفردات نماذج الامتحان" : "Prüfungsvokabeln"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {isRtl
                ? "إنشاء مسودات خاصة بـ Lesen Teil 1 وLesen Teil 2. تكرار الكلمات مسموح عمدًا."
                : "Entwürfe für Lesen Teil 1 und Teil 2. Wortwiederholungen sind ausdrücklich erlaubt."}
            </p>
            <div className="mt-4 text-sm font-black text-blue-600">{drafts.length} {isRtl ? "عنصر بالمسودة" : "Entwürfe"}</div>
          </button>

          <button
            type="button"
            onClick={() => setView("data-manager")}
            className="rounded-2xl border border-slate-200 bg-white p-6 text-start shadow-sm transition hover:border-slate-400 hover:shadow-md"
          >
            <Database className="text-slate-700" size={28} />
            <h2 className="mt-4 text-xl font-black text-slate-900">
              {isRtl ? "مدير البيانات الحالي" : "Bestehender Daten-Manager"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {isRtl
                ? "إدارة الأفعال والأسماء والصفات والعبارات والمفردات العامة بالنظام الحالي."
                : "Verben und den bisherigen Wortschatz mit dem bestehenden System verwalten."}
            </p>
          </button>
        </div>
      )}

      {view === "exam-vocabulary" && (
        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <form onSubmit={addDraft} className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5 flex items-center gap-2">
              <FilePlus2 className="text-blue-600" size={21} />
              <h2 className="font-black text-slate-900">{isRtl ? "إضافة كلمة للمسودة" : "Entwurf hinzufügen"}</h2>
            </div>

            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-900">
              {isRtl
                ? "هذه المرحلة لا تنشر شيئًا للمستخدمين. الكلمات تُحفظ كمسودة محلية حتى نجرب النشر الفعلي."
                : "Noch keine Veröffentlichung: Die Einträge werden zunächst nur lokal als Entwurf gespeichert."}
            </div>

            <div className="grid gap-4">
              <label className="text-xs font-bold text-slate-600">
                {isRtl ? "قسم الامتحان" : "Prüfungsteil"}
                <select
                  value={sectionId}
                  onChange={(event) => setSectionId(event.target.value as ExamSectionId)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold"
                >
                  {EXAM_SECTIONS.map((section) => (
                    <option key={section.id} value={section.id}>{section.title_de}</option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-bold text-slate-600">
                {isRtl ? "رقم النموذج" : "Modellnummer"}
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={modelNumber}
                  onChange={(event) => setModelNumber(Math.max(1, Number(event.target.value) || 1))}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold"
                  dir="ltr"
                />
              </label>

              <label className="text-xs font-bold text-slate-600">
                {isRtl ? "الكلمة / التعبير الألماني *" : "Deutsches Wort / Ausdruck *"}
                <input
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm"
                  dir="ltr"
                  placeholder="z. B. in Betracht ziehen"
                />
              </label>

              {sameTermCount > 0 && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs font-bold text-blue-800">
                  {isRtl
                    ? `هذه الكلمة موجودة ${sameTermCount} مرة مسبقًا في مسودات الامتحان. الإضافة الجديدة مسموحة.`
                    : `Dieser Begriff existiert bereits ${sameTermCount}×. Ein weiterer Eintrag ist erlaubt.`}
                </div>
              )}

              <label className="text-xs font-bold text-slate-600">
                {isRtl ? "المعنى العربي *" : "Arabische Bedeutung *"}
                <input
                  value={arabic}
                  onChange={(event) => setArabic(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm"
                />
              </label>

              <label className="text-xs font-bold text-slate-600">
                {isRtl ? "النوع" : "Typ"}
                <select
                  value={type}
                  onChange={(event) => setType(event.target.value as ExamItemType)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"
                >
                  <option value="word">Wort</option>
                  <option value="phrase">Phrase</option>
                  <option value="verb">Verb</option>
                  <option value="noun">Nomen</option>
                  <option value="adjective">Adjektiv</option>
                  <option value="other">Andere</option>
                </select>
              </label>

              <label className="text-xs font-bold text-slate-600">
                {isRtl ? "مثال ألماني" : "Deutsches Beispiel"}
                <textarea
                  value={exampleDe}
                  onChange={(event) => setExampleDe(event.target.value)}
                  rows={2}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm"
                  dir="ltr"
                />
              </label>

              <label className="text-xs font-bold text-slate-600">
                {isRtl ? "ترجمة المثال" : "Arabische Übersetzung"}
                <textarea
                  value={exampleAr}
                  onChange={(event) => setExampleAr(event.target.value)}
                  rows={2}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm"
                />
              </label>

              <label className="text-xs font-bold text-slate-600">
                {isRtl ? "ملاحظات" : "Notizen"}
                <textarea
                  value={notesAr}
                  onChange={(event) => setNotesAr(event.target.value)}
                  rows={2}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm"
                />
              </label>
            </div>

            {draftNotice && <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs font-bold text-slate-700">{draftNotice}</p>}

            <button
              type="submit"
              className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-black text-white hover:bg-blue-700"
            >
              <FilePlus2 size={18} />
              {isRtl ? "إضافة للمسودة" : "Als Entwurf speichern"}
            </button>
          </form>

          <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-slate-900">{selectedSection.title_de}</h2>
                <p className="mt-1 text-sm text-slate-500">Modell {modelNumber} · {selectedDrafts.length} {isRtl ? "عنصر" : "Einträge"}</p>
              </div>
              <button
                type="button"
                onClick={exportSelectedModel}
                disabled={!selectedDrafts.length}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Download size={17} />
                {isRtl ? "تصدير النموذج JSON" : "Modell als JSON exportieren"}
              </button>
            </div>

            {!selectedDrafts.length ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm font-bold text-slate-400">
                {isRtl ? "لا توجد كلمات في هذا النموذج حتى الآن." : "Für dieses Modell gibt es noch keine Entwürfe."}
              </div>
            ) : (
              <div className="space-y-3">
                {selectedDrafts.map((item) => (
                  <article key={item.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="text-base text-slate-900" dir="ltr">{item.term}</strong>
                          <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-500">{item.type}</span>
                          <span className="text-[10px] font-bold text-slate-400" dir="ltr">{item.id}</span>
                        </div>
                        <p className="mt-1 text-sm font-bold text-slate-700">{item.arabic}</p>
                        {item.example.de && (
                          <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
                            <p dir="ltr" className="font-semibold text-slate-800">{item.example.de}</p>
                            {item.example.ar && <p className="mt-1 text-slate-600">{item.example.ar}</p>}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeDraft(item.id)}
                        className="shrink-0 rounded-lg p-2 text-rose-600 hover:bg-rose-50"
                        title={isRtl ? "حذف من المسودة" : "Entwurf löschen"}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
