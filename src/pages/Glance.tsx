// Glance — the wrist body of Vanta.
//
// One question: what deserves my attention right now? Zero or one card. Silence is
// a successful answer, not an empty state. Nothing consequential can be approved or
// executed from here — approval never travels between bodies.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Clock, Mic, PenLine, Smartphone } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MachineLabel } from "@/components/ui/instrument";
import { LoadingState, ErrorState } from "@/components/ui/state-views";
import { AftermathHint } from "@/components/aftermath/AftermathHint";
import { vantaToast } from "@/lib/vantaVoice";
import { POSTURE_LABEL, postureHoldsNoise } from "@/lib/awareness";
import { renderForms, URGENCY_LABEL } from "@/lib/deviceCompression";
import { hapticFor, playHaptic } from "@/lib/haptics";
import { detectDeviceClass, DEVICE_LABEL } from "@/lib/deviceClass";
import {
  COMMITMENT_PROMPT,
  SILENCE_LINE,
  WRIST_ACTION_COPY,
  looksLikeCommitment,
  wristActionsFor,
  type WristAction,
} from "@/lib/glance";
import { useGlance } from "@/hooks/useGlance";
import { useCaptureRoute } from "@/hooks/useCaptureRoute";
import { autoSendHealth, autoSendProof, bodyStrip } from "@/lib/wearableAutoSend";

function Proof({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-surface-elevated/70 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground ring-1 ring-border/50">
      {children}
    </span>
  );
}

export default function GlancePage() {
  const { user } = useAuth();
  const { withScope } = useScope();
  const navigate = useNavigate();
  const { record } = useCaptureRoute();
  const { decision, quietHours, posture, postureSource, body, loading, error, refresh } = useGlance();

  /* The wrist reads the same records as the desk, only shorter. */
  const feed = useMemo(
    () => autoSendHealth(body.readings, body.consent.activity === true),
    [body.readings, body.consent.activity],
  );
  const strip = useMemo(() => bodyStrip(body.readings, body.consent), [body.readings, body.consent]);

  const [busy, setBusy] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const buzzedRef = useRef<string | null>(null);

  const card = decision.card;
  const device = useMemo(() => detectDeviceClass(), []);

  const forms = useMemo(
    () =>
      card
        ? renderForms(
            { title: card.title, lines: card.detail ? [card.detail] : [] },
            card.urgency,
          )
        : null,
    [card],
  );

  /* One buzz per arriving card, never per render. */
  useEffect(() => {
    if (!card || buzzedRef.current === card.id) return;
    buzzedRef.current = card.id;
    playHaptic(hapticFor(card.urgency), {
      quietHours,
      postureHoldsNoise: postureHoldsNoise(posture ?? undefined),
    });
  }, [card, quietHours, posture]);

  const act = async (action: WristAction) => {
    if (!card || !user) return;
    if (action === "open_phone") {
      await supabase.from("audit_log").insert(
        withScope({
          user_id: user.id,
          entity_type: "nudge",
          entity_id: card.id,
          event: "glance.opened_on_phone",
          payload: { from_device: device, kind: card.kind },
        }),
      );
      navigate(card.href ?? "/");
      return;
    }

    setBusy(true);
    try {
      const status =
        action === "noted" ? "dismissed" : action === "done" ? "acted" : "seen";
      await supabase.from("nudges").update({ status }).eq("id", card.id);

      const returnAt =
        action === "later" ? new Date(Date.now() + 60 * 60 * 1000).toISOString() : null;

      await supabase.from("audit_log").insert(
        withScope({
          user_id: user.id,
          entity_type: "nudge",
          entity_id: card.id,
          event:
            action === "noted"
              ? "glance.noted"
              : action === "later"
                ? "glance.deferred"
                : "glance.marked_done",
          payload: {
            from_device: device,
            kind: card.kind,
            wrist_line: forms?.wrist ?? card.title,
            return_at: returnAt,
            approval: false,
          },
        }),
      );

      if (action === "done" && card.entity?.type === "commitment" && card.entity.id) {
        await supabase
          .from("commitments")
          .update({ status: "done" })
          .eq("id", card.entity.id);
      }

      vantaToast.success({
        title:
          action === "noted"
            ? "Noted"
            : action === "later"
              ? "It comes back in an hour"
              : "Closed",
        description: WRIST_ACTION_COPY[action].means,
      });
      refresh();
    } catch (e) {
      vantaToast.fromError(e);
    } finally {
      setBusy(false);
    }
  };

  const saveCapture = async () => {
    const t = text.trim();
    if (!user || !t) return;
    setSaving(true);
    try {
      const promise = looksLikeCommitment(t);
      const { data: note, error: err } = await supabase
        .from("notes")
        .insert(
          withScope({
            user_id: user.id,
            title: t.slice(0, 60),
            body: t,
            tags: ["wrist"],
            metadata: {
              source: "wrist",
              device_class: device,
              captured_at: new Date().toISOString(),
              looks_like_commitment: promise,
            },
          }),
        )
        .select("id")
        .single();
      if (err) throw err;

      await record({
        captureKind: "note",
        captureId: note.id,
        source: "wrist",
        suggestedRoute: promise ? "commitment" : "memory",
        userAction: "routed",
        newStatus: "needs_review",
        auditEvent: "capture.wrist_saved",
        payload: { device_class: device, looks_like_commitment: promise, length: t.length },
      });

      vantaToast.success({
        title: "Captured",
        description: promise ? COMMITMENT_PROMPT : "It's in Vanta, waiting for review.",
      });
      setText("");
      setCapturing(false);
    } catch (e) {
      vantaToast.fromError(e);
    } finally {
      setSaving(false);
    }
  };

  const actions = wristActionsFor(card);

  return (
    <div className="mx-auto max-w-[420px] px-3 pb-24 pt-4">
      <header className="mb-3 flex items-center gap-2">
        <Link
          to="/wearable-loop"
          aria-label="Back to the wearable loop"
          className="vanta-focus inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md ring-1 ring-border/60 hover:bg-surface-elevated"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-[15px] font-semibold tracking-tight">Glance</h1>
          <p className="text-[11px] text-muted-foreground">
            One thing, or nothing. {DEVICE_LABEL[device]}.
          </p>
        </div>
      </header>

      {/* Proof line — posture, connection, quiet hours. Never a claim without a source. */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Proof>{posture ? POSTURE_LABEL[posture] : "no posture"}{postureSource ? ` · ${postureSource}` : ""}</Proof>
        <Proof>{body.lastSyncAgo ? `watch heard ${body.lastSyncAgo}` : "watch hasn't checked in yet"}</Proof>
        {quietHours && <Proof>quiet hours</Proof>}
      </div>

      {loading ? (
        <LoadingState label="Reading what matters" />
      ) : error ? (
        <ErrorState error={error} doing="reading what matters" onRetry={refresh} />
      ) : card && forms ? (
        <section className="vanta-card p-4">
          <div className="flex items-center justify-between gap-2">
            <MachineLabel>{URGENCY_LABEL[card.urgency]}</MachineLabel>
            <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              {formatDistanceToNow(new Date(card.createdAt), { addSuffix: true })}
            </span>
          </div>
          <p className="mt-2 whitespace-pre-line text-[15px] font-medium leading-snug text-foreground">
            {forms.wrist}
          </p>
          <p className="mt-1.5 text-[11px] text-muted-foreground">Why now: {decision.reason}.</p>
          {decision.held > 0 && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {decision.held} other {decision.held === 1 ? "thing" : "things"} stayed in Today.
            </p>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            {actions.map((a) => (
              <Button
                key={a}
                variant={a === "open_phone" ? "default" : "outline"}
                size="sm"
                disabled={busy}
                onClick={() => act(a)}
                title={WRIST_ACTION_COPY[a].means}
                className="h-11 justify-start gap-1.5 text-[12px]"
              >
                {a === "noted" && <Check className="h-3.5 w-3.5" />}
                {a === "later" && <Clock className="h-3.5 w-3.5" />}
                {a === "done" && <Check className="h-3.5 w-3.5" />}
                {a === "open_phone" && <Smartphone className="h-3.5 w-3.5" />}
                {WRIST_ACTION_COPY[a].label}
              </Button>
            ))}
          </div>
          <p className="mt-2 text-[10.5px] leading-snug text-muted-foreground">
            None of these approve anything. Approval stays on your phone or desk.
          </p>
        </section>
      ) : (
        <section className="vanta-card p-4">
          <MachineLabel>Quiet</MachineLabel>
          <p className="mt-2 text-[15px] font-medium text-foreground">{SILENCE_LINE}</p>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            {decision.held > 0
              ? `${decision.held} ${decision.held === 1 ? "thing is" : "things are"} waiting in Today — none of them earned your wrist.`
              : "Nothing changed that needs interrupting you. This is a working answer, not an empty screen."}
          </p>
        </section>
      )}

      {/* Body strip — three lines, each a real reading or a stated gap. */}
      <section className="vanta-card mt-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <MachineLabel>Body</MachineLabel>
          <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            {autoSendProof(feed)}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {strip.map((row) => (
            <div key={row.key} className="vanta-inset px-2 py-1.5">
              <MachineLabel className="text-[9px] text-foreground/70">{row.label}</MachineLabel>
              <p className="mt-0.5 text-[13px] font-medium leading-none text-foreground">
                {row.value ?? "—"}
              </p>
              <p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                {row.note}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-foreground/90">
          {body.summary || "Nothing recorded from your watch yet."}
        </p>
      </section>

      {/* Capture — deliberate, drafts only. */}
      <section className="vanta-card mt-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <MachineLabel>Capture</MachineLabel>
          {!capturing && (
            <Button size="sm" variant="outline" className="h-9 gap-1.5 text-[12px]" onClick={() => setCapturing(true)}>
              <PenLine className="h-3.5 w-3.5" />
              Say something
            </Button>
          )}
        </div>
        {capturing ? (
          <div className="mt-2">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              autoFocus
              placeholder="Remind me to send Nikki the schedule."
              className="text-[13px]"
            />
            {looksLikeCommitment(text) && (
              <p className="mt-1.5 text-[11px] text-primary">{COMMITMENT_PROMPT}</p>
            )}
            <div className="mt-2 flex gap-2">
              <Button size="sm" className="h-10 flex-1 text-[12px]" disabled={saving || !text.trim()} onClick={saveCapture}>
                Keep it
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-10 text-[12px]"
                onClick={() => { setCapturing(false); setText(""); }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
            <Mic className="mt-[2px] h-3 w-3 shrink-0" />
            <span>
              Anything you keep here lands as a draft with the time and the device on it. It never
              runs, and it never becomes a promise without you saying so.
            </span>
          </p>
        )}
      </section>

      <div className="mt-3">
        <AftermathHint text="Noted and Remind later write a receipt · Open on phone lands on the same object · nothing here approves or executes" />
      </div>

      <p className={cn("mt-3 text-center font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground")}>
        <Link to="/watch" className="hover:text-foreground">Watch trends</Link>
        {" · "}
        <Link to="/wearables" className="hover:text-foreground">Wearables</Link>
      </p>
    </div>
  );
}
