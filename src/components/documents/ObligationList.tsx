// ObligationList — obligations surfaced for review, never converted silently.
//
// Doctrine: a document may say what it obliges. Only you decide whether that
// becomes work. Each row answers who owes what, by when, under what condition,
// and where in the document it came from. Turning one into a promise or a
// prepared step is an explicit tap, and the step still needs approval later.
import { useState } from "react";
import { AlertTriangle, CheckSquare, ListChecks } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import { vantaToast } from "@/lib/vantaVoice";
import type { DocumentObligation } from "@/lib/documents";
import { AftermathHint } from "@/components/aftermath/AftermathHint";
import { cn } from "@/lib/utils";
import { MOTION_FOCUS } from "@/lib/motion";

export function ObligationList({
  obligations,
  documentId,
  documentTitle,
}: {
  obligations: DocumentObligation[];
  documentId: string;
  documentTitle: string;
}) {
  const { user } = useAuth();
  const { withScope } = useScope();
  const [busy, setBusy] = useState<string | null>(null);
  const [converted, setConverted] = useState<Record<string, "promise" | "step">>({});

  async function convert(o: DocumentObligation, into: "promise" | "step") {
    if (!user) return;
    const summary = [o.party, o.what].filter(Boolean).join(": ") || "Obligation from a document";
    setBusy(`${o.id}:${into}`);
    try {
      if (into === "promise") {
        await supabase.from("commitments").insert(
          withScope({
            user_id: user.id,
            summary: summary.slice(0, 200),
            due_at: null,
            notes: [
              o.when_text ? `When: ${o.when_text}` : null,
              o.conditions ? `If: ${o.conditions}` : null,
              `From document: ${documentTitle}${o.source_clause_ref ? ` (${o.source_clause_ref})` : ""}`,
            ]
              .filter(Boolean)
              .join("\n"),
          }) as never,
        );
        vantaToast.success("Recorded as an open promise. Add a real date in Commitments.");
      } else {
        await supabase.from("actions").insert(
          withScope({
            user_id: user.id,
            title: summary.slice(0, 120),
            description: [
              o.what,
              o.when_text ? `When: ${o.when_text}` : null,
              o.conditions ? `If: ${o.conditions}` : null,
              `From document: ${documentTitle}${o.source_clause_ref ? ` (${o.source_clause_ref})` : ""}`,
            ]
              .filter(Boolean)
              .join("\n"),
            risk: "standard",
            status: "proposed",
            source: "document_obligation",
          }) as never,
        );
        vantaToast.success("Drafted in Actions. It will not run until you approve it.");
      }
      await supabase.from("audit_log").insert({
        user_id: user.id,
        entity_type: "document",
        entity_id: documentId,
        event: into === "promise" ? "document.obligation_to_commitment" : "document.obligation_to_action",
        payload: { obligation_id: o.id, clause: o.source_clause_ref ?? null },
      });
      setConverted((prev) => ({ ...prev, [o.id]: into }));
    } catch (e) {
      vantaToast.error(
        e instanceof Error ? `That did not save: ${e.message}` : "That did not save. Nothing was created.",
      );
    } finally {
      setBusy(null);
    }
  }

  if (obligations.length === 0) {
    return (
      <p className="text-[12px] leading-snug text-muted-foreground">
        No obligations were extracted from this document. If you expected some, the text may be an
        image-only scan — Vanta only reports what it could read.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="flex items-start gap-1.5 text-[11.5px] leading-snug text-muted-foreground">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" aria-hidden="true" />
        Read from the document text. Nothing here becomes a promise or a step until you say so.
      </p>

      <ul className="space-y-2">
        {obligations.map((o) => {
          const done = converted[o.id];
          return (
            <li key={o.id} className="rounded-[2px] border border-border/60 bg-surface-elevated/40 p-2.5">
              <p className="text-[12px] font-medium text-foreground">{o.party ?? "Unnamed party"}</p>
              <p className="text-[12px] leading-snug text-foreground/85">{o.what ?? "Not stated"}</p>
              <dl className="mt-1 space-y-0.5 text-[10.5px] text-muted-foreground">
                <Row term="By when" detail={o.when_text ?? "No date stated in the document"} />
                <Row term="Under what condition" detail={o.conditions ?? "No condition stated"} />
                <Row
                  term="Where it came from"
                  detail={o.source_clause_ref ?? "Clause reference not captured"}
                />
              </dl>

              {done ? (
                <p className="mt-1.5 text-[10.5px] text-primary">
                  {done === "promise"
                    ? "Recorded as an open promise in Commitments."
                    : "Drafted in Actions — still waiting on your approval."}
                </p>
              ) : (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <ConvertButton
                    label="Make it a promise"
                    Icon={CheckSquare}
                    busy={busy === `${o.id}:promise`}
                    onClick={() => void convert(o, "promise")}
                  />
                  <ConvertButton
                    label="Prepare a step"
                    Icon={ListChecks}
                    busy={busy === `${o.id}:step`}
                    onClick={() => void convert(o, "step")}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <AftermathHint text="Converting writes one record you can read in Receipts · execution still needs your approval" />
    </div>
  );
}

function Row({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="flex flex-wrap gap-1">
      <dt className="uppercase tracking-wider text-muted-foreground/70">{term}:</dt>
      <dd className="text-muted-foreground">{detail}</dd>
    </div>
  );
}

function ConvertButton({
  label,
  Icon,
  busy,
  onClick,
}: {
  label: string;
  Icon: typeof CheckSquare;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-[32px] items-center gap-1 rounded-[2px] border border-border/60 px-2",
        "text-[10.5px] text-foreground/85 hover:border-primary/40 hover:text-foreground disabled:opacity-60",
        MOTION_FOCUS,
      )}
    >
      <Icon className="h-3 w-3 text-primary" aria-hidden="true" />
      {busy ? "Saving…" : label}
    </button>
  );
}
