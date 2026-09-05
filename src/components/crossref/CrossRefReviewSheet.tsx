// CrossRefReviewSheet — the checkpoint between "Vanta read your sources" and
// "Vanta made you a document". Nothing composes until the user taps.
// 384px first: one column, 44px controls, no matrix scroll wall.
import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { ErrorState, LoadingState } from "@/components/ui/state-views";
import { AftermathHint } from "@/components/aftermath/AftermathHint";
import { vantaToast } from "@/lib/vantaVoice";
import { useScope } from "@/hooks/useScope";
import { cn } from "@/lib/utils";
import {
  loadCase, resolveConflict, setSourceAuthority, planArtifact, verifiedValue,
  SHAPE_OPTIONS, STATE_LABEL, recipeForCase, recipeGaps,
  type CaseBundle, type CaseConflictRow, type OutputShape,
} from "@/lib/crossref";
import { composeCaseArtifact } from "@/lib/crossrefArtifact";

function fieldLabel(f: string) {
  return f.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function ConflictRow({ bundle, conflict, onDone }: { bundle: CaseBundle; conflict: CaseConflictRow; onDone: () => void }) {
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const readings = bundle.claims.filter((c) => c.record_key === conflict.record_key && c.field === conflict.field);
  const record = bundle.records.find((r) => r.record_key === conflict.record_key);

  const settle = async (choice: Parameters<typeof resolveConflict>[0]["choice"]) => {
    setBusy(true);
    try {
      await resolveConflict({ conflict, choice });
      vantaToast.success({ title: "Settled", description: "Your answer is what gets printed." });
      onDone();
    } catch {
      vantaToast.error({ title: "Could not save that", description: "Try once more." });
    } finally {
      setBusy(false);
    }
  };

  const settled = conflict.resolution !== "pending";

  return (
    <div className="rounded-lg border border-border/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium">{record?.display_label ?? conflict.record_key}</div>
          <div className="text-[11px] text-muted-foreground">{fieldLabel(conflict.field)}</div>
        </div>
        <Badge variant={settled ? "secondary" : "outline"} className="shrink-0 text-[10px]">
          {settled ? "Settled" : STATE_LABEL[conflict.kind === "unreadable" ? "unreadable" : "conflicts"]}
        </Badge>
      </div>

      <div className="mt-2 space-y-1.5">
        {readings.map((c) => {
          const src = bundle.sources.find((s) => s.id === c.source_id);
          const unreadable = c.certainty === "uncertain";
          return (
            <button
              key={c.id}
              type="button"
              disabled={busy || unreadable}
              onClick={() => void settle({ kind: "claim", claim_id: c.id, value: c.value_text })}
              className={cn(
                "flex min-h-11 w-full items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left text-[12px]",
                conflict.resolved_claim_id === c.id ? "border-primary bg-primary/10" : "border-border/50",
                unreadable ? "opacity-60" : "hover:bg-accent/40",
              )}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{unreadable ? "Vanta could not read this" : (c.value_text ?? "—")}</span>
                <span className="block truncate text-[10.5px] text-muted-foreground">{src?.filename ?? "calculated"}</span>
              </span>
              {!unreadable && <span className="shrink-0 text-[10px] text-muted-foreground">Use this</span>}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex gap-2">
        <Input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="Type the right one"
          className="h-11 text-[12px]"
        />
        <Button
          size="sm"
          variant="secondary"
          className="h-11"
          disabled={busy || !manual.trim()}
          onClick={() => void settle({ kind: "manual", value: manual.trim() })}
        >
          Set
        </Button>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void settle({ kind: "leave_open" })}
        className="mt-1.5 text-[11px] text-muted-foreground underline-offset-2 hover:underline"
      >
        Leave it open — print it as unsettled
      </button>
    </div>
  );
}

export function CrossRefReviewSheet({
  caseId, open, onOpenChange, onComposed,
}: {
  caseId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onComposed?: (exportId: string) => void;
}) {
  const scope = useScope();
  const [bundle, setBundle] = useState<CaseBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shape, setShape] = useState<OutputShape | null>(null);
  const [allowSensitive, setAllowSensitive] = useState<string[]>([]);
  const [composing, setComposing] = useState(false);

  const refresh = async () => {
    if (!caseId) return;
    setLoading(true);
    setError(null);
    try {
      const b = await loadCase(caseId);
      setBundle(b);
      if (b && !shape) setShape((b.case.output_shape as OutputShape) ?? "clean_form");
    } catch {
      setError("Could not open this cross-reference.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && caseId) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, caseId]);

  const plan = useMemo(
    () => (bundle && shape ? planArtifact(bundle, shape, allowSensitive) : null),
    [bundle, shape, allowSensitive],
  );

  const compose = async () => {
    if (!bundle || !shape) return;
    setComposing(true);
    try {
      const row = await composeCaseArtifact({
        bundle,
        shape,
        includeSensitive: allowSensitive,
        organization_id: scope.isOrganization ? scope.orgId : null,
      });
      vantaToast.success({ title: "Document built", description: "It's filed in Receipts with the sources attached." });
      onComposed?.(row.id);
      onOpenChange(false);
    } catch {
      vantaToast.error({ title: "Could not build the document", description: "Nothing was filed. Try again." });
    } finally {
      setComposing(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-[520px]">
        <SheetHeader className="border-b border-border/60 px-4 py-3">
          <SheetTitle className="text-sm">Cross-reference</SheetTitle>
        </SheetHeader>

        <div className="space-y-3 p-3">
          {loading && !bundle && <LoadingState label="Reading your sources" />}
          {error && <ErrorState detail={error} onRetry={() => void refresh()} />}

          {bundle && (
            <>
              <div className="vanta-card p-3">
                <div className="text-[13px] font-medium">{bundle.case.title}</div>
                <div className="mt-1 text-[12px] text-muted-foreground">
                  {bundle.records.length} record{bundle.records.length === 1 ? "" : "s"} across {bundle.sources.length} sources.
                </div>
                <div className="mt-2 rounded-md border border-border/50 bg-muted/20 p-2">
                  <div className="text-[11.5px] font-medium">
                    Template: {recipeForCase(bundle).label}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {recipeForCase(bundle).blurb}
                  </div>
                  {recipeGaps(bundle).length > 0 && (
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      Not on the sources: {recipeGaps(bundle).map(fieldLabel).join(", ")}. Vanta leaves those blank.
                    </div>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[10.5px]">
                  <Badge variant="secondary">{bundle.matrix.counts.agrees} agree</Badge>
                  <Badge variant="outline">{bundle.matrix.counts.conflicts} disagree</Badge>
                  <Badge variant="outline">{bundle.matrix.counts.missing} missing</Badge>
                  <Badge variant="outline">{bundle.matrix.counts.unreadable} unreadable</Badge>
                </div>
              </div>

              <CollapsibleSection storageKey={`crossref-sources-${bundle.case.id}`} title="Which source wins" defaultOpen={false}>
                <div className="space-y-2">
                  {bundle.sources.map((s) => (
                    <div key={s.id} className="rounded-lg border border-border/60 p-2.5">
                      <div className="truncate text-[12.5px] font-medium">{s.filename}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {s.role === "master" ? "Treated as the master sheet" : s.role === "supporting" ? "Treated as supporting" : "Role unclear"}
                        {" — Vanta guessed this. Change it if that's wrong."}
                      </div>
                      <div className="mt-2 flex gap-2">
                        {(["master", "supporting"] as const).map((r) => (
                          <Button
                            key={r}
                            size="sm"
                            variant={s.role === r ? "default" : "outline"}
                            className="h-9 text-[11px]"
                            onClick={async () => {
                              await setSourceAuthority({ source: s, role: r });
                              await refresh();
                            }}
                          >
                            {r === "master" ? "Master" : "Supporting"}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleSection>

              <CollapsibleSection
                storageKey={`crossref-conflicts-${bundle.case.id}`}
                title={`What needs your call (${plan?.unresolved ?? 0})`}
                defaultOpen={(plan?.unresolved ?? 0) > 0}
              >
                {bundle.conflicts.filter((c) => c.kind === "contradiction" || c.kind === "unreadable").length === 0 ? (
                  <div className="text-[12px] text-muted-foreground">
                    Nothing is fighting. Every field either agrees or is honestly marked missing.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {bundle.conflicts
                      .filter((c) => c.kind === "contradiction" || c.kind === "unreadable")
                      .map((c) => (
                        <ConflictRow key={c.id} bundle={bundle} conflict={c} onDone={() => void refresh()} />
                      ))}
                  </div>
                )}
              </CollapsibleSection>

              <CollapsibleSection storageKey={`crossref-records-${bundle.case.id}`} title="What will print" defaultOpen={false}>
                <div className="space-y-2">
                  {bundle.records.map((rec) => (
                    <div key={rec.id} className="rounded-lg border border-border/60 p-2.5">
                      <div className="text-[12.5px] font-medium">{rec.display_label}</div>
                      {rec.match_confidence === "uncertain" && (
                        <div className="text-[10.5px] text-muted-foreground">Same record across sources — not confirmed.</div>
                      )}
                      <div className="mt-1.5 space-y-0.5">
                        {(plan?.printed ?? []).map((f) => {
                          const v = verifiedValue(bundle, rec.record_key, f);
                          return (
                            <div key={f} className="flex gap-2 text-[12px]">
                              <span className="w-24 shrink-0 text-muted-foreground">{fieldLabel(f)}</span>
                              <span>
                                {v.state === "unreadable" ? "unreadable" : (v.value ?? "—")}
                                {v.state !== "agrees" && (
                                  <span className="ml-1 text-[10px] text-muted-foreground">({STATE_LABEL[v.state]})</span>
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleSection>

              <div className="vanta-card space-y-2 p-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Shape of the document</div>
                <div className="grid gap-1.5">
                  {SHAPE_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setShape(o.value)}
                      className={cn(
                        "min-h-11 rounded-md border px-2.5 py-2 text-left",
                        shape === o.value ? "border-primary bg-primary/10" : "border-border/50 hover:bg-accent/40",
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <div className="text-[12.5px] font-medium">{o.label}</div>
                        {bundle.case.output_shape === o.value && (
                          <Badge variant="secondary" className="text-[9.5px]">Suits this template</Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{o.blurb}</div>
                    </button>
                  ))}
                </div>

                {plan && plan.held_back.length > 0 && (
                  <div className="rounded-md border border-border/50 p-2.5">
                    <div className="text-[11.5px] text-muted-foreground">
                      Held back because it's personal: {plan.held_back.map(fieldLabel).join(", ")}.
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {plan.held_back.map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() =>
                            setAllowSensitive((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]))
                          }
                          className="min-h-9 rounded-md border border-border/60 px-2 text-[11px] hover:bg-accent/40"
                        >
                          Include {fieldLabel(f)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {plan && plan.unresolved > 0 && (
                  <div className="text-[11.5px] text-muted-foreground">
                    {plan.unresolved} field{plan.unresolved === 1 ? "" : "s"} still unsettled. They'll print as unsettled — Vanta won't guess.
                  </div>
                )}

                <Button className="min-h-11 w-full" disabled={composing || !shape} onClick={() => void compose()}>
                  {composing ? "Building the document" : "Build the document"}
                </Button>
                <AftermathHint
                  bare
                  text="Filed to Receipts · sources and your corrections travel with it · nothing is sent"
                />
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
