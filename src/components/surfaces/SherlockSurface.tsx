import { useEffect, useMemo, useRef, useState } from "react";
import { SurfaceAftermath } from "@/components/aftermath/SurfaceAftermath";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Sparkles, Maximize2, FileText, CheckSquare, ListTodo, Radar } from "lucide-react";
import { vantaToast as toast, vantaSay } from "@/lib/vantaVoice";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { markFlipOriginFromEvent } from "@/lib/flip";
import { useSherlock } from "@/components/sherlock/SherlockContext";
import { FeedbackBar } from "@/components/feedback/FeedbackBar";
import { StatusDot, confidenceTone } from "@/components/ui/status-dot";
import { useSherlockPending } from "@/hooks/useSherlockPending";
import { SherlockFindingCard } from "@/components/sherlock/SherlockFindingCard";
import { SherlockSettingsPanel } from "@/components/sherlock/SherlockSettingsPanel";
import { EmptyState, LoadingState } from "@/components/ui/state-views";
import { buildSherlockBriefing } from "@/lib/sherlockBriefing";
import { SherlockBriefingPanel } from "@/components/sherlock/SherlockBriefing";
import { SherlockDigestCard } from "@/components/sherlock/SherlockDigestCard";
import { SherlockDetectionPanel } from "@/components/sherlock/SherlockDetectionPanel";

const STARTER_QUESTIONS: Record<ScopeId, string[]> = {
  all:         ["What did I commit to this week?", "Anything stale I should refresh?", "Open threads I'm forgetting?"],
  notes:       ["Notes about Lisbon trip", "Anything I jotted on payments?", "Recent decisions I logged"],
  commitments: ["Commitments due in the next 3 days", "What did I promise this week?", "Anything I keep slipping on?"],
  actions:     ["Actions still pending approval", "Recently completed actions", "What's blocked right now?"],
  awareness:   ["Latest scams worth knowing", "Transport changes in my area", "Connectivity hiccups recently"],
  files:       ["What's in the most recent ingest?", "Files mentioning payments", "Files I haven't acted on"],
};

type Investigation = {
  id: string;
  question: string;
  status: string;
  summary: string | null;
  created_at: string;
};

type Finding = {
  id: string;
  investigation_id: string;
  claim: string;
  confidence: string;
  source_kind: string | null;
  source_excerpt: string | null;
};

type ScopeId = "all" | "notes" | "commitments" | "actions" | "awareness" | "files";

const SCOPES: { id: ScopeId; label: string; hint: string }[] = [
  { id: "all",         label: "All",         hint: "everything you have" },
  { id: "notes",       label: "Notes",       hint: "only my notes" },
  { id: "commitments", label: "Commitments", hint: "only my commitments" },
  { id: "actions",     label: "Actions",     hint: "only my actions log" },
  { id: "awareness",   label: "Awareness",   hint: "only awareness briefings & snapshots" },
  { id: "files",       label: "Files",       hint: "only ingested files" },
];

type Target =
  | { kind: "commitment"; id: string; title: string; meta: string }
  | { kind: "note";       id: string; title: string; meta: string }
  | { kind: "action";     id: string; title: string; meta: string };

export function SherlockSurface() {
  const { user } = useAuth();
  const { applyScope, orgId, key: scopeKey } = useScope();
  const { openSherlock } = useSherlock();

  const { items: pending, loading: pendingLoading, refresh: refreshPending } = useSherlockPending({ limit: 25 });

  const [scope, setScope] = useState<ScopeId>("all");
  const [question, setQuestion] = useState("");
  const [running, setRunning] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [lastScanAt, setLastScanAt] = useState<string | null>(null);

  const [investigations, setInvestigations] = useState<Investigation[] | null>(null);
  const [findingsByInv, setFindingsByInv] = useState<Record<string, Finding[]>>({});
  const [openId, setOpenId] = useState<string | null>(null);

  const [targets, setTargets] = useState<Target[]>([]);
  const cancelRef = useRef(false);
  const [justFinishedId, setJustFinishedId] = useState<string | null>(null);

  // The room opens with where things stand, not with the console.
  const briefing = useMemo(
    () => buildSherlockBriefing({ pending, lastScanAt }),
    [pending, lastScanAt],
  );

  const load = async () => {
    if (!user) return;
    // Scope isolation: an investigation belongs to the room it was run in.
    const { data } = await applyScope(supabase
      .from("investigations")
      .select("id, question, status, summary, created_at"))
      .order("created_at", { ascending: false })
      .limit(30);
    setInvestigations((data ?? []) as Investigation[]);
  };

  const loadLastScan = async () => {
    if (!user) return;
    const { data } = await applyScope(supabase
      .from("audit_log")
      .select("created_at")
      .eq("event", "sherlock_patterns_scanned"))
      .order("created_at", { ascending: false })
      .limit(1);
    setLastScanAt((data ?? [])[0]?.created_at ?? null);
  };

  const runScan = async () => {
    if (scanning) return;
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("sherlock-patterns", {});
      if (error) throw error;
      toast.success(vantaSay.sherlock.scanComplete(data?.written ?? 0));
      refreshPending();
      void loadLastScan();
    } catch (e) {
      toast.fromError(e, vantaSay.sherlockFailed());
    } finally {
      setScanning(false);
    }
  };

  const loadTargets = async () => {
    if (!user) return;
    const [c, n, a] = await Promise.all([
      applyScope(supabase.from("commitments").select("id, summary, updated_at")).order("updated_at", { ascending: false }).limit(4),
      applyScope(supabase.from("notes").select("id, title, body, updated_at")).order("updated_at", { ascending: false }).limit(4),
      applyScope(supabase.from("actions").select("id, title, status, updated_at")).order("updated_at", { ascending: false }).limit(4),
    ]);
    const t: Target[] = [];
    (c.data ?? []).forEach((r: any) =>
      t.push({ kind: "commitment", id: r.id, title: r.summary ?? "Commitment", meta: formatDistanceToNow(new Date(r.updated_at), { addSuffix: true }) }));
    (n.data ?? []).forEach((r: any) =>
      t.push({ kind: "note", id: r.id, title: r.title ?? (r.body?.slice(0, 60) || "Untitled"), meta: formatDistanceToNow(new Date(r.updated_at), { addSuffix: true }) }));
    (a.data ?? []).forEach((r: any) =>
      t.push({ kind: "action", id: r.id, title: r.title ?? "Action", meta: `${r.status} · ${formatDistanceToNow(new Date(r.updated_at), { addSuffix: true })}` }));
    setTargets(t);
  };

  useEffect(() => { load(); loadTargets(); loadLastScan(); }, [user, scopeKey]);

  const loadFindings = async (id: string) => {
    if (findingsByInv[id]) return;
    const { data } = await supabase
      .from("investigation_findings")
      .select("id, investigation_id, claim, confidence, source_kind, source_excerpt")
      .eq("investigation_id", id);
    setFindingsByInv((m) => ({ ...m, [id]: (data ?? []) as Finding[] }));
  };

  const scopePrefix = useMemo(() => {
    if (scope === "all") return "";
    const s = SCOPES.find((x) => x.id === scope)!;
    return `[Scope: ${s.label} — search ${s.hint}.] `;
  }, [scope]);

  const seedFromTarget = (t: Target) => {
    setScope(t.kind === "commitment" ? "commitments" : t.kind === "note" ? "notes" : "actions");
    setQuestion(`Investigate this ${t.kind}: "${t.title}". What's the context, dependencies, and anything I'm missing?`);
  };

  const run = async () => {
    if (!question.trim() || running) return;
    cancelRef.current = false;
    setRunning(true);
    try {
      const fullQuestion = `${scopePrefix}${question.trim()}`;
      const { data, error } = await supabase.functions.invoke("sherlock-investigate", {
        body: { question: fullQuestion, organization_id: orgId },
      });
      if (cancelRef.current) return; // user cancelled; drop result silently
      if (error) throw error;
      toast.success(vantaSay.sherlockComplete(data?.findings_count ?? 0));
      setQuestion("");
      await load();
      if (data?.id) {
        setOpenId(data.id);
        setJustFinishedId(data.id);
        setTimeout(() => setJustFinishedId((v) => (v === data.id ? null : v)), 6000);
        await loadFindings(data.id);
      }
    } catch (e) {
      if (cancelRef.current) return;
      toast.fromError(e, vantaSay.sherlockFailed());
    } finally {
      setRunning(false);
    }
  };

  const cancel = () => {
    cancelRef.current = true;
    setRunning(false);
    toast.message(vantaSay.cancelled("Investigation cancelled"));
  };

  const targetIcon = (k: Target["kind"]) =>
    k === "commitment" ? CheckSquare : k === "note" ? FileText : ListTodo;

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-y-auto p-4 pb-32 md:pb-6">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <header className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="text-lg font-medium">Sherlock</h2>
              <span className="rounded-full bg-muted/30 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground ring-1 ring-border/60">
                cited findings only
              </span>
            </div>
            <span className="text-[10.5px] text-muted-foreground">
              {(investigations?.length ?? 0)} investigation{(investigations?.length ?? 0) === 1 ? "" : "s"}
            </span>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Sherlock reads only what you have already saved in this room. It suggests; it never files,
            links or runs anything on its own.
          </p>
        </header>

        {/* Where things stand, before any console. */}
        <SherlockBriefingPanel
          briefing={briefing}
          lastScanAt={lastScanAt}
          scanning={scanning}
          onScan={runScan}
          onChanged={refreshPending}
        />

        {/* The weekly read sits under the live briefing: what changed, not a status. */}
        <SherlockDigestCard />

        <div className="vanta-card p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/20 px-2 py-0.5 ring-1 ring-border/50">
              <StatusDot tone="primary" /> looking at: <strong className="text-foreground/80">{SCOPES.find((x) => x.id === scope)!.label}</strong>
            </span>
            <span className="text-muted-foreground/70">{SCOPES.find((x) => x.id === scope)!.hint}</span>
          </div>
          {/* Scope chips */}
          <div className="flex flex-wrap gap-1.5">
            {SCOPES.map((s) => (
              <button
                key={s.id}
                onClick={() => setScope(s.id)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] ring-1 transition-colors",
                  scope === s.id
                    ? "bg-primary/15 text-primary ring-primary/40"
                    : "bg-muted/30 text-muted-foreground ring-border/60 hover:bg-muted/50",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={
              scope === "all"
                ? "What did I commit to last week about the Lisbon trip?"
                : `Ask within ${SCOPES.find((x) => x.id === scope)!.label}…`
            }
            rows={3}
            className="resize-none"
          />

          {/* Starter question chips — shown when textarea is empty */}
          {!question.trim() && (
            <div className="flex flex-wrap gap-1.5">
              {STARTER_QUESTIONS[scope].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQuestion(q)}
                  className="rounded-full bg-surface-elevated/60 px-2.5 py-1 text-[11px] text-muted-foreground ring-1 ring-border/60 transition-colors hover:bg-surface-elevated hover:text-foreground/90"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-[10.5px] text-muted-foreground">
              {running ? "Investigating across your substrate…" : "Findings will be cited."}
            </span>
            <div className="flex items-center gap-1.5">
              {running && (
                <Button onClick={cancel} size="sm" variant="ghost" className="h-7 px-2 text-xs">
                  Cancel
                </Button>
              )}
              <Button onClick={run} disabled={running || !question.trim()} size="sm" className="gap-1.5">
                {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                Investigate
              </Button>
            </div>
          </div>
        </div>

        {/* The waiting queue. "Look again" lives in the briefing — one button, one job. */}
        <div>
          <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>Waiting on your read{pending.length > 0 ? ` · ${pending.length}` : ""}</span>
          </div>
          {pendingLoading ? (
            <LoadingState label="Reading what you have saved…" />
          ) : pending.length === 0 ? (
            <EmptyState
              icon={<Radar className="h-4 w-4" />}
              title="Nothing waiting"
              hint="Findings land here when a pattern repeats across your notes, promises and files — or when you tap Analyze on a card. Sherlock never files one for you."
              flow={["Saved", "Noticed", "Your call"]}
            />
          ) : (
            <div className="space-y-1.5">
              {pending.slice(0, 8).map((f) => (
                <SherlockFindingCard key={f.id} finding={f} onChanged={refreshPending} />
              ))}
              {pending.length > 8 && (
                <p className="text-[10.5px] text-muted-foreground">+{pending.length - 8} more queued</p>
              )}
            </div>
          )}
        </div>

        <CrossRefCasesPanel />
        <SherlockDetectionPanel />
        <SherlockSettingsPanel />

        {/* Target cards — tap to seed */}
        {targets.length > 0 && (
          <div>
            <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              Recent targets · tap to seed
            </p>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {targets.slice(0, 6).map((t) => {
                const Icon = targetIcon(t.kind);
                return (
                  <button
                    key={`${t.kind}:${t.id}`}
                    onClick={() => seedFromTarget(t)}
                    className="group flex items-start gap-2 rounded-lg surface-elevated p-2 text-left ring-1 ring-border/60 transition hover:ring-primary/40"
                  >
                    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/80" />
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-medium">{t.title}</p>
                      <p className="text-[10.5px] text-muted-foreground capitalize">{t.kind} · {t.meta}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-2">
          {investigations === null && <LoadingState label="Opening the case file…" />}
          {investigations !== null && investigations.length === 0 && (
            <EmptyState
              icon={<Radar className="h-4 w-4" />}
              title="No investigations in this room"
              hint="An investigation starts when you ask a question above, or tap Analyze on a note, action or document. Answers stay here with the records they came from."
              flow={["Target", "Investigate", "Findings"]}
            />
          )}
          {(investigations ?? []).map((inv) => {
            const isOpen = openId === inv.id;
            const findings = findingsByInv[inv.id] ?? [];
            const isJustFinished = justFinishedId === inv.id;
            return (
              <div
                key={inv.id}
                className={cn(
                  "vanta-card p-3 space-y-2 transition-shadow",
                  isJustFinished && "ring-1 ring-primary/50 shadow-[0_0_0_3px_hsl(var(--primary)/0.08)]",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    className="flex-1 text-left"
                    onClick={(e) => {
                      markFlipOriginFromEvent(e);
                      const next = isOpen ? null : inv.id;
                      setOpenId(next);
                      if (next) loadFindings(next);
                    }}
                  >
                    <p className="text-sm font-medium leading-snug">{inv.question}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span>{formatDistanceToNow(new Date(inv.created_at), { addSuffix: true })}</span>
                      {findings.length > 0 && (
                        <>
                          <span aria-hidden>·</span>
                          <span>{findings.length} finding{findings.length === 1 ? "" : "s"}</span>
                        </>
                      )}
                    </p>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <Badge variant="outline" className="text-[10px]">{inv.status}</Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      title="Open in overlay"
                      onClick={(e) => {
                        markFlipOriginFromEvent(e);
                        return openSherlock(
                          { entity_type: "freeform", title: inv.question, text: inv.summary ?? "" },
                          inv.summary ? { summary: inv.summary } : undefined,
                        );
                      }}
                    >
                      <Maximize2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {isOpen && (
                  <div className="space-y-2 border-t border-border/60 pt-2">
                    {inv.summary && <p className="text-sm leading-relaxed text-foreground/90">{inv.summary}</p>}
                    {findings.length > 0 && (
                      <ul className="space-y-1.5">
                        {findings.map((f) => (
                          <li key={f.id} className="rounded-md bg-surface-elevated p-2 text-xs">
                            <div className="flex items-start justify-between gap-2">
                              <span className="flex-1 leading-snug">
                                <StatusDot tone={confidenceTone(f.confidence)} className="mr-1.5 -translate-y-0.5" title={`${f.confidence} confidence`} />
                                {f.claim}
                              </span>
                              <Badge variant="outline" className="shrink-0 text-[9px] uppercase tracking-wider">{f.confidence}</Badge>
                            </div>
                            {f.source_kind && (
                              <p className="mt-1 text-[10px] text-muted-foreground">
                                source: {f.source_kind}{f.source_excerpt ? ` — "${f.source_excerpt}"` : ""}
                              </p>
                            )}
                            <div className="mt-1.5">
                              <FeedbackBar
                                surface="sherlock"
                                targetType="sherlock_finding"
                                targetId={f.id}
                                label={f.claim.slice(0, 80)}
                                original={f}
                              />
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <SurfaceAftermath surface="sherlock" />
      </div>
    </div>
  );
}
