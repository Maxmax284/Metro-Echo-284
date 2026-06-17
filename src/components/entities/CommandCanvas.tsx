import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useCanvas } from "./CanvasContext";
import { useEntitySheet } from "./EntityContext";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { Loader2, Link2, X } from "lucide-react";
import { CanvasCardsView } from "./CanvasCardsView";
import { CanvasTimelineView } from "./CanvasTimelineView";
import { CanvasBoardView } from "./CanvasBoardView";
import { CanvasFlowView } from "./CanvasFlowView";
import { CanvasFilters, type CanvasKind, type CanvasWindow } from "./CanvasFilters";
import { cn } from "@/lib/utils";

type Entity = { id: string; display_name: string; kind: string; last_seen_at: string };
type Relation = { from_entity_id: string; to_entity_id: string; relation: string; evidence_count: number; status?: string | null; source?: string | null };

type Node = Entity & { x: number; y: number; weight: number };

// Doctrine: Canvas is additive. Cards (6a) and Timeline (6b) are pure reads.
// Board (6c) advances actions through the existing actions-transition guard.
// Graph stays available for power use but is not the default surface.
function layoutCircular(entities: Entity[], weights: Map<string, number>, seedId: string | null, w: number, h: number): Node[] {
  const cx = w / 2; const cy = h / 2;
  const seed = seedId ? entities.find((e) => e.id === seedId) : null;
  const others = seed ? entities.filter((e) => e.id !== seed.id) : entities;
  const nodes: Node[] = [];
  if (seed) {
    nodes.push({ ...seed, x: cx, y: cy, weight: weights.get(seed.id) ?? 1 });
  }
  const n = others.length;
  const radius = Math.min(w, h) * 0.38;
  for (let i = 0; i < n; i++) {
    const angle = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2;
    nodes.push({
      ...others[i],
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
      weight: weights.get(others[i].id) ?? 1,
    });
  }
  return nodes;
}

function kindColor(kind: string): string {
  switch (kind) {
    case "person": return "hsl(var(--primary))";
    case "place":  return "hsl(var(--signal))";
    case "org":    return "hsl(var(--warn))";
    case "topic":  return "hsl(var(--muted-foreground))";
    case "thing":  return "hsl(var(--accent))";
    case "event":  return "hsl(var(--danger))";
    default:       return "hsl(var(--muted-foreground))";
  }
}

type Density = { maxNodes: 12 | 24 | 48; hideWeak: boolean; hideSuggested: boolean };
type Lens = "relations" | "risk" | "decisions" | "clusters";

type SherlockFinding = {
  id: string;
  finding_type: string;
  source_object_id: string | null;
  target_object_id: string | null;
  confidence: string;
  sensitive_flag: boolean;
  status: string;
};
type ActionRow = { id: string; status: string; entity_id?: string | null };

function GraphView({ seedEntityId, windowDays, kinds }: { seedEntityId: string | null; windowDays: CanvasWindow; kinds: Set<CanvasKind> }) {
  const { user } = useAuth();
  const { openEntity } = useEntitySheet();
  const [loading, setLoading] = useState(false);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [weights, setWeights] = useState<Map<string, number>>(new Map());
  const [size, setSize] = useState({ w: 340, h: 460 });
  const [dragId, setDragId] = useState<string | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [density, setDensity] = useState<Density>({ maxNodes: 24, hideWeak: false, hideSuggested: false });
  const [lens, setLens] = useState<Lens>("relations");
  const [findings, setFindings] = useState<SherlockFinding[]>([]);
  const [actionsByEntity, setActionsByEntity] = useState<Map<string, { pending: number; executed: number; risky: number }>>(new Map());
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const r = e.contentRect;
        setSize({ w: Math.max(280, r.width), h: Math.max(380, r.height) });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - windowDays * 86400_000).toISOString();
      const { data: ents } = await supabase
        .from("entities")
        .select("id, display_name, kind, last_seen_at")
        .eq("user_id", user.id)
        .gte("last_seen_at", since)
        .order("last_seen_at", { ascending: false })
        .limit(density.maxNodes);
      let list = (ents ?? []) as Entity[];
      if (kinds.size > 0) list = list.filter((e) => kinds.has(e.kind as CanvasKind));

      const ids = list.map((e) => e.id);
      const w = new Map<string, number>();
      if (ids.length > 0) {
        const { data: links } = await supabase
          .from("entity_links")
          .select("entity_id, source_kind, source_id")
          .in("entity_id", ids)
          .limit(2000);
        const buckets = new Map<string, Set<string>>();
        for (const l of (links ?? []) as any[]) {
          if (!buckets.has(l.entity_id)) buckets.set(l.entity_id, new Set());
          buckets.get(l.entity_id)!.add(`${l.source_kind}:${l.source_id}`);
        }
        for (const [k, v] of buckets) w.set(k, v.size);
      }

      const { data: rels } = await supabase
        .from("entity_relations")
        .select("from_entity_id, to_entity_id, relation, evidence_count, status, source")
        .eq("user_id", user.id)
        .neq("status", "dismissed")
        .in("from_entity_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);

      // Phase 6 — pull pending Sherlock findings tied to the visible entities
      // so the lens views (risk / clusters) can color & cluster nodes.
      let f: SherlockFinding[] = [];
      if (ids.length > 0) {
        const inList = ids.join(",");
        const { data: fdata } = await (supabase as any)
          .from("sherlock_findings")
          .select("id, finding_type, source_object_id, target_object_id, confidence, sensitive_flag, status")
          .eq("user_id", user.id)
          .eq("status", "pending")
          .or(`source_object_id.in.(${inList}),target_object_id.in.(${inList})`)
          .limit(200);
        f = (fdata ?? []) as SherlockFinding[];
      }

      if (!alive) return;
      setEntities(list);
      setWeights(w);
      setRelations((rels ?? []) as Relation[]);
      setFindings(f);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [user, seedEntityId, windowDays, kinds, density.maxNodes]);

  const visibleRelations = useMemo(() => {
    return relations.filter((r) => {
      if (density.hideSuggested && r.status === "suggested") return false;
      if (density.hideWeak && (r.evidence_count ?? 1) < 2 && r.status !== "suggested") return false;
      return true;
    });
  }, [relations, density.hideWeak, density.hideSuggested]);

  const hideLabels = entities.length > 24;

  const nodes = useMemo(
    () => layoutCircular(entities, weights, seedEntityId, size.w, size.h),
    [entities, weights, seedEntityId, size.w, size.h],
  );
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const svgPoint = (e: React.PointerEvent): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const findHover = (x: number, y: number, exceptId?: string): Node | null => {
    for (const n of nodes) {
      if (exceptId && n.id === exceptId) continue;
      const r = 16 + Math.min(8, n.weight);
      const dx = n.x - x; const dy = n.y - y;
      if (dx * dx + dy * dy <= r * r * 1.4) return n;
    }
    return null;
  };
  const onPointerDown = (id: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setDragId(id);
    setPointer(svgPoint(e));
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragId) return;
    const p = svgPoint(e);
    setPointer(p);
    const h = findHover(p.x, p.y, dragId);
    setHoverId(h?.id ?? null);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragId) return;
    const p = svgPoint(e);
    const target = findHover(p.x, p.y, dragId);
    const dragged = dragId;
    setDragId(null);
    setPointer(null);
    setHoverId(null);
    if (!target || target.id === dragged) return;
    relate(dragged, target.id);
  };

  const relate = async (fromId: string, toId: string) => {
    if (!user) return;
    const a = nodeById.get(fromId); const b = nodeById.get(toId);
    if (!a || !b) return;
    const { data: existing } = await supabase
      .from("entity_relations")
      .select("id, evidence_count")
      .eq("user_id", user.id)
      .eq("from_entity_id", fromId)
      .eq("to_entity_id", toId)
      .eq("relation", "related")
      .maybeSingle();
    if (existing?.id) {
      await supabase.from("entity_relations").update({
        evidence_count: (existing.evidence_count ?? 1) + 1,
        last_evidence_at: new Date().toISOString(),
      }).eq("id", existing.id);
    } else {
      await supabase.from("entity_relations").insert({
        user_id: user.id,
        from_entity_id: fromId,
        to_entity_id: toId,
        relation: "related",
        metadata: { source: "canvas_drag" },
      });
    }
    await supabase.from("audit_log").insert({
      user_id: user.id,
      entity_type: "entity_relation",
      event: "entity_relation.drafted",
      payload: { from: fromId, to: toId, source: "canvas_drag" },
    });
    toast.success({ title: `Linked ${a.display_name} → ${b.display_name}` });
    const ids = entities.map((e) => e.id);
    const { data: rels } = await supabase
      .from("entity_relations")
      .select("from_entity_id, to_entity_id, relation, evidence_count, status, source")
      .eq("user_id", user.id)
      .neq("status", "dismissed")
      .in("from_entity_id", ids);
    setRelations((rels ?? []) as Relation[]);
  };

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      {/* Anti-spaghetti toolbar — caps density and hides noise without losing data. */}
      <div className="absolute left-1/2 top-2 z-10 -translate-x-1/2 flex flex-wrap items-center justify-center gap-1 rounded-full bg-surface-elevated/85 px-2 py-1 text-[10px] text-muted-foreground ring-1 ring-border/60 backdrop-blur">
        <span className="px-1 uppercase tracking-wider text-[9px]">density</span>
        {[12, 24, 48].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setDensity((d) => ({ ...d, maxNodes: n as Density["maxNodes"] }))}
            className={cn(
              "rounded-full px-2 py-0.5 ring-1 transition",
              density.maxNodes === n
                ? "bg-primary/15 text-primary ring-primary/40"
                : "bg-muted/30 ring-border/60 hover:bg-muted/50",
            )}
          >
            {n}
          </button>
        ))}
        <span className="mx-1 h-3 w-px bg-border/60" aria-hidden />
        <button
          type="button"
          onClick={() => setDensity((d) => ({ ...d, hideWeak: !d.hideWeak }))}
          className={cn(
            "rounded-full px-2 py-0.5 ring-1 transition",
            density.hideWeak
              ? "bg-primary/15 text-primary ring-primary/40"
              : "bg-muted/30 ring-border/60 hover:bg-muted/50",
          )}
          title="Hide edges with only one piece of evidence"
        >
          hide weak
        </button>
        <button
          type="button"
          onClick={() => setDensity((d) => ({ ...d, hideSuggested: !d.hideSuggested }))}
          className={cn(
            "rounded-full px-2 py-0.5 ring-1 transition",
            density.hideSuggested
              ? "bg-primary/15 text-primary ring-primary/40"
              : "bg-muted/30 ring-border/60 hover:bg-muted/50",
          )}
          title="Hide Sherlock-suggested edges"
        >
          hide suggested
        </button>
      </div>

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}
      {!loading && entities.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-center text-[12px] text-muted-foreground px-6">
          Nothing on the canvas yet. Capture a few things and the graph will fill in.
        </div>
      )}
      {entities.length > 0 && (
        <svg
          ref={svgRef}
          width={size.w}
          height={size.h}
          className="touch-none select-none"
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {visibleRelations.map((r, i) => {
            const a = nodeById.get(r.from_entity_id);
            const b = nodeById.get(r.to_entity_id);
            if (!a || !b) return null;
            const isSuggested = r.status === "suggested";
            return (
              <line
                key={`r${i}`}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke="hsl(var(--primary))"
                strokeOpacity={isSuggested ? 0.55 : 0.35}
                strokeDasharray={isSuggested ? "5 4" : undefined}
                strokeWidth={isSuggested ? 1.25 : 1 + Math.min(2, (r.evidence_count ?? 1) / 3)}
              >
                {isSuggested && <title>Sherlock suggested · tap entity to review</title>}
              </line>
            );
          })}
          {dragId && pointer && nodeById.get(dragId) && (
            <line
              x1={nodeById.get(dragId)!.x}
              y1={nodeById.get(dragId)!.y}
              x2={pointer.x}
              y2={pointer.y}
              stroke="hsl(var(--primary))"
              strokeDasharray="4 3"
              strokeWidth={1.5}
            />
          )}
          {nodes.map((n) => {
            const r = 14 + Math.min(8, n.weight);
            const isDrag = dragId === n.id;
            const isHover = hoverId === n.id && dragId && dragId !== n.id;
            return (
              <g
                key={n.id}
                transform={`translate(${n.x}, ${n.y})`}
                onPointerDown={onPointerDown(n.id)}
                onClick={(e) => {
                  if (dragId) return;
                  e.stopPropagation();
                  openEntity(n.id);
                }}
                style={{ cursor: "pointer" }}
              >
                <circle
                  r={r}
                  fill={kindColor(n.kind)}
                  fillOpacity={isHover ? 0.45 : 0.22}
                  stroke={kindColor(n.kind)}
                  strokeWidth={isDrag || isHover ? 2 : 1.2}
                  strokeOpacity={isDrag || isHover ? 1 : 0.7}
                />
                {!hideLabels && (
                  <text
                    y={r + 11}
                    textAnchor="middle"
                    fontSize={10}
                    className="fill-foreground"
                    style={{ pointerEvents: "none" }}
                  >
                    {n.display_name.length > 14 ? n.display_name.slice(0, 13) + "…" : n.display_name}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-surface-elevated/80 px-3 py-1 text-[10.5px] text-muted-foreground backdrop-blur">
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex items-center gap-1"><Link2 className="h-3 w-3" /> drag to relate · tap to open</span>
          {relations.some((r) => r.status === "suggested") && (
            <span className="inline-flex items-center gap-1 text-primary/80">· dashed = Sherlock suggested</span>
          )}
        </span>
      </div>
    </div>
  );
}

export function CommandCanvas() {
  const { open, openCanvasSeed, seedProjectId, closeCanvas } = useCanvas();
  const [tab, setTab] = useState<"cards" | "timeline" | "flow" | "board" | "graph">("cards");
  const [windowDays, setWindowDays] = useState<CanvasWindow>(30);
  const [kinds, setKinds] = useState<Set<CanvasKind>>(new Set());
  const [projectTitle, setProjectTitle] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!seedProjectId) { setProjectTitle(null); return; }
    (async () => {
      const { data } = await supabase
        .from("projects").select("title").eq("id", seedProjectId).maybeSingle();
      if (!cancelled) setProjectTitle((data as any)?.title ?? null);
    })();
    return () => { cancelled = true; };
  }, [seedProjectId]);

  const scopeLabel = seedProjectId
    ? (projectTitle ? `Scoped to project: ${projectTitle}` : "Scoped to project")
    : openCanvasSeed
    ? "Scoped to entity"
    : "Recent operational view";

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) closeCanvas(); }}>
      <SheetContent side="bottom" className="h-[88vh] rounded-t-2xl p-0 flex flex-col">
        <SheetHeader className="flex flex-row items-center justify-between gap-2 px-4 pt-3 pb-2 shrink-0">
          <div className="min-w-0">
            <SheetTitle className="text-sm">Command Canvas</SheetTitle>
            <p className="text-[11px] text-muted-foreground truncate">{scopeLabel}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={closeCanvas} className="h-7 w-7 p-0">
            <X className="h-4 w-4" />
          </Button>
        </SheetHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-3 grid grid-cols-5 h-8 shrink-0">
            <TabsTrigger value="cards" className="text-[11px]">Cards</TabsTrigger>
            <TabsTrigger value="timeline" className="text-[11px]">Timeline</TabsTrigger>
            <TabsTrigger value="flow" className="text-[11px]">Flow</TabsTrigger>
            <TabsTrigger value="board" className="text-[11px]">Board</TabsTrigger>
            <TabsTrigger value="graph" className="text-[11px]">Graph</TabsTrigger>
          </TabsList>

          <CanvasFilters
            windowDays={windowDays}
            setWindowDays={setWindowDays}
            kinds={kinds}
            setKinds={setKinds}
            showKinds={tab !== "board" && tab !== "flow"}
          />

          <div className="flex-1 min-h-0 mt-2 bg-gradient-to-br from-background to-surface-elevated/30">
            <TabsContent value="cards" className="h-full m-0">
              <CanvasCardsView seedEntityId={openCanvasSeed} windowDays={windowDays} kinds={kinds} />
            </TabsContent>
            <TabsContent value="timeline" className="h-full m-0">
              <CanvasTimelineView seedEntityId={openCanvasSeed} windowDays={windowDays} />
            </TabsContent>
            <TabsContent value="flow" className="h-full m-0">
              <CanvasFlowView seedEntityId={openCanvasSeed} windowDays={windowDays} />
            </TabsContent>
            <TabsContent value="board" className="h-full m-0">
              <CanvasBoardView seedEntityId={openCanvasSeed} windowDays={windowDays} />
            </TabsContent>
            <TabsContent value="graph" className="h-full m-0">
              <GraphView seedEntityId={openCanvasSeed} windowDays={windowDays} kinds={kinds} />
            </TabsContent>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

