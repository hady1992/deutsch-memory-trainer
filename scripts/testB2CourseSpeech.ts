import type { B2SpeechRateMode } from "../src/features/b2-course/b2CourseSpeechService";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

class MockUtterance {
  lang = "";
  pitch = 1;
  rate = 1;
  volume = 1;
  voice: SpeechSynthesisVoice | null = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

const germanVoice = { lang: "de-DE", name: "German", default: false, localService: true, voiceURI: "de" } as SpeechSynthesisVoice;
const austrianVoice = { lang: "de-AT", name: "Austrian", default: false, localService: true, voiceURI: "de-at" } as SpeechSynthesisVoice;
const englishVoice = { lang: "en-US", name: "English", default: true, localService: true, voiceURI: "en" } as SpeechSynthesisVoice;
let voices = [englishVoice, austrianVoice, germanVoice];
let cancelled = 0;
let spoken: MockUtterance | null = null;
let voicesChanged: (() => void) | null = null;

const synthesis = {
  addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
    if (type === "voiceschanged") voicesChanged = listener as () => void;
  },
  removeEventListener: () => undefined,
  getVoices: () => voices,
  cancel: () => { cancelled += 1; },
  speak: (utterance: MockUtterance) => {
    spoken = utterance;
    utterance.onstart?.();
  },
} as unknown as SpeechSynthesis;

Object.defineProperty(globalThis, "window", {
  value: { speechSynthesis: synthesis, localStorage: new MemoryStorage() },
  configurable: true,
});
Object.defineProperty(globalThis, "SpeechSynthesisUtterance", {
  value: MockUtterance,
  configurable: true,
});

const speech = await import("../src/features/b2-course/b2CourseSpeechService");
assert(speech.isSpeechSupported(), "Speech support was not detected.");
assert(speech.getGermanVoice() === germanVoice, "The exact de-DE voice was not preferred.");

voices = [englishVoice, austrianVoice];
voicesChanged?.();
assert(speech.getGermanVoice() === austrianVoice, "The de-* fallback voice was not selected.");

let started = false;
let ended = false;
assert(speech.speakGerman("der Umzug", {
  rate: 0.72,
  onStart: () => { started = true; },
  onEnd: () => { ended = true; },
}), "German speech did not start.");
assert(started, "The speech start callback did not run.");
assert(spoken?.text === "der Umzug", "The spoken term changed.");
assert(spoken?.lang === "de-DE" && spoken.voice === austrianVoice, "German language or voice selection is wrong.");
assert(spoken?.rate === 0.72 && spoken.pitch === 1 && spoken.volume === 1, "Speech settings are wrong.");
spoken?.onend?.();
assert(ended, "The speech end callback did not run.");

let staleEndCalled = false;
speech.speakGerman("die Teamarbeit", { onEnd: () => { staleEndCalled = true; } });
const replacedUtterance = spoken;
speech.speakGerman("der Ansprechpartner / die Ansprechpartnerin");
replacedUtterance?.onend?.();
assert(!staleEndCalled, "A replaced utterance changed the active speech state.");
const activeSpeechText = String(spoken?.text ?? "");
assert(activeSpeechText === "der Ansprechpartner / die Ansprechpartnerin", "New speech did not replace the previous term.");

const modes: B2SpeechRateMode[] = ["slow", "normal"];
for (const mode of modes) {
  speech.setStoredSpeechRateMode(mode);
  assert(speech.getStoredSpeechRateMode() === mode, `Speech rate mode ${mode} was not persisted.`);
}
speech.stopSpeaking();
assert(cancelled >= 2, "Speech cancellation was not requested.");

Object.defineProperty(globalThis, "window", {
  value: { localStorage: new MemoryStorage() },
  configurable: true,
});
assert(!speech.isSpeechSupported(), "An unsupported browser was reported as speech-capable.");
assert(!speech.speakGerman("der Umzug"), "Speech started without Web Speech API support.");

console.log("B2 German speech service tests passed.");
