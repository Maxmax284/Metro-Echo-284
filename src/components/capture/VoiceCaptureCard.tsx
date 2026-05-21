// Wave 5 — Voice capture. Uses the browser SpeechRecognition API so we stay
// doctrine-pure: no automatic AI calls, no per-capture cost, no server round
// trip. Capture lands as a note (source=voice) with a capture_routes receipt
// in `needs_review` so it triages through the existing inbox flow. Nothing
// executes from here.
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2, Check, AlertCircle } from "lucide-react";
import { vantaToast as toast, vantaSay } from "@/lib/vantaVoice";
import { useCaptureRoute } from "@/hooks/useCaptureRoute";
import { cn } from "@/lib/utils";

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

export function VoiceCaptureCard() {
  const { user } = useAuth();
  const { record: recordRoute } = useCaptureRoute();
  const [supported, setSupported] = useState<boolean>(true);
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [interim, setInterim] = useState("");
  const [finalText, setFinalText] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const recRef = useRef<RecognitionLike | null>(null);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    setSupported(!!getRecognitionCtor());
    return () => {
      try { recRef.current?.abort(); } catch { /* noop */ }
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, []);

  const stopTimer = () => {
    if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
  };

  const start = () => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) { setSupported(false); return; }
    setFinalText("");
    setInterim("");
    setElapsed(0);
    const r = new Ctor();
    r.lang = (navigator.language || "en-US");
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e: any) => {
      let f = ""; let i = "";
      for (let k = e.resultIndex; k < e.results.length; k++) {
        const res = e.results[k];
        if (res.isFinal) f += res[0].transcript;
        else i += res[0].transcript;
      }
      if (f) setFinalText((prev) => (prev ? prev + " " : "") + f.trim());
      setInterim(i);
    };
    r.onerror = (e: any) => {
      const code = e?.error ?? "unknown";
      if (code === "no-speech" || code === "aborted") return; // benign
      toast.error({ title: "Voice capture stopped", description: code });
    };
    r.onend = () => {
      setRecording(false);
      setInterim("");
      stopTimer();
    };
    try {
      r.start();
      recRef.current = r;
      startedAtRef.current = Date.now();
      setRecording(true);
      tickRef.current = window.setInterval(() => {
        setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 500);
    } catch (err) {
      toast.fromError(err);
    }
  };

  const stop = () => {
    try { recRef.current?.stop(); } catch { /* noop */ }
  };

  const cancel = () => {
    try { recRef.current?.abort(); } catch { /* noop */ }
    setFinalText("");
    setInterim("");
    setRecording(false);
    stopTimer();
  };

  const save = async () => {
    if (!user) return;
    const text = (finalText + (interim ? " " + interim : "")).trim();
    if (!text) { toast.error({ title: "Nothing to save", description: "No transcript yet." }); return; }
    setSaving(true);
    try {
      const { data: note, error } = await supabase
        .from("notes")
        .insert({
          user_id: user.id,
          title: text.slice(0, 60),
          body: text,
          tags: ["voice"],
          metadata: {
            source: "voice",
            captured_at: new Date().toISOString(),
            duration_seconds: elapsed,
            locale: (navigator.language || "en-US"),
            transcribed_locally: true,
          },
        })
        .select("id")
        .single();
      if (error) throw error;

      await recordRoute({
        captureKind: "note",
        captureId: note.id,
        source: "voice",
        suggestedRoute: "memory",
        userAction: "routed",
        newStatus: "needs_review",
        auditEvent: "capture.voice_saved",
        payload: { duration_seconds: elapsed, length: text.length },
      });

      toast.success(vantaSay?.fileIngested ? vantaSay.fileIngested("Voice note") : { title: "Voice note saved" });
      setFinalText("");
      setInterim("");
      setElapsed(0);
    } catch (e) {
      toast.fromError(e);
    } finally {
      setSaving(false);
    }
  };

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  if (!supported) {
    return (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Voice capture</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 rounded-md border border-warn/30 bg-warn/5 p-2 text-[11.5px] text-warn">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>This browser doesn't support local speech recognition. Try Chrome, Edge, or Safari on iOS.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Voice capture</CardTitle>
          <span className={cn(
            "rounded-full px-2 py-0.5 text-[10px] ring-1",
            recording ? "bg-primary/10 text-primary ring-primary/30" : "bg-muted/20 text-muted-foreground ring-border/60",
          )}>
            {recording ? `recording · ${mm}:${ss}` : "idle"}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="min-h-[64px] rounded-md border border-border/40 bg-background/60 p-2 text-[12.5px]">
          {finalText && <span className="text-foreground">{finalText} </span>}
          {interim && <span className="text-muted-foreground italic">{interim}</span>}
          {!finalText && !interim && (
            <span className="text-muted-foreground/70">
              Tap the mic and start talking. Transcription happens on-device — nothing is sent anywhere until you save.
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {!recording ? (
            <Button onClick={start} className="h-9 gap-1.5" disabled={saving}>
              <Mic className="h-4 w-4" /> Start
            </Button>
          ) : (
            <Button onClick={stop} variant="secondary" className="h-9 gap-1.5">
              <Square className="h-3.5 w-3.5" /> Stop
            </Button>
          )}
          <Button
            onClick={save}
            variant="outline"
            className="h-9 gap-1.5"
            disabled={recording || saving || (!finalText && !interim)}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save to memory
          </Button>
          {(finalText || interim) && !recording && !saving && (
            <Button onClick={cancel} variant="ghost" className="h-9 text-[12px] text-muted-foreground">
              Discard
            </Button>
          )}
        </div>

        <p className="text-[10.5px] text-muted-foreground">
          Lands as a note tagged <span className="text-foreground">voice</span> with a capture-route receipt set to needs review. Triage from Memory like any other capture.
        </p>
      </CardContent>
    </Card>
  );
}
