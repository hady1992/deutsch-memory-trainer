export type GermanSpeechOptions = {
  rate?: number;
  pitch?: number;
  volume?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: () => void;
};

export type B2SpeechRateMode = "slow" | "normal";

export const B2_SPEECH_RATE_STORAGE_KEY = "dmt_b2_course_speech_rate_v1";
export const B2_SPEECH_RATES: Record<B2SpeechRateMode, number> = {
  slow: 0.72,
  normal: 0.92,
};

let cachedVoices: SpeechSynthesisVoice[] = [];
let observedSynthesis: SpeechSynthesis | null = null;
let activeUtterance: SpeechSynthesisUtterance | null = null;

function getSynthesis(): SpeechSynthesis | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  return window.speechSynthesis;
}

function refreshVoices(): void {
  cachedVoices = observedSynthesis?.getVoices() ?? [];
}

function observeVoices(synthesis: SpeechSynthesis): void {
  if (observedSynthesis !== synthesis) {
    observedSynthesis?.removeEventListener("voiceschanged", refreshVoices);
    observedSynthesis = synthesis;
    observedSynthesis.addEventListener("voiceschanged", refreshVoices);
  }
  refreshVoices();
}

export function isSpeechSupported(): boolean {
  return getSynthesis() !== null && typeof SpeechSynthesisUtterance !== "undefined";
}

export function getGermanVoice(): SpeechSynthesisVoice | null {
  const synthesis = getSynthesis();
  if (!synthesis) return null;
  observeVoices(synthesis);
  return cachedVoices.find((voice) => voice.lang.toLowerCase() === "de-de")
    ?? cachedVoices.find((voice) => voice.lang.toLowerCase().startsWith("de-"))
    ?? null;
}

export function stopSpeaking(): void {
  activeUtterance = null;
  getSynthesis()?.cancel();
}

export function speakGerman(text: string, options: GermanSpeechOptions = {}): boolean {
  const synthesis = getSynthesis();
  if (!synthesis || typeof SpeechSynthesisUtterance === "undefined" || !text.trim()) return false;

  stopSpeaking();
  const utterance = new SpeechSynthesisUtterance(text.trim());
  const voice = getGermanVoice();
  utterance.lang = "de-DE";
  if (voice) utterance.voice = voice;
  utterance.rate = options.rate ?? 0.85;
  utterance.pitch = options.pitch ?? 1;
  utterance.volume = options.volume ?? 1;
  utterance.onstart = () => {
    if (activeUtterance === utterance) options.onStart?.();
  };
  utterance.onend = () => {
    if (activeUtterance !== utterance) return;
    activeUtterance = null;
    options.onEnd?.();
  };
  utterance.onerror = () => {
    if (activeUtterance !== utterance) return;
    activeUtterance = null;
    options.onError?.();
  };

  activeUtterance = utterance;
  try {
    synthesis.speak(utterance);
    return true;
  } catch {
    activeUtterance = null;
    options.onError?.();
    return false;
  }
}

export function getStoredSpeechRateMode(): B2SpeechRateMode {
  if (typeof window === "undefined") return "normal";
  const stored = window.localStorage.getItem(B2_SPEECH_RATE_STORAGE_KEY);
  return stored === "slow" ? "slow" : "normal";
}

export function setStoredSpeechRateMode(mode: B2SpeechRateMode): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(B2_SPEECH_RATE_STORAGE_KEY, mode);
  }
}
