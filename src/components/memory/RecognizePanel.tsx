import { useState } from "react";
import { Sparkles, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { cn } from "@/lib/utils";

/**
 * RecognizePanel — wraps the two new Sherlock modes (extract + suggest) into
 * a single explicit-tap surface for a capture card. Recognition only: nothing
 * routes until the user taps a real route button. Per doctrine: no automatic
 * AI calls, no execution from chat, drafts only.
 */
export type RouteLane = "memory" | "commitment" | "reminder" | "action" | "sherlock" | "ignore";

export type ExtractFindings = {
  document_type?: string;
  summary?: string;
  people?: string[];
  places?: string[];
  orgs?: string[];
  dates?: string[];
  amounts?: string[];
  intents?: string[];
  sensitive?: boolean;
  confidence?: "low" | "medium" | "high";
};

export type SuggestFindings = {
  suggested_route: RouteLane;
  title?: string;
  rationale?: string;
  due_hint?: string;
  risk?: "low" | "standard" | "high";
  confidence?: "low" | "medium" | "high";
};

const ROUTE_LABEL: Record<RouteLane, string> = {
  memory: "Save to Memory",
  commitment: "Track as commitment",
  reminder: "Set a reminder",
  action: "Stage as action",
  sherlock: "Open in Sherlock",
  ignore: "File away",
};

export function RecognizePanel({
  text,
  entityType,
  entityId,
  onAccept,
}: {
  text: string;
  entityType: string;
  entityId?: string | null;
  /** Called when the user accepts the suggested route. The host wires this to the existing route functions. */
  onAccept: (lane: RouteLane, extra: { title?: string; due_hint?: string; risk?: string }) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [extract, setExtract] = useState<ExtractFindings | null>(null);
  const [suggest, setSuggest] = useState<SuggestFindings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setOpen(true);
    if (extract || suggest || loading) return;
    setLoading(true);
    setError(null);
    try {
      const scope = { entity_type: entityType, entity_id: entityId ?? null, text };
      const [extRes, sugRes] = await Promise.all([
        supabase.functions.invoke("sherlock-investigate", { body: { mode: "extract", scope } }),
        supabase.functions.invoke("sherlock-investigate", { body: { mode: "suggest", scope } }),
      ]);
      if (extRes.error) throw extRes.error;
      if (sugRes.error) throw sugRes.error;
      setExtract((extRes.data as any)?.findings ?? {});
      setSuggest((sugRes.data as any)?.findings ?? null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sherlock couldn't read that";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={(e) => { e.stopPropagation(); run(); }}
        className="h-7 shrink-0 gap-1 px-2 text-[11px]"
        title="Recognize: extract structured fields and draft a triage suggestion"
      >
        <Sparkles className="h-3 w-3" />
        Recognize
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-border/60 bg-surface-elevated/30 p-2">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Sparkles className="h-3 w-3 text-primary" />
        <span>Sherlock recognition</span>
        <button
          onClick={() => setOpen(false)}
          className="ml-auto text-[10px] underline-offset-2 hover:underline"
        >
          hide
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Reading it…
        </div>
      )}

      {error && (
        <p className="flex items-center gap-1 text-[11px] text-destructive">
          <AlertCircle className="h-3 w-3" /> {error}
        </p>
      )}

      {extract && (
        <div className="space-y-1 text-[11px]">
          {extract.summary && <p className="text-foreground/90">{extract.summary}</p>}
          <div className="flex flex-wrap gap-1">
            {extract.document_type && <Chip label={`type: ${extract.document_type}`} />}
            {(extract.people ?? []).slice(0, 4).map((p) => <Chip key={`p-${p}`} label={p} tone="accent" />)}
            {(extract.places ?? []).slice(0, 4).map((p) => <Chip key={`pl-${p}`} label={p} tone="accent" />)}
            {(extract.orgs ?? []).slice(0, 3).map((p) => <Chip key={`o-${p}`} label={p} tone="accent" />)}
            {(extract.dates ?? []).slice(0, 3).map((d) => <Chip key={`d-${d}`} label={d} />)}
            {(extract.amounts ?? []).slice(0, 3).map((a) => <Chip key={`a-${a}`} label={a} />)}
            {extract.sensitive && <Chip label="sensitive" tone="warn" />}
            {extract.confidence && <Chip label={`confidence: ${extract.confidence}`} tone="muted" />}
          </div>
        </div>
      )}

      {suggest && (
        <div className="space-y-1.5 rounded-md border border-primary/30 bg-primary/5 p-2">
          <p className="text-[11px] text-foreground/90">
            <span className="font-medium">Suggested:</span> {ROUTE_LABEL[suggest.suggested_route]}
            {suggest.due_hint && <span className="text-muted-foreground"> · {suggest.due_hint}</span>}
          </p>
          {suggest.rationale && (
            <p className="text-[10.5px] italic text-muted-foreground">{suggest.rationale}</p>
          )}
          <div className="flex flex-wrap gap-1">
            <Button
              size="sm"
              className="h-6 px-2 text-[10.5px]"
              onClick={(e) => {
                e.stopPropagation();
                onAccept(suggest.suggested_route, {
                  title: suggest.title,
                  due_hint: suggest.due_hint,
                  risk: suggest.risk,
                });
              }}
            >
              Accept
            </Button>
            <span className="self-center text-[10px] text-muted-foreground">
              or pick a lane below — nothing routes until you tap.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ label, tone = "default" }: { label: string; tone?: "default" | "accent" | "muted" | "warn" }) {
  const toneCls = {
    default: "bg-muted/30 text-foreground/80 ring-border/50",
    accent: "bg-primary/10 text-primary ring-primary/30",
    muted: "bg-muted/20 text-muted-foreground ring-border/40",
    warn: "bg-warn/10 text-warn ring-warn/30",
  }[tone];
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] ring-1", toneCls)}>
      {label}
    </span>
  );
}
