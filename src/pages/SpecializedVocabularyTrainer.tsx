import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Award, Check, ChevronRight, HelpCircle, RotateCw, X } from "lucide-react";
import AudioButton from "../components/AudioButton";
import { DataService } from "../services/dataService";
import { MistakeReviewService } from "../services/mistakeReviewService";
import { ProgressService } from "../services/progressService";
import {
  answersMatchAny,
  getVocabularyFullTerm,
  getVocabularyMeaningQuestion,
  getVocabularyWritingQuestion,
  VocabularyTrainingQuestion,
} from "../services/vocabularyTrainingService";
import { selectArabicDistractors } from "../services/arabicDistractorService";
import { ensureCorrectOption } from "../services/choiceOptionService";
import { UserSettings, Vocabulary } from "../types";

interface TrainerProps {
  onNavigate: (page: string) => void;
  settings: UserSettings;
}

type TrainerKind = "article" | "plural" | "adjective" | "phrase" | "general";
type AdjectiveMode = "learn" | "meaning" | "german" | "sentence" | "writing";

type TrainerConfig = {
  kind: TrainerKind;
  titleAr: string;
  titleDe: string;
  badgeAr: string;
  badgeDe: string;
  loadItems: () => Promise<Vocabulary[]>;
  makeQuestion: (item: Vocabulary, allItems: Vocabulary[]) => VocabularyTrainingQuestion | null;
};

function shuffle<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}

function firstString(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const trimmed = value.trim();
    const key = trimmed.toLocaleLowerCase("de-DE");
    if (!trimmed || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stripLeadingArticle(value: string): string {
  return value
    .replace(/^_{2,}\s*/g, "")
    .replace(/^(der|die|das)\s+/i, "")
    .trim();
}

function safeVisibleGerman(value: string): string {
  return stripLeadingArticle(value.replace(/_{2,}/g, "_____")).trim();
}

function exampleFrom(value: any) {
  return {
    de: firstString(value?.de || value?.example_de || value?.example),
    ar: firstString(value?.ar || value?.example_ar),
  };
}

function isGenericExampleText(text: string): boolean {
  return /Der Ausdruck|Diese Phrase|Dieses Wort|im Alltag wichtig|Berufsalltag kann|richtig verwenden|Der passende Ausdruck/i.test(text);
}

function preferredExample(item: Vocabulary) {
  const examples = item.examples || [];
  return exampleFrom(examples.find((example) => !isGenericExampleText(firstString(example.de))) || examples[0]);
}

function nounArticleQuestion(item: Vocabulary): VocabularyTrainingQuestion | null {
  const answer = firstString(item.articleTraining?.answer || item.article);
  if (!answer) return null;
  const options = ensureCorrectOption(["der", "die", "das"], answer, 3);
  if (!options) return null;
  const example = exampleFrom(item.articleTraining?.exampleAfterAnswer || item.examples?.[0]);
  const visibleNoun = safeVisibleGerman(firstString(item.cleanTerm || (item as any).termWithoutArticle || item.term || item.singular));
  const rawPrompt = firstString(item.articleTraining?.question);
  const promptDe = rawPrompt.includes("___") ? rawPrompt : `___ ${visibleNoun}`;
  return {
    id: "article_choice",
    sourceType: "vocabulary_v3",
    kind: "article",
    promptAr: firstString(item.articleTraining?.question_ar) || "اختر الأرتيكل الصحيح.",
    promptDe,
    answer,
    answerLang: "de",
    options,
    visibleText: `___ ${visibleNoun}`,
    speakBeforeAnswer: visibleNoun,
    correctAnswer: answer,
    speakAfterAnswer: `${answer} ${visibleNoun}`.trim(),
    exampleDe: example.de,
    exampleAr: example.ar,
    noteAr: firstString(item.articleTraining?.explanation_ar || item.notes_ar),
  };
}

function nounPluralQuestion(item: Vocabulary): VocabularyTrainingQuestion | null {
  const training = item.pluralTraining || {};
  const answer = firstString(training.answer || item.pluralTerm || item.plural);
  if (!answer || training.hasPlural === false) return null;
  const example = exampleFrom(training.exampleAfterAnswer || item.examples?.[0]);
  return {
    id: "plural_write",
    sourceType: "vocabulary_v3",
    kind: "plural",
    promptAr: "اكتب صيغة الجمع.",
    promptDe: firstString(training.question || getVocabularyFullTerm(item)),
    answer,
    answerLang: "de",
    acceptedAnswers: unique([answer, firstString(training.pluralTerm), firstString(item.pluralTerm), firstString(item.plural)]),
    visibleText: firstString(training.question || getVocabularyFullTerm(item)),
    speakBeforeAnswer: safeVisibleGerman(firstString(training.question || getVocabularyFullTerm(item))),
    correctAnswer: answer,
    speakAfterAnswer: answer,
    exampleDe: example.de,
    exampleAr: example.ar,
    noteAr: firstString(training.explanation_ar || item.notes_ar),
  };
}

function phraseGapQuestion(item: Vocabulary, allItems: Vocabulary[]): VocabularyTrainingQuestion | null {
  const gapExamples = [
    ...(Array.isArray(item.gapExamples) ? item.gapExamples : []),
    item.phraseTraining?.fillBlank,
    item.gapExample,
  ].filter(Boolean);
  const fillBlank = gapExamples.find((example) => {
    const text = firstString(example?.de);
    return example?.answer && text.includes("_") && !isGenericExampleText(text);
  }) || gapExamples.find((example) => example?.answer && firstString(example?.de).includes("_"));
  if (!fillBlank?.answer) return meaningQuestion(item, allItems);
  const acceptedAnswers = Array.isArray(fillBlank.acceptedAnswers) ? fillBlank.acceptedAnswers.map(firstString) : [];
  return {
    id: "phrase_fill_blank",
    sourceType: "vocabulary_v3",
    kind: "phrase_gap",
    promptAr: firstString(fillBlank.ar),
    promptDe: firstString(fillBlank.de),
    answer: firstString(fillBlank.answer),
    answerLang: "de",
    acceptedAnswers: unique([firstString(fillBlank.answer), ...acceptedAnswers]),
    visibleText: firstString(fillBlank.de),
    speakBeforeAnswer: firstString(fillBlank.de),
    correctAnswer: firstString(fillBlank.answer),
    speakAfterAnswer: firstString(fillBlank.answer),
    exampleDe: firstString(fillBlank.de),
    exampleAr: firstString(fillBlank.ar),
  };
}

function meaningQuestion(item: Vocabulary, allItems: Vocabulary[]): VocabularyTrainingQuestion | null {
  const question = getVocabularyMeaningQuestion(item, allItems);
  return question.answer
    ? {
        ...question,
        id: item.dataMeta?.family === "other" ? "general_vocabulary_meaning" : question.id,
        promptAr: "ما معنى الكلمة الألمانية التالية؟",
        noteAr: question.noteAr || item.notes_ar,
      }
    : null;
}

function adjectiveMeaningQuestion(item: Vocabulary, allItems: Vocabulary[]): VocabularyTrainingQuestion | null {
  const answer = firstString(item.adjectiveTraining?.meaning?.answer_ar || item.arabic);
  const term = firstString(item.adjectiveTraining?.meaning?.question || item.term || item.rawTerm);
  if (!answer || !term) return null;
  const example = exampleFrom(item.adjectiveTraining?.meaning?.exampleAfterAnswer || preferredExample(item));
  const distractors = selectArabicDistractors(item, allItems, answer, {
    count: 3,
    sourceType: "adjective",
    targetKind: "adjective",
    getAnswer: (candidate) => firstString(candidate.adjectiveTraining?.meaning?.answer_ar || candidate.arabic),
    getId: (candidate) => candidate.id,
  });
  const options = ensureCorrectOption(unique([answer, ...distractors]), answer, 4);
  if (!options) return null;
  return {
    id: "adjective_meaning_choice",
    sourceType: "vocabulary_v3",
    kind: "adjective_meaning_choice",
    promptAr: "ما معنى الصفة التالية؟",
    promptDe: term,
    answer,
    answerLang: "ar",
    options,
    visibleText: term,
    speakBeforeAnswer: term,
    correctAnswer: answer,
    exampleDe: example.de,
    exampleAr: example.ar,
    noteAr: item.notes_ar,
  };
}

function adjectiveGermanChoiceQuestion(item: Vocabulary, allItems: Vocabulary[]): VocabularyTrainingQuestion | null {
  const answer = firstString(item.adjectiveTraining?.writeGerman?.answer || item.term);
  const promptAr = firstString(item.adjectiveTraining?.writeGerman?.question_ar || item.arabic);
  if (!answer || !promptAr) return null;
  const example = exampleFrom(item.adjectiveTraining?.writeGerman?.exampleAfterAnswer || preferredExample(item));
  const options = ensureCorrectOption(
    unique([answer, ...shuffle(allItems.map((candidate) => firstString(candidate.term)).filter(Boolean)).slice(0, 8)]),
    answer,
    4
  );
  if (!options) return null;
  return {
    id: "adjective_german_choice",
    sourceType: "vocabulary_v3",
    kind: "adjective_german_choice",
    promptAr: `اختر الصفة الألمانية المناسبة لهذا المعنى: ${promptAr}`,
    answer,
    answerLang: "de",
    options,
    visibleText: promptAr,
    speakBeforeAnswer: promptAr,
    correctAnswer: answer,
    speakAfterAnswer: answer,
    exampleDe: example.de,
    exampleAr: example.ar,
    noteAr: item.notes_ar,
  };
}

function adjectiveSentenceQuestion(item: Vocabulary): VocabularyTrainingQuestion | null {
  const answer = firstString(item.term);
  if (!answer) return null;
  const example = (item.examples || []).find((candidate) => {
    const de = firstString(candidate.de);
    return de.includes(answer) && !isGenericExampleText(de);
  }) || (item.examples || []).find((candidate) => firstString(candidate.de).includes(answer));
  const sentence = firstString(example?.de);
  if (!sentence) return null;
  return {
    id: "adjective_sentence",
    sourceType: "vocabulary_v3",
    kind: "adjective_sentence",
    promptAr: "أكمل الصفة في الجملة.",
    promptDe: sentence.replace(new RegExp(`\\b${answer}\\b`, "i"), "________"),
    answer,
    answerLang: "de",
    acceptedAnswers: [answer],
    visibleText: sentence.replace(new RegExp(`\\b${answer}\\b`, "i"), "________"),
    speakBeforeAnswer: sentence.replace(new RegExp(`\\b${answer}\\b`, "i"), "_____"),
    correctAnswer: answer,
    speakAfterAnswer: answer,
    exampleDe: sentence,
    exampleAr: firstString(example?.ar),
    noteAr: item.notes_ar,
  };
}

function adjectiveWritingQuestion(item: Vocabulary): VocabularyTrainingQuestion | null {
  const question = getVocabularyWritingQuestion(item);
  return {
    ...question,
    id: "adjective_writing",
  };
}

function adjectiveQuestion(item: Vocabulary, allItems: Vocabulary[], mode: AdjectiveMode): VocabularyTrainingQuestion | null {
  if (mode === "meaning" || mode === "learn") return adjectiveMeaningQuestion(item, allItems);
  if (mode === "german") return adjectiveGermanChoiceQuestion(item, allItems);
  if (mode === "sentence") return adjectiveSentenceQuestion(item) || adjectiveMeaningQuestion(item, allItems);
  return adjectiveWritingQuestion(item);
}

function prepareQuestion(question: VocabularyTrainingQuestion | null, item: Vocabulary): VocabularyTrainingQuestion | null {
  if (!question) return null;
  const visibleText = firstString(question.visibleText || question.promptDe || question.promptAr || getVocabularyFullTerm(item));
  const safePrompt = question.kind === "article"
    ? stripLeadingArticle(visibleText)
    : visibleText;
  const correctAnswer = firstString(question.correctAnswer || question.answer);
  const validatedOptions = question.options?.length
    ? ensureCorrectOption(question.options, correctAnswer, question.options.length)
    : question.options;
  if (question.options?.length && !validatedOptions) return null;

  return {
    ...question,
    options: validatedOptions,
    visibleText,
    speakBeforeAnswer: firstString(question.speakBeforeAnswer || safePrompt),
    correctAnswer,
    speakAfterAnswer: firstString(question.speakAfterAnswer || question.answer),
  };
}

function SpecialtyVocabularyTrainer({ config, onNavigate, settings }: TrainerProps & { config: TrainerConfig }) {
  const [items, setItems] = useState<Vocabulary[]>([]);
  const [sessionItems, setSessionItems] = useState<Vocabulary[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [question, setQuestion] = useState<VocabularyTrainingQuestion | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [writtenAnswer, setWrittenAnswer] = useState("");
  const [checked, setChecked] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adjectiveMode, setAdjectiveMode] = useState<AdjectiveMode>("learn");
  const isRtl = settings.language === "ar";

  const ui = isRtl
    ? {
        dashboard: "لوحة التحكم",
        loading: "جاري التحميل...",
        empty: "لا توجد عناصر مناسبة لهذا التدريب.",
        question: "السؤال",
        check: "تحقق من الإجابة",
        next: "التالي",
        correct: "صحيح",
        wrong: "خطأ",
        correctAnswer: "الإجابة الصحيحة",
        example: "مثال",
        note: "ملاحظة",
        done: "انتهى التدريب!",
        repeat: "إعادة التدريب",
        item: "عنصر",
        of: "من",
        writeAnswer: "اكتب الإجابة",
        learnAdjectives: "تعلّم الصفات",
        chooseMeaning: "اختر المعنى",
        chooseGermanAdjective: "اختر الصفة الألمانية",
        adjectiveSentence: "الصفة في جملة",
        adjectiveWriting: "كتابة الصفة",
        knowIt: "أعرفها",
        needReview: "أحتاج مراجعة",
      }
    : {
        dashboard: "Dashboard",
        loading: "Loading...",
        empty: "No suitable items for this trainer.",
        question: "Question",
        check: "Check answer",
        next: "Next",
        correct: "Correct",
        wrong: "Wrong",
        correctAnswer: "Correct answer",
        example: "Example",
        note: "Note",
        done: "Training finished!",
        repeat: "Repeat",
        item: "Item",
        of: "of",
        writeAnswer: "Write the answer",
        learnAdjectives: "Learn adjectives",
        chooseMeaning: "Choose meaning",
        chooseGermanAdjective: "Choose German adjective",
        adjectiveSentence: "Adjective in sentence",
        adjectiveWriting: "Write adjective",
        knowIt: "I know it",
        needReview: "Needs review",
      };

  const title = isRtl ? config.titleAr : config.titleDe;
  const badge = isRtl ? config.badgeAr : config.badgeDe;
  const currentItem = sessionItems[currentIndex];
  const currentAnswer = question?.options?.length ? selectedChoice || "" : writtenAnswer;
  const isCorrect = question ? answersMatchAny(currentAnswer, question) : false;
  const isAdjectiveLearnMode = config.kind === "adjective" && adjectiveMode === "learn";

  const makeQuestionForItem = (item: Vocabulary, list: Vocabulary[]) =>
    config.kind === "adjective"
      ? adjectiveQuestion(item, list, adjectiveMode)
      : config.makeQuestion(item, list);

  const eligibleItems = useMemo(
    () => items.filter((item) => Boolean(makeQuestionForItem(item, items))),
    [adjectiveMode, config, items]
  );

  const setupQuestion = (list: Vocabulary[], index: number) => {
    for (let nextIndex = index; nextIndex < list.length; nextIndex++) {
      const item = list[nextIndex];
      const preparedQuestion = prepareQuestion(makeQuestionForItem(item, items), item);
      if (!preparedQuestion) continue;
      setCurrentIndex(nextIndex);
      setQuestion(preparedQuestion);
      setSelectedChoice(null);
      setWrittenAnswer("");
      setChecked(false);
      return;
    }
    setQuestion(null);
    setFinished(true);
    setSelectedChoice(null);
    setWrittenAnswer("");
    setChecked(false);
  };

  const startSession = (sourceItems: Vocabulary[] = eligibleItems) => {
    const limit = settings.questionsPerSession || 10;
    const list = shuffle(sourceItems).slice(0, limit);
    setSessionItems(list);
    setCurrentIndex(0);
    setCorrectCount(0);
    setWrongCount(0);
    setFinished(false);
    setupQuestion(list, 0);
  };

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      const data = await config.loadItems();
      if (!mounted) return;
      setItems(data);
      setLoading(false);
    }
    load();
    return () => {
      mounted = false;
    };
  }, [config]);

  useEffect(() => {
    if (!loading && items.length) {
      const available = items.filter((item) => Boolean(makeQuestionForItem(item, items)));
      startSession(available);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, items, adjectiveMode]);

  const checkAnswer = () => {
    if (!question || !currentItem || !currentAnswer.trim()) return;
    const correct = answersMatchAny(currentAnswer, question);
    ProgressService.recordReview(`vocab-${currentItem.id}`, correct);

    if (correct) {
      setCorrectCount((prev) => prev + 1);
    } else {
      setWrongCount((prev) => prev + 1);
      MistakeReviewService.recordMistake({
        id: `mistake-vocab-${config.kind}-${currentItem.id}-${question.id}`,
        itemKey: `vocab-${currentItem.id}`,
        type: "vocabulary",
        mode: question.options?.length ? "vocab-multiple-choice" : "vocab-writing",
        sourceType: config.kind === "general" ? "other" : config.kind,
        questionType: question.id,
        choices: question.options,
        answerLang: question.answerLang,
        example_de: question.exampleDe,
        example_ar: question.exampleAr,
        note_ar: question.noteAr,
        itemId: currentItem.id,
        term: getVocabularyFullTerm(currentItem),
        arabic: currentItem.arabic,
        questionText: question.promptAr || question.promptDe || title,
        correctAnswer: question.correctAnswer || question.answer,
        userAnswer: currentAnswer,
      });
    }

    setChecked(true);
  };

  const nextQuestion = () => {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= sessionItems.length) {
      setFinished(true);
      return;
    }
    setCurrentIndex(nextIndex);
    setupQuestion(sessionItems, nextIndex);
  };

  const handleLearnResult = (known?: boolean) => {
    if (!currentItem) return;
    if (known !== undefined) {
      ProgressService.recordReview(`vocab-${currentItem.id}`, known);
      if (known) {
        setCorrectCount((prev) => prev + 1);
      } else {
        setWrongCount((prev) => prev + 1);
        MistakeReviewService.recordMistake({
          id: `mistake-vocab-adjective-${currentItem.id}-adjective_learn`,
          itemKey: `vocab-${currentItem.id}`,
          type: "vocabulary",
          mode: "adjective",
          sourceType: "adjective",
          questionType: "adjective_learn",
          itemId: currentItem.id,
          term: getVocabularyFullTerm(currentItem),
          arabic: currentItem.arabic,
          questionText: "تعلّم الصفات",
          correctAnswer: currentItem.arabic,
          userAnswer: "أحتاج مراجعة",
          example_de: preferredExample(currentItem).de,
          example_ar: preferredExample(currentItem).ar,
          note_ar: currentItem.notes_ar,
        });
      }
    }
    nextQuestion();
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 text-center text-sm font-bold text-slate-500">
        {ui.loading}
      </div>
    );
  }

  if (!eligibleItems.length) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-6" dir={isRtl ? "rtl" : "ltr"}>
        <button onClick={() => onNavigate("dashboard")} className="inline-flex items-center text-xs uppercase tracking-wider font-bold text-slate-500 hover:text-slate-800">
          <ArrowLeft className={`${isRtl ? "ml-1.5 rotate-180" : "mr-1.5"}`} size={16} /> {ui.dashboard}
        </button>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center">
          <HelpCircle className="mx-auto text-slate-300 mb-3" size={34} />
          <h2 className="font-black text-slate-800">{title}</h2>
          <p className="text-sm text-slate-500 mt-2">{ui.empty}</p>
        </div>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-6" dir={isRtl ? "rtl" : "ltr"}>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center">
          <Award className="mx-auto text-amber-500 mb-3" size={42} />
          <h2 className="text-2xl font-black text-slate-800">{ui.done}</h2>
          <div className="flex justify-center gap-3 mt-5 text-sm font-bold">
            <span className="text-emerald-600">{ui.correct}: {correctCount}</span>
            <span className="text-rose-600">{ui.wrong}: {wrongCount}</span>
          </div>
          <button
            onClick={() => startSession()}
            className="mt-6 inline-flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl shadow-md cursor-pointer"
          >
            <RotateCw className={isRtl ? "ml-2" : "mr-2"} size={16} /> {ui.repeat}
          </button>
        </div>
      </div>
    );
  }

  if (!currentItem || !question) return null;
  const learningExample = preferredExample(currentItem);
  const adjectiveTerm = firstString(currentItem.term || currentItem.rawTerm);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-6" dir={isRtl ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <button
          onClick={() => onNavigate("dashboard")}
          className="inline-flex items-center text-xs uppercase tracking-wider font-bold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className={`${isRtl ? "ml-1.5 rotate-180" : "mr-1.5"}`} size={16} /> {ui.dashboard}
        </button>
        <div className="text-xs font-black text-slate-500 uppercase">
          {ui.item} {currentIndex + 1} {ui.of} {sessionItems.length}
        </div>
      </div>

      {config.kind === "adjective" && (
        <div className="flex flex-wrap gap-2 bg-white border border-slate-100 rounded-xl p-3 shadow-sm">
          {[
            ["learn", ui.learnAdjectives],
            ["meaning", ui.chooseMeaning],
            ["german", ui.chooseGermanAdjective],
            ["sentence", ui.adjectiveSentence],
            ["writing", ui.adjectiveWriting],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setAdjectiveMode(id as AdjectiveMode)}
              className={`px-3 py-2 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                adjectiveMode === id
                  ? "bg-blue-600 border-blue-600 text-white"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-md p-6 sm:p-8 space-y-6">
        <div className="flex justify-between items-start gap-4">
          <span className="bg-blue-50 text-blue-700 text-xs px-2.5 py-0.5 rounded uppercase font-semibold">
            {badge}
          </span>
          {question.speakBeforeAnswer && <AudioButton text={question.speakBeforeAnswer} speed={settings.speechSpeed} />}
        </div>

        <div className="text-center space-y-3">
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900">{title}</h1>
          {isAdjectiveLearnMode ? (
            <div className="space-y-3">
              <p dir="ltr" lang="de" className="text-4xl font-black text-slate-900 text-center">
                {adjectiveTerm}
              </p>
              <p dir="rtl" lang="ar" className="text-lg font-bold text-blue-600 font-arabic text-center">
                {currentItem.arabic}
              </p>
              {currentItem.opposite && (
                <p dir="ltr" lang="de" className="text-xs font-bold text-slate-500 text-center">
                  Gegenteil: {currentItem.opposite}
                </p>
              )}
              {(learningExample.de || learningExample.ar || currentItem.notes_ar) && (
                <div className="p-4 bg-slate-50 rounded-xl space-y-2 mt-4">
                  {learningExample.de && (
                    <div className="flex items-center justify-between gap-3">
                      <p dir="ltr" lang="de" className="text-xs sm:text-sm font-semibold text-slate-800 text-left">
                        {learningExample.de}
                      </p>
                      <AudioButton text={learningExample.de} speed={settings.speechSpeed} size={16} />
                    </div>
                  )}
                  {learningExample.ar && (
                    <p dir="rtl" lang="ar" className="text-xs sm:text-sm font-bold text-blue-600 font-arabic text-right">
                      {learningExample.ar}
                    </p>
                  )}
                  {currentItem.notes_ar && (
                    <p dir="rtl" lang="ar" className="text-xs font-semibold text-slate-600 font-arabic text-right">
                      {currentItem.notes_ar}
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : question.promptDe && (
            <p dir="ltr" lang="de" className="text-xl font-extrabold text-slate-800 text-center">
              {question.promptDe}
            </p>
          )}
          {!isAdjectiveLearnMode && question.promptAr && (
            <p dir="rtl" lang="ar" className="text-sm sm:text-base font-bold text-slate-600 font-arabic text-right">
              {question.promptAr}
            </p>
          )}
        </div>

        {!isAdjectiveLearnMode && question.options?.length ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            {question.options.map((option) => {
              const selected = selectedChoice === option;
              const correctOption = answersMatchAny(option, question);
              let btnClass = "border-slate-200 hover:bg-slate-50 text-slate-800";
              if (selected && !checked) {
                btnClass = "border-blue-500 bg-blue-50 text-blue-700 font-bold";
              } else if (checked) {
                if (correctOption) btnClass = "border-emerald-500 bg-emerald-50 text-emerald-800 font-bold";
                else if (selected) btnClass = "border-rose-500 bg-rose-50 text-rose-800 font-bold";
                else btnClass = "border-slate-100 text-slate-400 opacity-60";
              }

              return (
                <button
                  key={option}
                  disabled={checked}
                  onClick={() => setSelectedChoice(option)}
                  className={`w-full p-4 rounded-xl border text-sm font-medium transition-all flex items-center justify-between cursor-pointer ${
                    question.answerLang === "ar" ? "text-right" : "text-left"
                  } ${btnClass}`}
                >
                  <span
                    dir={question.answerLang === "ar" ? "rtl" : "ltr"}
                    lang={question.answerLang}
                    className={question.answerLang === "ar" ? "w-full text-right font-arabic" : "w-full text-left"}
                  >
                    {option}
                  </span>
                  {checked && correctOption && <Check className="text-emerald-600 ml-2" size={16} />}
                  {checked && selected && !correctOption && <X className="text-rose-600 ml-2" size={16} />}
                </button>
              );
            })}
          </div>
        ) : !isAdjectiveLearnMode ? (
          <input
            type="text"
            disabled={checked}
            value={writtenAnswer}
            onChange={(event) => setWrittenAnswer(event.target.value)}
            placeholder={ui.writeAnswer}
            dir={question.answerLang === "ar" ? "rtl" : "ltr"}
            lang={question.answerLang}
            className={`w-full px-4 py-3 rounded-xl border text-sm font-medium focus:outline-none transition-all ${
              question.answerLang === "ar" ? "text-right font-arabic" : "text-left"
            } ${
              checked
                ? isCorrect
                  ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                  : "bg-rose-50 border-rose-300 text-rose-800"
                : "border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            }`}
          />
        ) : null}

        {!isAdjectiveLearnMode && checked && (
          <div className="flex items-center justify-center gap-2 text-xs font-semibold text-slate-600 text-center">
            <span>
              {ui.correctAnswer}:{" "}
              <span dir={question.answerLang === "ar" ? "rtl" : "ltr"} lang={question.answerLang} className="font-bold text-slate-900">
                {question.correctAnswer || question.answer}
              </span>
            </span>
            {question.speakAfterAnswer && <AudioButton text={question.speakAfterAnswer} speed={settings.speechSpeed} size={14} />}
          </div>
        )}

        {!isAdjectiveLearnMode && checked && (question.exampleDe || question.exampleAr || question.noteAr) && (
          <div className="p-4 bg-slate-50 rounded-xl space-y-2">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">{ui.example}</div>
            {question.exampleDe && (
              <div className="flex items-center justify-between gap-3">
                <p dir="ltr" lang="de" className="text-xs sm:text-sm font-semibold text-slate-800 text-left">
                  {question.exampleDe}
                </p>
                <AudioButton text={question.exampleDe} speed={settings.speechSpeed} size={16} />
              </div>
            )}
            {question.exampleAr && (
              <p dir="rtl" lang="ar" className="text-xs sm:text-sm font-bold text-blue-600 font-arabic text-right">
                {question.exampleAr}
              </p>
            )}
            {question.noteAr && (
              <p dir="rtl" lang="ar" className="text-xs font-semibold text-slate-600 font-arabic text-right">
                {ui.note}: {question.noteAr}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-center">
        {isAdjectiveLearnMode ? (
          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={() => handleLearnResult(true)}
              className="inline-flex items-center justify-center px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md cursor-pointer"
            >
              {ui.knowIt}
            </button>
            <button
              onClick={() => handleLearnResult(false)}
              className="inline-flex items-center justify-center px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-md cursor-pointer"
            >
              {ui.needReview}
            </button>
            <button
              onClick={() => handleLearnResult()}
              className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md cursor-pointer"
            >
              {ui.next}
            </button>
          </div>
        ) : !checked ? (
          <button
            onClick={checkAnswer}
            disabled={!currentAnswer.trim()}
            className={`w-full sm:w-auto inline-flex items-center justify-center px-8 py-3 font-bold rounded-xl shadow-md transition-colors ${
              currentAnswer.trim()
                ? "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                : "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
            }`}
          >
            {ui.check}
          </button>
        ) : (
          <button
            onClick={nextQuestion}
            className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md cursor-pointer"
          >
            {ui.next} <ChevronRight className={isRtl ? "mr-1 rotate-180" : "ml-1"} size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

const configs: Record<TrainerKind, TrainerConfig> = {
  article: {
    kind: "article",
    titleAr: "مدرب الأرتيكل",
    titleDe: "Artikel-Trainer",
    badgeAr: "الأسماء",
    badgeDe: "Nomen",
    loadItems: () => DataService.loadNouns(),
    makeQuestion: nounArticleQuestion,
  },
  plural: {
    kind: "plural",
    titleAr: "مدرب المفرد والجمع",
    titleDe: "Singular/Plural-Trainer",
    badgeAr: "الجمع",
    badgeDe: "Plural",
    loadItems: () => DataService.loadNouns(),
    makeQuestion: nounPluralQuestion,
  },
  adjective: {
    kind: "adjective",
    titleAr: "مدرب الصفات",
    titleDe: "Adjektiv-Trainer",
    badgeAr: "الصفات",
    badgeDe: "Adjektive",
    loadItems: () => DataService.loadAdjectives(),
    makeQuestion: (item, allItems) => adjectiveQuestion(item, allItems, "meaning"),
  },
  phrase: {
    kind: "phrase",
    titleAr: "مدرب العبارات",
    titleDe: "Phrasen-Trainer",
    badgeAr: "العبارات",
    badgeDe: "Phrasen",
    loadItems: () => DataService.loadPhrases(),
    makeQuestion: phraseGapQuestion,
  },
  general: {
    kind: "general",
    titleAr: "المفردات العامة",
    titleDe: "Allgemeiner Wortschatz",
    badgeAr: "مفردات عامة",
    badgeDe: "Allgemein",
    loadItems: () => DataService.loadOtherVocabulary(),
    makeQuestion: meaningQuestion,
  },
};

export function ArticleTrainer(props: TrainerProps) {
  return <SpecialtyVocabularyTrainer {...props} config={configs.article} />;
}

export function PluralTrainer(props: TrainerProps) {
  return <SpecialtyVocabularyTrainer {...props} config={configs.plural} />;
}

export function AdjectiveTrainer(props: TrainerProps) {
  return <SpecialtyVocabularyTrainer {...props} config={configs.adjective} />;
}

export function PhraseTrainer(props: TrainerProps) {
  return <SpecialtyVocabularyTrainer {...props} config={configs.phrase} />;
}

export function GeneralVocabularyTrainer(props: TrainerProps) {
  return <SpecialtyVocabularyTrainer {...props} config={configs.general} />;
}
