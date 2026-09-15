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
import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  Mic, Square, PenLine, Radio, Check, Loader2, Link2, FileText, Pause, Play, Bookmark, Search, X,
} from "lucide-react";
import {
  MODE_WORDS, CAPTURE_SECTIONS, SECTION_WORDS, DIARIZATION_NOTE, RECORDING_NOTICE,
  captureTitle, captureVerdict, cleanTranscript, extractSignals, followUpProposals,
  locateEvidence, matteredCount, mergeLayers, newLayers, proposalOffer, pushSegment,
  searchSegments, segmentsText, stampAt, titleSuggestions, toggleBookmark,
  type CaptureMode, type CaptureSection, type FollowUpProposal, type TranscriptSegment,
  type WhatMattered,
} from "@/lib/captureLayers";

const NOTICE_KEY = "metroecho.capture.notice.seen";

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

export function CaptureWorkspace() {
  const { user } = useAuth();
  const { scopeFields } = useScope();
  const { record: recordRoute } = useCaptureRoute();
  const stage = useStageAction();
  const { active: activeThread } = useAskThreads();

  const [mode, setMode] = useState<CaptureMode>("typed");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [noticeSeen, setNoticeSeen] = useState(true);

  const tickRef = useRef<number | null>(null);
  const startedRef = useRef(0);
  const baseRef = useRef(0);
  const elapsedRef = useRef(0);
  elapsedRef.current = elapsed;

  // What was found after a capture stopped. Null until the person stops.
  const [mattered, setMattered] = useState<WhatMattered | null>(null);
  const [savedNoteId, setSavedNoteId] = useState<string | null>(null);
  const [staged, setStaged] = useState<string[]>([]);
  const [linked, setLinked] = useState(false);
  const [section, setSection] = useState<CaptureSection>("summary");
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [focusSeg, setFocusSeg] = useState<number | null>(null);

  useEffect(() => {
    try { setNoticeSeen(window.localStorage.getItem(NOTICE_KEY) === "1"); } catch { /* noop */ }
  }, []);

  const dictation = useDictation({
    onFinal: (phrase) => {
      setText((prev) => (prev ? `${prev} ${phrase}` : phrase));
      // Every finalized phrase becomes a stamped piece of evidence.
      setSegments((prev) => pushSegment(prev, { t: elapsedRef.current, text: phrase, speaker: null }));
    },
  });
  const recording = dictation.listening;

  const startTimer = () => {
    startedRef.current = Date.now();
    tickRef.current = window.setInterval(
      () => setElapsed(baseRef.current + Math.floor((Date.now() - startedRef.current) / 1000)),
      500,
    );
  };
  const stopTimer = () => {
    if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
    baseRef.current = elapsedRef.current;
  };

  const startRecording = () => {
    setMattered(null);
    setSavedNoteId(null);
    setStaged([]);
    setLinked(false);
    setSegments([]);
    setPaused(false);
    baseRef.current = 0;
    setElapsed(0);
    elapsedRef.current = 0;
    dictation.start();
    startTimer();
    if (!noticeSeen) {
      try { window.localStorage.setItem(NOTICE_KEY, "1"); } catch { /* noop */ }
      setNoticeSeen(true);
    }
  };

  const pauseRecording = () => {
    dictation.stop();
    stopTimer();
    setPaused(true);
  };

  const resumeRecording = () => {
    setPaused(false);
    dictation.start();
    startTimer();
  };

  const stopRecording = () => {
    dictation.stop();
    stopTimer();
    setPaused(false);
    // Interpretation happens here — after the recording stops, never during it.
    if (mode === "conversation") {
      const words = (text + (dictation.interim ? ` ${dictation.interim}` : "")).trim();
      setMattered(extractSignals(words));
      setSection("summary");
    }
  };

  /** Mark this moment while recording. Words are untouched either way. */
  const markMoment = () => {
    setSegments((prev) => {
      if (!prev.length) return pushSegment(prev, { t: elapsedRef.current, text: "(marked)", bookmark: true });
      return toggleBookmark(prev, prev.length - 1);
    });
  };

  const proposals = useMemo<FollowUpProposal[]>(() => followUpProposals(mattered), [mattered]);
  const offer = proposalOffer(proposals);

  const raw = (text + (recording && dictation.interim ? ` ${dictation.interim}` : "")).trim();
  const clean = useMemo(() => (mode === "typed" ? raw : cleanTranscript(raw)), [raw, mode]);
  const suggestions = useMemo(
    () => (mode === "conversation" && raw ? titleSuggestions(raw, mode) : []),
    [raw, mode],
  );
  const findHits = useMemo(() => searchSegments(segments, findQuery), [segments, findQuery]);

  /** Tap an extracted line, land on the moment it came from. */
  const jumpToEvidence = (line: string) => {
    const hit = locateEvidence(segments, line);
    if (!hit) {
      toast.error({
        title: "No transcript moment for that line",
        description: "It isn't tied to a recorded piece of this transcript.",
      });
      return;
    }
    setSection("transcript");
    setFocusSeg(hit.index);
    window.setTimeout(
      () => document.getElementById(`seg-${hit.index}`)?.scrollIntoView({ behavior: "smooth", block: "center" }),
      40,
    );
  };

  function MatteredList({ label, items }: { label: string; items: string[] }) {
    if (!items.length) return null;
    return (
      <div className="space-y-1">
        <Stamp>{label}</Stamp>
        <ul className="space-y-0.5">
          {items.map((t, i) => {
            const hit = locateEvidence(segments, t);
            return (
              <li key={i} className="border-l border-border/60 pl-2 text-[12.5px] leading-relaxed text-foreground/90">
                {hit ? (
                  <button
                    type="button"
                    onClick={() => jumpToEvidence(t)}
                    className="min-h-[36px] text-left hover:text-foreground"
                  >
                    {t}{" "}
                    <span className="font-mono text-[10px] text-primary/80">{stampAt(hit.t)}</span>
                  </button>
                ) : (
                  <span>{t}</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

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
          segments: segments.length ? segments : undefined,
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
        payload: {
          mode, length: raw.length, duration_seconds: elapsed,
          found: matteredCount(found), segments: segments.length,
        },
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
    try {
      await stage({
        title: p.text.slice(0, 120),
        description: `Pulled out of a captured conversation. Nothing has run.`,
        risk: "low_reversible",
        status: "proposed",
        source: savedNoteId ? `note:${savedNoteId}` : "capture",
        payload: { from_capture: savedNoteId, layer: p.from, destination: p.destination },
      });
      setStaged((prev) => [...prev, p.id]);
      toast.success({ title: "Waiting on your yes in Work", description: "Nothing has happened yet." });
    } catch (e) {
      toast.fromError(e);
    }
  };

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const marks = segments.map((s, i) => ({ i, s })).filter((x) => x.s.bookmark);

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
              disabled={recording || paused}
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

      {/* First-use notice only, and only where it belongs: before recording other
          people. Never a modal, never repeated. */}
      {mode === "conversation" && !noticeSeen && (
        <p className="rounded-[3px] border border-border/60 bg-muted/20 p-2 text-[11.5px] leading-relaxed text-muted-foreground">
          {RECORDING_NOTICE}
        </p>
      )}

      {/* The page. Paper, a margin rule, a tape tab and a machine stamp. */}
      <div className="relative rounded-[3px] border border-border/60 bg-surface-elevated/25 p-3">
        <span className="absolute -top-2 left-4 rounded-[2px] bg-muted/60 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground ring-1 ring-border/50">
          {mode === "conversation" ? "conversation" : mode === "dictated" ? "dictation" : "note"}
        </span>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em]",
              recording ? "text-primary" : paused ? "text-warn" : "text-muted-foreground",
            )}
          >
            {recording && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
            {recording
              ? `recording · ${mm}:${ss}`
              : paused
                ? `paused · ${mm}:${ss}`
                : savedNoteId ? "saved" : "not recording"}
          </span>
          <Waveform live={recording} />
        </div>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional — Echo uses your first line)"
          className="mb-2 h-9 rounded-[3px] text-[13px]"
        />
        {suggestions.length > 0 && !title.trim() && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setTitle(s)}
                className="rounded-[3px] border border-border/60 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="border-l-2 border-border/50 pl-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            readOnly={mode !== "typed" && (recording || paused)}
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
        {mode === "conversation" && (recording || paused) && (
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{DIARIZATION_NOTE}</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {mode !== "typed" && (
            recording || paused ? (
              <>
                {recording ? (
                  <Button variant="outline" className="h-9 gap-1.5" onClick={pauseRecording}>
                    <Pause className="h-3.5 w-3.5" /> Pause
                  </Button>
                ) : (
                  <Button variant="outline" className="h-9 gap-1.5" onClick={resumeRecording}>
                    <Play className="h-3.5 w-3.5" /> Resume
                  </Button>
                )}
                <Button variant="secondary" className="h-9 gap-1.5" onClick={stopRecording}>
                  <Square className="h-3.5 w-3.5" /> Stop
                </Button>
                {recording && (
                  <Button variant="ghost" className="h-9 gap-1.5 text-[12px]" onClick={markMoment}>
                    <Bookmark className="h-3.5 w-3.5" /> Mark this moment
                  </Button>
                )}
              </>
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
            disabled={recording || paused || saving || !raw}
            onClick={() => void save()}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save as note
          </Button>
          {raw && !recording && !paused && !saving && (
            <button
              type="button"
              onClick={() => {
                setText(""); setTitle(""); setMattered(null); setSavedNoteId(null); setSegments([]);
              }}
              className="min-h-[40px] px-1 text-[12px] text-muted-foreground hover:text-foreground"
            >
              Discard
            </button>
          )}
        </div>
      </div>

      {/* What Echo believes mattered, in sections of this note — not new rooms.
          Recorded alongside the evidence, never instead of it. */}
      {mattered && (
        <div className="space-y-3 rounded-[3px] border border-border/60 bg-surface-elevated/20 p-3">
          <p className="text-[13px] text-foreground/95">{captureVerdict(mattered)}</p>

          <div className="flex flex-wrap gap-1">
            {CAPTURE_SECTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSection(s)}
                className={cn(
                  "min-h-[36px] rounded-[3px] border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors",
                  section === s
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border/50 text-muted-foreground hover:text-foreground",
                )}
              >
                {SECTION_WORDS[s]}
              </button>
            ))}
          </div>

          {section === "summary" && (
            <div className="space-y-3">
              <MatteredList label="Decided" items={mattered.decisions} />
              <MatteredList label="Promised" items={mattered.commitments} />
              <MatteredList label="Follow up" items={mattered.followUps} />
              <MatteredList label="Still open" items={mattered.questions} />
              <MatteredList label="Possible next steps" items={mattered.possibleActions} />
              {marks.length > 0 && (
                <div className="space-y-1">
                  <Stamp>Moments you marked</Stamp>
                  {marks.map((m) => (
                    <button
                      key={m.i}
                      type="button"
                      onClick={() => { setSection("transcript"); setFocusSeg(m.i); }}
                      className="block min-h-[36px] w-full truncate border-l border-primary/40 pl-2 text-left text-[12.5px] text-foreground/90"
                    >
                      <span className="font-mono text-[10px] text-primary/80">{stampAt(m.s.t)}</span> {m.s.text}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {section === "transcript" && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                {findOpen ? (
                  <>
                    <div className="relative min-w-0 flex-1">
                      <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                      <input
                        value={findQuery}
                        onChange={(e) => setFindQuery(e.target.value)}
                        placeholder="Search this transcript"
                        className="h-9 w-full rounded-[3px] border border-border/60 bg-background/70 pl-7 pr-2 text-[12px] outline-none focus:border-primary/40"
                      />
                    </div>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {findQuery.trim() ? `${findHits.length} found` : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => { setFindOpen(false); setFindQuery(""); }}
                      className="min-h-[36px] px-1 text-muted-foreground hover:text-foreground"
                      aria-label="Close transcript search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setFindOpen(true)}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-[3px] border border-border/60 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    <Search className="h-3 w-3" /> Search transcript
                  </button>
                )}
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">{DIARIZATION_NOTE}</p>
              {segments.length === 0 ? (
                <p className="text-[12.5px] text-muted-foreground">
                  No stamped pieces for this capture — the words are kept as one block below.
                </p>
              ) : (
                <ul className="space-y-1">
                  {segments.map((s, i) => {
                    const dim = !!findQuery.trim() && !findHits.includes(i);
                    return (
                      <li
                        key={i}
                        id={`seg-${i}`}
                        className={cn(
                          "flex gap-2 border-l pl-2 text-[12.5px] leading-relaxed",
                          focusSeg === i ? "border-primary bg-primary/5" : "border-border/50",
                          dim && "opacity-40",
                        )}
                      >
                        <span className="shrink-0 pt-0.5 font-mono text-[10px] text-muted-foreground">{stampAt(s.t)}</span>
                        <span className="min-w-0 text-foreground/90">
                          {s.bookmark && <Bookmark className="mr-1 inline h-3 w-3 text-primary" />}
                          {s.text}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="whitespace-pre-wrap border-t border-border/50 pt-2 text-[12.5px] leading-relaxed text-foreground/80">
                {segments.length ? segmentsText(segments) : raw}
              </p>
            </div>
          )}

          {section === "decisions" && (
            <MatteredList label="Decided" items={mattered.decisions} />
          )}
          {section === "unresolved" && (
            <MatteredList label="Still open" items={mattered.questions} />
          )}

          {(section === "followups" || section === "summary") && offer && (
            <div className="space-y-2 border-t border-border/50 pt-2">
              <p className="text-[12px] text-muted-foreground">{offer}</p>
              <div className="space-y-1.5">
                {proposals.map((p) => {
                  const hit = locateEvidence(segments, p.text);
                  return (
                    <div key={p.id} className="flex items-start gap-2">
                      <span className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-foreground/90">
                        {p.text}
                        {hit && (
                          <button
                            type="button"
                            onClick={() => jumpToEvidence(p.text)}
                            className="ml-1 font-mono text-[10px] text-primary/80"
                          >
                            {stampAt(hit.t)}
                          </button>
                        )}
                      </span>
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
                  );
                })}
              </div>
            </div>
          )}
          {section === "followups" && !offer && (
            <p className="text-[12.5px] text-muted-foreground">Nothing in this capture needs follow-up.</p>
          )}

          {(section === "connections" || section === "summary") && (
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
          )}
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Capture first, interpret second. Your original words are stored untouched — the readable
        version and anything Echo pulled out sit beside them, never on top of them.
      </p>
    </div>
  );
}
