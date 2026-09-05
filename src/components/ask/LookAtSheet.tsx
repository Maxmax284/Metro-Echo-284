// LookAtSheet — the deliberate camera seam.
//
// Echo looks at what you point it at, and only then. The camera opens because
// you opened it, one picture at a time, and the look happens because you
// pressed a question. Nothing is scanned in the background, nothing is filed,
// nothing executes.
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Image as ImageIcon, Loader2, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useStagedUpload } from "@/hooks/useStagedUpload";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { cn } from "@/lib/utils";
import {
  LOOK_INTENTS,
  LOOK_STATES,
  askAboutLook,
  isLookableFile,
  lookIntent,
  type LookIntentId,
} from "@/lib/lookAt";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Hand the answer on to the thread as a prefilled question. Never sends. */
  onAskAbout?: (question: string) => void;
};

type Phase = "idle" | "picked" | "uploading" | "looking" | "done" | "failed";

export function LookAtSheet({ open, onOpenChange, onAskAbout }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [intent, setIntent] = useState<LookIntentId | null>(null);
  const [answer, setAnswer] = useState<string>("");
  const [uncertain, setUncertain] = useState(false);
  const [failure, setFailure] = useState<string>("");
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const staged = useStagedUpload({ source: "conversation" });

  const hasCamera =
    typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches ?? false);

  // The preview URL belongs to this picture only; it dies with it.
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const reset = () => {
    setFile(null);
    setPhase("idle");
    setIntent(null);
    setAnswer("");
    setUncertain(false);
    setFailure("");
  };

  useEffect(() => { if (!open) reset(); }, [open]);

  const pick = (f: File | null | undefined) => {
    if (!f) return;
    if (!isLookableFile({ name: f.name, type: f.type })) {
      toast.error("That one is not a picture. Files go in through the paperclip.");
      return;
    }
    setFile(f);
    setPhase("picked");
    setAnswer("");
    setIntent(null);
    setFailure("");
  };

  const look = async (id: LookIntentId) => {
    if (!file) return;
    setIntent(id);
    setAnswer("");
    setFailure("");
    setPhase("uploading");
    try {
      staged.stage([file]);
      const settled = await staged.commitAll();
      const mine = settled.find((s) => s.file === file) ?? settled[settled.length - 1];
      const fileId = mine?.ingestedFileId;
      if (!fileId) throw new Error("The picture did not finish uploading.");

      setPhase("looking");
      const { data, error } = await supabase.functions.invoke("perception-look", {
        body: { ingested_file_id: fileId, intent: id },
      });
      if (error) throw error;
      const text = String((data as { answer?: string })?.answer ?? "").trim();
      if (!text) {
        setFailure(LOOK_STATES.nothing);
        setPhase("failed");
        return;
      }
      setAnswer(text);
      setUncertain(Boolean((data as { uncertain?: boolean })?.uncertain));
      setPhase("done");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      setFailure(msg && msg.startsWith("Didn't run") ? msg : "Didn't run. Echo could not look at that one.");
      setPhase("failed");
    } finally {
      staged.clearCompleted();
    }
  };

  const busy = phase === "uploading" || phase === "looking";
  const lookingLabel = useMemo(
    () => (phase === "uploading" ? "Sending the picture" : lookIntent(intent).looking),
    [phase, intent],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle>Show Echo something</SheetTitle>
        </SheetHeader>

        <p className="mt-1 text-[12px] text-muted-foreground">
          {phase === "idle"
            ? LOOK_STATES.idle
            : phase === "picked"
              ? LOOK_STATES.captured
              : busy
                ? "The camera is closed. Echo is only looking at the picture you took."
                : LOOK_STATES.done}
        </p>

        {/* Camera is an input method, not a live feed: one picture, then closed. */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => { pick(e.target.files?.[0]); if (cameraRef.current) cameraRef.current.value = ""; }}
        />
        <input
          ref={libraryRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { pick(e.target.files?.[0]); if (libraryRef.current) libraryRef.current.value = ""; }}
        />

        {!file && (
          <div className="mt-4 grid gap-2">
            {hasCamera && (
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="flex items-center gap-2 rounded-[4px] border border-border/60 bg-surface-elevated/60 px-3 py-2.5 text-[14px] text-foreground/90 transition-colors hover:bg-surface-elevated"
              >
                <Camera className="h-4 w-4 text-primary/80" /> Open the camera
              </button>
            )}
            <button
              type="button"
              onClick={() => libraryRef.current?.click()}
              className="flex items-center gap-2 rounded-[4px] border border-border/60 bg-surface-elevated/60 px-3 py-2.5 text-[14px] text-foreground/90 transition-colors hover:bg-surface-elevated"
            >
              <ImageIcon className="h-4 w-4 text-primary/80" /> Pick a picture
            </button>
          </div>
        )}

        {file && (
          <div className="mt-4 space-y-3">
            <div className="relative overflow-hidden rounded-[4px] border border-border/60 bg-surface-elevated/40">
              {preview && (
                <img
                  src={preview}
                  alt={`The picture you showed Echo: ${file.name}`}
                  className={cn("max-h-56 w-full object-contain transition-opacity", busy && "opacity-70")}
                />
              )}
              {!busy && (
                <button
                  type="button"
                  onClick={reset}
                  aria-label="Drop this picture"
                  className="absolute right-1.5 top-1.5 rounded-full bg-background/85 p-1 text-muted-foreground ring-1 ring-border/60 hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              {busy && (
                <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-background/85 px-2.5 py-1.5 text-[12px] text-foreground/90">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  {lookingLabel}
                  <span aria-hidden className="vanta-caret ml-0.5 motion-reduce:animate-none" />
                </div>
              )}
            </div>

            {!busy && (
              <div className="space-y-1.5">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  {answer ? "Ask something else about it" : "What should Echo look for?"}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {LOOK_INTENTS.map((i) => (
                    <button
                      key={i.id}
                      type="button"
                      onClick={() => void look(i.id)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[12px] transition-colors",
                        intent === i.id
                          ? "border-primary/40 bg-primary/10 text-foreground"
                          : "border-border/60 bg-surface-elevated/60 text-foreground/85 hover:bg-surface-elevated",
                      )}
                    >
                      {i.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {phase === "failed" && (
              <div className="rounded-[4px] border border-warn/40 bg-warn/5 px-3 py-2 text-[13px] text-foreground/90">
                <p>{failure}</p>
                <p className="mt-1 text-[12px] text-muted-foreground">Nothing else changed. Try another picture, or a different question.</p>
              </div>
            )}

            {phase === "done" && answer && (
              <div className="space-y-2 rounded-[4px] border border-border/60 bg-surface-elevated/40 px-3 py-2.5">
                <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-foreground/95">{answer}</p>
                <p className="text-[11px] text-muted-foreground">
                  {uncertain
                    ? "Echo is not certain about this one — it said what it could see."
                    : "This is what Echo saw in the picture you showed it."}{" "}
                  The picture is kept. Nothing was filed.
                </p>
                {onAskAbout && (
                  <button
                    type="button"
                    onClick={() => {
                      onAskAbout(askAboutLook(intent ?? "identify", file.name));
                      onOpenChange(false);
                    }}
                    className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[12px] text-foreground"
                  >
                    Ask about it
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
