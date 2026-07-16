import type { B2GrammarExercise, B2GrammarLanguage } from "./types";

export interface B2GrammarPromptPresentation {
  localizedPrompt: string;
  germanPrompt: string | null;
}

export function getB2GrammarPromptPresentation(
  exercise: Pick<B2GrammarExercise, "prompt_de" | "prompt_ar">,
  language: B2GrammarLanguage,
): B2GrammarPromptPresentation {
  if (language === "de") {
    return { localizedPrompt: exercise.prompt_de, germanPrompt: null };
  }

  const localizedPrompt = exercise.prompt_ar.trim();
  const germanPrompt = exercise.prompt_de.trim();
  return {
    localizedPrompt,
    germanPrompt: germanPrompt && germanPrompt !== localizedPrompt ? germanPrompt : null,
  };
}
