import React, { useState, useEffect } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { AudioService } from "../services/audioService";

interface AudioButtonProps {
  text: string;
  speed?: "slow" | "normal" | "fast";
  size?: number;
  className?: string;
  id?: string;
}

export default function AudioButton({
  text,
  speed = "normal",
  size = 20,
  className = "",
  id,
}: AudioButtonProps) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const isArabic = typeof document !== "undefined" && document.documentElement.lang === "ar";
  const playLabel = isArabic ? "استمع إلى النطق" : "Aussprache hören";
  const stopLabel = isArabic ? "إيقاف الصوت" : "Stop";

  useEffect(() => {
    // Poll to check if browser is still speaking
    const interval = setInterval(() => {
      if (isSpeaking && !AudioService.isSpeaking()) {
        setIsSpeaking(false);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isSpeaking]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // prevent modal/card click side effects
    
    if (isSpeaking) {
      AudioService.stop();
      setIsSpeaking(false);
    } else {
      const started = AudioService.speak(text, speed);
      setIsSpeaking(started);
    }
  };

  if (!AudioService.isSupported()) {
    return null; // hide or return disabled state silently
  }

  return (
    <button
      id={id}
      type="button"
      onClick={handleClick}
      title={isSpeaking ? stopLabel : playLabel}
      aria-label={isSpeaking ? stopLabel : playLabel}
      className={`inline-flex items-center justify-center p-2 rounded-full transition-colors cursor-pointer ${
        isSpeaking
          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
          : "bg-blue-50 text-blue-600 hover:bg-blue-100"
      } ${className}`}
    >
      {isSpeaking ? <VolumeX size={size} /> : <Volume2 size={size} />}
    </button>
  );
}
