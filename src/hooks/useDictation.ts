// useDictation — browser-only speech-to-text for text fields.
//
// Doctrine: this uses the browser SpeechRecognition API, exactly like
// VoiceCaptureCard. No server round trip, no AI credits, no automatic calls.
// Dictation only fills a field — the user still taps the button that acts.
import { useCallback, useEffect, useRef, useState } from "react";

type RecognitionLike = {
  start: () => void;
  stop: () => void;
  abort: () => void;
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

function getRecognitionCtor(): (new () => RecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return (w.SpeechRecognition || w.webkitSpeechRecognition) ?? null;
}

export function useDictation({
  /** Called with each finalized phrase. The caller decides where it lands. */
  onFinal,
}: {
  onFinal: (phrase: string) => void;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<RecognitionLike | null>(null);
  const finalRef = useRef(onFinal);
  finalRef.current = onFinal;

  useEffect(() => {
    setSupported(!!getRecognitionCtor());
    return () => {
      try { recRef.current?.abort(); } catch { /* noop */ }
    };
  }, []);

  const stop = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* noop */ }
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) { setSupported(false); return; }
    setError(null);
    setInterim("");
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e: any) => {
      let fin = ""; let mid = "";
      for (let k = e.resultIndex; k < e.results.length; k++) {
        const res = e.results[k];
        if (res.isFinal) fin += res[0].transcript;
        else mid += res[0].transcript;
      }
      if (fin.trim()) finalRef.current(fin.trim());
      setInterim(mid);
    };
    r.onerror = (e: any) => {
      const code = e?.error ?? "unknown";
      if (code === "no-speech" || code === "aborted") return; // benign
      setError(code === "not-allowed" ? "Microphone permission is off." : `Dictation stopped (${code}).`);
    };
    r.onend = () => {
      setListening(false);
      setInterim("");
    };
    try {
      r.start();
      recRef.current = r;
      setListening(true);
    } catch {
      setError("Couldn't start dictation.");
    }
  }, []);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  return { supported, listening, interim, error, start, stop, toggle };
}
