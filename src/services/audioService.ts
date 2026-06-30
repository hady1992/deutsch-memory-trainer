export class AudioService {
  private static currentUtterance: SpeechSynthesisUtterance | null = null;
  private static voicesReady = false;

  public static isSupported(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  }

  private static getRate(speed: "slow" | "normal" | "fast"): number {
    if (speed === "slow") return 0.7;
    if (speed === "fast") return 1.1;
    return 0.85;
  }

  private static getGermanVoice(): SpeechSynthesisVoice | null {
    const voices = window.speechSynthesis.getVoices();
    return (
      voices.find((voice) => voice.lang === "de-DE") ||
      voices.find((voice) => voice.lang.startsWith("de")) ||
      null
    );
  }

  private static createUtterance(text: string, speed: "slow" | "normal" | "fast"): SpeechSynthesisUtterance {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "de-DE";
    utterance.rate = this.getRate(speed);
    utterance.pitch = 1;
    utterance.volume = 1;

    const deVoice = this.getGermanVoice();
    if (deVoice) {
      utterance.voice = deVoice;
    }

    utterance.onend = () => {
      if (this.currentUtterance === utterance) {
        this.currentUtterance = null;
      }
    };
    utterance.onerror = (event) => {
      console.warn("Speech synthesis failed", event.error);
      if (this.currentUtterance === utterance) {
        this.currentUtterance = null;
      }
    };

    return utterance;
  }

  // Play text in German. Returns false only when the browser cannot start speech.
  public static speak(text: string, speed: "slow" | "normal" | "fast" = "normal"): boolean {
    if (!this.isSupported()) {
      console.warn("Speech Synthesis is not supported in this browser.");
      return false;
    }

    // Remove any Arabic characters from text just in case, to prevent German voice trying to read it
    const cleanText = text.replace(/[\u0600-\u06FF]/g, "").trim();
    if (!cleanText) return false;

    const synth = window.speechSynthesis;
    this.stop();

    const startSpeech = () => {
      const utterance = this.createUtterance(cleanText, speed);
      this.currentUtterance = utterance;

      // Chrome can occasionally leave synthesis paused after cancel/navigation.
      if (synth.paused) {
        synth.resume();
      }
      window.setTimeout(() => synth.speak(utterance), 0);
    };

    const voices = synth.getVoices();
    if (!this.voicesReady && voices.length === 0) {
      let started = false;
      const previousHandler = synth.onvoiceschanged;
      synth.onvoiceschanged = (event) => {
        if (typeof previousHandler === "function") {
          previousHandler.call(synth, event);
        }
        if (!started) {
          started = true;
          this.voicesReady = true;
          startSpeech();
        }
      };
      window.setTimeout(() => {
        if (!started) {
          started = true;
          startSpeech();
        }
      }, 300);
    } else {
      this.voicesReady = true;
      startSpeech();
    }

    return true;
  }

  // Stop currently playing audio
  public static stop(): void {
    if (this.isSupported() && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      this.currentUtterance = null;
    }
  }

  // Check if currently speaking
  public static isSpeaking(): boolean {
    if (this.isSupported() && window.speechSynthesis) {
      return window.speechSynthesis.speaking;
    }
    return false;
  }
}
