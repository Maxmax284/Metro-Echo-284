import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Sparkles, Maximize2, FileText, CheckSquare, ListTodo, Radar } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useSherlock } from "@/components/sherlock/SherlockContext";
import { FeedbackBar } from "@/components/feedback/FeedbackBar";
import { StatusDot, confidenceTone } from "@/components/ui/status-dot";

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
  const { openSherlock } = useSherlock();

  const [scope, setScope] = useState<ScopeId>("all");
  const [question, setQuestion] = useState("");
  const [running, setRunning] = useState(false);

  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [findingsByInv, setFindingsByInv] = useState<Record<string, Finding[]>>({});
  const [openId, setOpenId] = useState<string | null>(null);

  const [targets, setTargets] = useState<Target[]>([]);
  const cancelRef = useRef(false);
  const [justFinishedId, setJustFinishedId] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("investigations")
      .select("id, question, status, summary, created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    setInvestigations((data ?? []) as Investigation[]);
  };

  const loadTargets = async () => {
    if (!user) return;
    const [c, n, a] = await Promise.all([
      supabase.from("commitments").select("id, summary, updated_at").order("updated_at", { ascending: false }).limit(4),
      supabase.from("notes").select("id, title, body, updated_at").order("updated_at", { ascending: false }).limit(4),
      supabase.from("actions").select("id, title, status, updated_at").order("updated_at", { ascending: false }).limit(4),
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

  useEffect(() => { load(); loadTargets(); }, [user]);

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
        body: { question: fullQuestion },
      });
      if (cancelRef.current) return; // user cancelled; drop result silently
      if (error) throw error;
      toast.success(`Investigation complete · ${data?.findings_count ?? 0} findings`);
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
      toast.error(e instanceof Error ? e.message : "Investigation failed");
    } finally {
      setRunning(false);
    }
  };

  const cancel = () => {
    cancelRef.current = true;
    setRunning(false);
    toast.message("Investigation cancelled");
  };

  const targetIcon = (k: Target["kind"]) =>
    k === "commitment" ? CheckSquare : k === "note" ? FileText : ListTodo;

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-y-auto p-4 pb-32 md:pb-6">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-medium">Sherlock</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Scoped investigations across your operational substrate. Findings are cited.
          </p>
        </header>

        <Card className="p-3 space-y-3">
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
          <div className="flex justify-end">
            <Button onClick={run} disabled={running || !question.trim()} size="sm" className="gap-1.5">
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              Investigate
            </Button>
          </div>
        </Card>

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
          {investigations.length === 0 && (
            <div className="rounded-lg border border-dashed border-border/60 py-8 text-center text-xs text-muted-foreground">
              <Radar className="mx-auto mb-2 h-4 w-4 opacity-60" />
              No investigations yet. Ask a question above or tap a target.
            </div>
          )}
          {investigations.map((inv) => {
            const isOpen = openId === inv.id;
            const findings = findingsByInv[inv.id] ?? [];
            return (
              <Card key={inv.id} className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <button
                    className="flex-1 text-left"
                    onClick={() => {
                      const next = isOpen ? null : inv.id;
                      setOpenId(next);
                      if (next) loadFindings(next);
                    }}
                  >
                    <p className="text-sm font-medium leading-snug">{inv.question}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(inv.created_at), { addSuffix: true })}
                    </p>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <Badge variant="outline" className="text-[10px]">{inv.status}</Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      title="Open in overlay"
                      onClick={() =>
                        openSherlock(
                          { entity_type: "freeform", title: inv.question, text: inv.summary ?? "" },
                          inv.summary ? { summary: inv.summary } : undefined,
                        )
                      }
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
                              <span className="leading-snug">{f.claim}</span>
                              <Badge variant="outline" className="shrink-0 text-[9px]">{f.confidence}</Badge>
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
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
