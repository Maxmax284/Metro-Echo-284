// CaptureWorkspace — the capture desk. Calmer than Ask on purpose: paper, tape,
// a margin rule and machine timestamps rather than painted walls.
//
// Three entry modes, and the difference is stated in the interface itself:
//   Type                 — you write it. Echo says nothing.
//   Dictate              — you talk, Echo writes it down. Echo still says nothing.
//   Capture conversation — Echo stays quiet and records, then structures it AFTER
//                          you stop. This is the only mode that interprets.
//
// The mic in Ask talks TO Echo. The mic here does not: it only fills the page.
//
// LAW: CAPTURE FIRST. INTERPRET SECOND. NEVER REWRITE THE ORIGINAL EVIDENCE.
// LAW: EXTRACTION IS NOT EXECUTION — follow-ups are offered, never created.
import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import { useCaptureRoute } from "@/hooks/useCaptureRoute";
import { useDictation } from "@/hooks/useDictation";
import { useStageAction } from "@/hooks/useStageAction";
import { useAskThreads } from "@/providers/AskThreadProvider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { cn } from "@/lib/utils";
import { Mic, Square, PenLine, Radio, Check, Loader2, Link2, FileText } from "lucide-react";
import {
  MODE_WORDS, captureTitle, captureVerdict, cleanTranscript, extractSignals,
  followUpProposals, matteredCount, newLayers, mergeLayers, proposalOffer,
  type CaptureMode, type FollowUpProposal, type WhatMattered,
} from "@/lib/captureLayers";

/** Waveform. Only ever on screen while something is actually being recorded. */
function Waveform({ live }: { live: boolean }) {
  if (!live) return null;
  return (
    <div className="flex h-6 items-end gap-[3px]" aria-hidden>
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => (
        <span
          key={i}
          className="w-[3px] rounded-sm bg-primary/70 motion-breath motion-reduce:animate-none"
          style={{ height: `${6 + ((i * 7) % 17)}px`, animationDelay: `${i * 70}ms` }}
        />
      ))}
    </div>
  );
}

function Stamp({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{children}</span>;
}

function MatteredList({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="space-y-1">
      <Stamp>{label}</Stamp>
      <ul className="space-y-0.5">
        {items.map((t, i) => (
          <li key={i} className="border-l border-border/60 pl-2 text-[12.5px] leading-relaxed text-foreground/90">{t}</li>
        ))}
      </ul>
    </div>
  );
}

export function CaptureWorkspace() {
  const { user } = useAuth();
  const { scopeFields } = useScope();
  const { record: recordRoute } = useCaptureRoute();
  const { stage } = useStageAction();
  const { active: activeThread } = useAskThreads();

  const [mode, setMode] = useState<CaptureMode>("typed");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const tickRef = useRef<number | null>(null);
  const startedRef = useRef(0);

  // What was found after a capture stopped. Null until the person stops.
  const [mattered, setMattered] = useState<WhatMattered | null>(null);
  const [savedNoteId, setSavedNoteId] = useState<string | null>(null);
  const [staged, setStaged] = useState<string[]>([]);
  const [linked, setLinked] = useState(false);

  const dictation = useDictation({
    onFinal: (phrase) => setText((prev) => (prev ? `${prev} ${phrase}` : phrase)),
  });
  const recording = dictation.listening;

  const startTimer = () => {
    startedRef.current = Date.now();
    setElapsed(0);
    tickRef.current = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - startedRef.current) / 1000)),
      500,
    );
  };
  const stopTimer = () => {
    if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
  };

  const startRecording = () => {
    setMattered(null);
    setSavedNoteId(null);
    setStaged([]);
    setLinked(false);
    dictation.start();
    startTimer();
  };

  const stopRecording = () => {
    dictation.stop();
    stopTimer();
    // Interpretation happens here — after the recording stops, never during it.
    if (mode === "conversation") {
      const words = (text + (dictation.interim ? ` ${dictation.interim}` : "")).trim();
      setMattered(extractSignals(words));
    }
  };

  const proposals = useMemo<FollowUpProposal[]>(() => followUpProposals(mattered), [mattered]);
  const offer = proposalOffer(proposals);

  const raw = (text + (recording && dictation.interim ? ` ${dictation.interim}` : "")).trim();
  const clean = useMemo(() => (mode === "typed" ? raw : cleanTranscript(raw)), [raw, mode]);

  const save = async () => {
    if (!user || !raw) {
      toast.error({ title: "Nothing to save yet", description: "Write, dictate, or record something first." });
      return;
    }
    setSaving(true);
    try {
      const found = mode === "conversation" ? (mattered ?? extractSignals(raw)) : null;
      const layers = mergeLayers(
        newLayers({
          text: raw,
          mode,
          captured_at: new Date().toISOString(),
          duration_seconds: mode === "typed" ? undefined : elapsed,
          locale: typeof navigator === "undefined" ? undefined : navigator.language,
          transcribed_locally: mode !== "typed",
          recording_ref: null,
        }),
        {
          clean: mode === "typed" ? null : { text: clean, source: "rules", at: new Date().toISOString() },
          mattered: found,
          connections: activeThread
            ? { threadId: activeThread.id, threadLabel: activeThread.title ?? "Ask thread" }
            : {},
        },
      );

      const { data: note, error } = await supabase
        .from("notes")
        .insert({
          user_id: user.id,
          ...scopeFields(),
          title: (title.trim() || captureTitle(raw, mode)).slice(0, 120),
          // The body is the readable layer; the evidence stays in metadata.layers.
          body: clean || raw,
          tags: [mode === "conversation" ? "conversation" : mode === "dictated" ? "voice" : "note"],
          metadata: {
            source: mode === "typed" ? "typed" : mode === "dictated" ? "voice" : "conversation",
            captured_at: layers.raw.captured_at,
            layers,
          },
        } as never)
        .select("id")
        .single();
      if (error) throw error;

      await recordRoute({
        captureKind: "note",
        captureId: note.id,
        source: mode === "conversation" ? "conversation" : mode === "dictated" ? "voice" : "typed",
        suggestedRoute: "memory",
        userAction: "routed",
        newStatus: "needs_review",
        auditEvent: "capture.note_saved",
        payload: { mode, length: raw.length, duration_seconds: elapsed, found: matteredCount(found) },
      });

      setSavedNoteId(note.id);
      if (mode === "conversation") setMattered(found);
      toast.success({ title: captureVerdict(found) });
      if (mode !== "conversation") {
        setText("");
        setTitle("");
      }
    } catch (e) {
      toast.fromError(e);
    } finally {
      setSaving(false);
    }
  };

  /** A proposal only ever becomes a STAGED item awaiting the normal approval. */
  const addFollowUp = async (p: FollowUpProposal) => {
    const res = await stage({
      title: p.text.slice(0, 120),
      kind: p.destination === "action" ? "task" : "commitment",
      summary: `From a captured conversation${savedNoteId ? "" : " (unsaved)"}.`,
      payload: { from_capture: savedNoteId, layer: p.from },
    } as never);
    if (res !== false) {
      setStaged((prev) => [...prev, p.id]);
      toast.success({ title: "Waiting on your yes in Work", description: "Nothing has happened yet." });
    }
  };

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="space-y-3">
      {/* Mode strip. The words say what each mic actually does. */}
      <div className="flex flex-wrap gap-1.5">
        {(["typed", "dictated", "conversation"] as CaptureMode[]).map((m) => {
          const Icon = m === "typed" ? PenLine : m === "dictated" ? Mic : Radio;
          const on = mode === m;
          return (
            <button
              key={m}
              type="button"
              disabled={recording}
              onClick={() => { setMode(m); setMattered(null); setSavedNoteId(null); }}
              className={cn(
                "inline-flex min-h-[40px] items-center gap-1.5 rounded-[3px] border px-2.5 py-1 text-[12px] transition-colors disabled:opacity-50",
                on
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "border-border/60 bg-surface-elevated/40 text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {MODE_WORDS[m].label}
            </button>
          );
        })}
      </div>
      <p className="text-[11.5px] leading-relaxed text-muted-foreground">{MODE_WORDS[mode].help}</p>

      {/* The page. Paper, a margin rule, a tape tab and a machine stamp. */}
      <div className="relative rounded-[3px] border border-border/60 bg-surface-elevated/25 p-3">
        <span className="absolute -top-2 left-4 rounded-[2px] bg-muted/60 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground ring-1 ring-border/50">
          {mode === "conversation" ? "conversation" : mode === "dictated" ? "dictation" : "note"}
        </span>
        <div className="mb-2 flex items-center justify-between gap-2">
          <Stamp>{recording ? `recording · ${mm}:${ss}` : savedNoteId ? "saved" : "not saved"}</Stamp>
          <Waveform live={recording} />
        </div>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional — Echo uses your first line)"
          className="mb-2 h-9 rounded-[3px] text-[13px]"
        />
        <div className="border-l-2 border-border/50 pl-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            readOnly={mode !== "typed" && recording}
            placeholder={
              mode === "typed"
                ? "Write the note."
                : mode === "dictated"
                  ? "Tap Start and talk. Echo writes it down and says nothing back."
                  : "Tap Capture conversation. Echo stays quiet, then structures it after you stop."
            }
            className="min-h-[132px] resize-y rounded-[3px] bg-transparent text-[13.5px] leading-relaxed"
          />
          {recording && dictation.interim && (
            <p className="px-1 pt-1 text-[12.5px] italic text-muted-foreground">{dictation.interim}</p>
          )}
        </div>
        {dictation.error && <p className="mt-2 text-[11.5px] text-warn">{dictation.error}</p>}
        {!dictation.supported && mode !== "typed" && (
          <p className="mt-2 text-[11.5px] text-warn">
            This browser can't listen on-device. Type the note instead, or try Chrome, Edge, or Safari.
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {mode !== "typed" && (
            recording ? (
              <Button variant="secondary" className="h-9 gap-1.5" onClick={stopRecording}>
                <Square className="h-3.5 w-3.5" /> Stop
              </Button>
            ) : (
              <Button className="h-9 gap-1.5" disabled={!dictation.supported || saving} onClick={startRecording}>
                <Mic className="h-4 w-4" />
                {mode === "conversation" ? "Capture conversation" : "Start dictating"}
              </Button>
            )
          )}
          <Button
            variant="outline"
            className="h-9 gap-1.5"
            disabled={recording || saving || !raw}
            onClick={() => void save()}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save as note
          </Button>
          {raw && !recording && !saving && (
            <button
              type="button"
              onClick={() => { setText(""); setTitle(""); setMattered(null); setSavedNoteId(null); }}
              className="min-h-[40px] px-1 text-[12px] text-muted-foreground hover:text-foreground"
            >
              Discard
            </button>
          )}
        </div>
      </div>

      {/* What Echo believes mattered. Recorded alongside the evidence, never
          instead of it. */}
      {mattered && (
        <div className="space-y-3 rounded-[3px] border border-border/60 bg-surface-elevated/20 p-3">
          <p className="text-[13px] text-foreground/95">{captureVerdict(mattered)}</p>
          <MatteredList label="Decided" items={mattered.decisions} />
          <MatteredList label="Promised" items={mattered.commitments} />
          <MatteredList label="Follow up" items={mattered.followUps} />
          <MatteredList label="Still open" items={mattered.questions} />
          <MatteredList label="Possible next steps" items={mattered.possibleActions} />

          {offer && (
            <div className="space-y-2 border-t border-border/50 pt-2">
              <p className="text-[12px] text-muted-foreground">{offer}</p>
              <div className="space-y-1.5">
                {proposals.map((p) => (
                  <div key={p.id} className="flex items-start gap-2">
                    <span className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-foreground/90">{p.text}</span>
                    {staged.includes(p.id) ? (
                      <Stamp>waiting on your yes</Stamp>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 shrink-0 text-[11.5px]"
                        onClick={() => void addFollowUp(p)}
                      >
                        Add to Work
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-2">
            {activeThread && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1.5 text-[11.5px]"
                disabled={linked || !savedNoteId}
                onClick={() => setLinked(true)}
              >
                <Link2 className="h-3 w-3" />
                {linked ? `Linked to ${activeThread.title ?? "this situation"}` : "Link to this situation"}
              </Button>
            )}
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <FileText className="h-3 w-3" /> The raw transcript is kept with the note.
            </span>
          </div>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Capture first, interpret second. Your original words are stored untouched — the readable
        version and anything Echo pulled out sit beside them, never on top of them.
      </p>
    </div>
  );
}
