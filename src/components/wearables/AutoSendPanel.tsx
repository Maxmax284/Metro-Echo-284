// AutoSendPanel — the hands-off feed, set up once and then left alone.
//
// This is the only surface that turns the private ingest link into something a
// phone can actually be pointed at. It mints or rotates the link, shows the
// exact body an export must post, and — the part that matters — tells you
// honestly whether readings are still landing. Nothing here routes, approves or
// runs anything; it stores context.
import { useMemo, useState } from "react";
import { Check, Copy, Loader2, RadioTower, RefreshCw, RotateCw, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { MOTION_FOCUS } from "@/lib/motion";
import { MachineLabel, MachineText } from "@/components/ui/instrument";
import { LoadingState, ErrorState } from "@/components/ui/state-views";
import { AftermathHint } from "@/components/aftermath/AftermathHint";
import { vantaToast } from "@/lib/vantaVoice";
import { useWearableLoop } from "@/hooks/useWearableLoop";
import {
  autoSendHealth,
  ingestBodyTemplate,
  HEALTH_PUSH_TRUTH,
  SETUP_RECIPES,
  WATCH_RECIPES,
  UNLISTED_WATCH_LINE,
  type AutoSendState,
} from "@/lib/wearableAutoSend";

const btnClass = cn(
  "inline-flex min-h-[32px] items-center gap-1 rounded-[2px] border border-border/60 px-2",
  "text-[10.5px] text-foreground/85 hover:border-primary/40 hover:text-foreground disabled:opacity-60",
  MOTION_FOCUS,
);

const DOT: Record<AutoSendState, string> = {
  live: "bg-primary",
  late: "bg-amber-400",
  never: "bg-muted-foreground/50",
};

export function AutoSendPanel() {
  const { loop, loading, error, refresh } = useWearableLoop();
  const [link, setLink] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [platform, setPlatform] = useState<"iphone" | "android">("iphone");

  const health = useMemo(
    () => autoSendHealth(loop.readings, loop.consent.activity === true),
    [loop.readings, loop.consent.activity],
  );

  const recipe = SETUP_RECIPES.find((r) => r.platform === platform)!;

  const getLink = async (rotate = false) => {
    setWorking(true);
    try {
      const { data, error: err } = await supabase.functions.invoke("wearable-link", {
        body: { rotate },
      });
      if (err) throw err;
      if ((data as any)?.error) throw new Error(String((data as any).error));
      const full = `${(data as any).url}?token=${(data as any).token}`;
      setLink(full);
      if (rotate) {
        vantaToast.info({
          title: "New link made",
          description: "The old one stopped working right away. Paste this one into your export.",
        });
      }
    } catch (e) {
      vantaToast.error({
        title: "The link wasn't made",
        description: e instanceof Error ? e.message : "Try again in a moment.",
      });
    } finally {
      setWorking(false);
    }
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard?.writeText(text);
      vantaToast.success({ title: `${what} copied`, description: "Paste it into your phone." });
    } catch {
      vantaToast.error({ title: "Copy didn't work", description: "Select it and copy by hand." });
    }
  };

  if (loading) return <LoadingState label="Checking the feed…" />;
  if (error) return <ErrorState error={error} doing="checking the feed" onRetry={refresh} />;

  return (
    <section className="vanta-card p-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
          <RadioTower className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold tracking-tight">Send it without asking me</h2>
          <p className="text-[12px] text-muted-foreground">
            Apple Health or Health Connect, pushed by your phone on a schedule. Nothing typed by
            hand, and Echo never reaches out to a device.
          </p>
        </div>
      </div>

      {/* Is it actually working? */}
      <div className="mt-3 vanta-inset px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT[health.state])} />
          <MachineLabel className="text-foreground/70">Automatic feed</MachineLabel>
          <MachineText className="text-[10px] text-muted-foreground">{health.label}</MachineText>
          <button type="button" onClick={refresh} className={cn(btnClass, "ml-auto")}>
            <RefreshCw className="h-3.5 w-3.5" />
            Check the feed
          </button>
        </div>
        <p className="mt-1 text-[11.5px] leading-snug text-foreground/90">{health.detail}</p>
      </div>

      {/* The private link */}
      <div className="mt-2 vanta-inset px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <MachineLabel className="text-foreground/70">Your private link</MachineLabel>
          <button
            type="button"
            onClick={() => void getLink(false)}
            disabled={working}
            className={cn(btnClass, "ml-auto")}
          >
            {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
            {link ? "Show again" : "Get my link"}
          </button>
          {link ? (
            <button type="button" onClick={() => void getLink(true)} disabled={working} className={btnClass}>
              <RotateCw className="h-3.5 w-3.5" />
              Replace it
            </button>
          ) : null}
        </div>
        {link ? (
          <button
            type="button"
            onClick={() => void copy(link, "Link")}
            className={cn(
              "mt-2 block w-full break-all rounded-[2px] border border-border/60 bg-background/40 px-2 py-1.5 text-left font-mono text-[10.5px] text-foreground/80",
              MOTION_FOCUS,
            )}
          >
            {link.replace(/token=(.{8}).*/, "token=$1…")}{" "}
            <span className="text-muted-foreground">(tap to copy the whole thing)</span>
          </button>
        ) : (
          <p className="mt-1 text-[11.5px] leading-snug text-foreground/90">
            One link, one person, one permission: drop readings in. It can't read anything back and
            it can't approve or run a thing.
          </p>
        )}
      </div>

      {/* Setup, per phone */}
      <div className="mt-2 vanta-inset px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <Smartphone className="h-3.5 w-3.5 shrink-0 text-primary" />
          <MachineLabel className="text-foreground/70">Set it up once</MachineLabel>
          <div className="ml-auto flex gap-1">
            {SETUP_RECIPES.map((r) => (
              <button
                key={r.platform}
                type="button"
                onClick={() => setPlatform(r.platform)}
                aria-pressed={platform === r.platform}
                className={cn(
                  btnClass,
                  platform === r.platform && "border-primary/50 text-foreground",
                )}
              >
                {r.title}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">{recipe.app}</p>
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{HEALTH_PUSH_TRUTH}</p>
        <ol className="mt-2 space-y-1.5">
          {recipe.steps.map((s, i) => (
            <li key={s} className="flex gap-2 text-[11.5px] leading-snug text-foreground/90">
              <MachineText className="mt-[1px] shrink-0 text-[10px] text-primary">
                {String(i + 1).padStart(2, "0")}
              </MachineText>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* The exact body */}
      <div className="mt-2 vanta-inset px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <MachineLabel className="text-foreground/70">What to post</MachineLabel>
          <button
            type="button"
            onClick={() => void copy(ingestBodyTemplate(), "Body")}
            className={cn(btnClass, "ml-auto")}
          >
            <Copy className="h-3.5 w-3.5" />
            Copy the body
          </button>
        </div>
        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre rounded-[2px] border border-border/60 bg-background/40 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-foreground/80">
          {ingestBodyTemplate()}
        </pre>
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
          Sleep and workouts are minutes. Send the same reading twice and it stays one row.
        </p>
      </div>

      <ul className="mt-3 space-y-1.5">
        {[
          "If the activity sense is off below, the send is refused outright — nothing is stored.",
          "Readings shift what Echo says and when it holds a note. They never approve or run anything.",
          "A gap stays a gap. Echo won't put a zero where a number never arrived.",
        ].map((t) => (
          <li key={t} className="flex gap-2 text-[11.5px] leading-snug text-foreground/90">
            <Check className="mt-[2px] h-3 w-3 shrink-0 text-primary" />
            <span>{t}</span>
          </li>
        ))}
      </ul>

      <AftermathHint text="Every automatic send writes a receipt you can read in Receipts · the numbers land in Today's body panel and the Work desk · nothing leaves through Telegram" />
    </section>
  );
}
