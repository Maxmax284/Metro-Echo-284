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

type Entity = { id: string; display_name: string; kind: string; last_seen_at: string };
type Relation = { from_entity_id: string; to_entity_id: string; relation: string; evidence_count: number };

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

function GraphView({ seedEntityId }: { seedEntityId: string | null }) {
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
      const since = new Date(Date.now() - 30 * 86400_000).toISOString();
      const { data: ents } = await supabase
        .from("entities")
        .select("id, display_name, kind, last_seen_at")
        .eq("user_id", user.id)
        .gte("last_seen_at", since)
        .order("last_seen_at", { ascending: false })
        .limit(24);
      const list = (ents ?? []) as Entity[];

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
        .select("from_entity_id, to_entity_id, relation, evidence_count")
        .eq("user_id", user.id)
        .in("from_entity_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);

      if (!alive) return;
      setEntities(list);
      setWeights(w);
      setRelations((rels ?? []) as Relation[]);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [user, seedEntityId]);

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
      .select("from_entity_id, to_entity_id, relation, evidence_count")
      .eq("user_id", user.id)
      .in("from_entity_id", ids);
    setRelations((rels ?? []) as Relation[]);
  };

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
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
          {relations.map((r, i) => {
            const a = nodeById.get(r.from_entity_id);
            const b = nodeById.get(r.to_entity_id);
            if (!a || !b) return null;
            return (
              <line
                key={`r${i}`}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke="hsl(var(--primary))"
                strokeOpacity={0.35}
                strokeWidth={1 + Math.min(2, (r.evidence_count ?? 1) / 3)}
              />
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
                <text
                  y={r + 11}
                  textAnchor="middle"
                  fontSize={10}
                  className="fill-foreground"
                  style={{ pointerEvents: "none" }}
                >
                  {n.display_name.length > 14 ? n.display_name.slice(0, 13) + "…" : n.display_name}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-surface-elevated/80 px-3 py-1 text-[10.5px] text-muted-foreground backdrop-blur">
        <span className="inline-flex items-center gap-1"><Link2 className="h-3 w-3" /> drag to relate · tap to open</span>
      </div>
    </div>
  );
}

export function CommandCanvas() {
  const { open, openCanvasSeed, closeCanvas } = useCanvas();
  const [tab, setTab] = useState<"cards" | "timeline" | "board" | "graph">("cards");

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) closeCanvas(); }}>
      <SheetContent side="bottom" className="h-[88vh] rounded-t-2xl p-0 flex flex-col">
        <SheetHeader className="flex flex-row items-center justify-between gap-2 px-4 pt-3 pb-2 shrink-0">
          <div className="min-w-0">
            <SheetTitle className="text-sm">Command Canvas</SheetTitle>
            <p className="text-[11px] text-muted-foreground truncate">
              {openCanvasSeed ? "Scoped to entity" : "Recent operational view"}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={closeCanvas} className="h-7 w-7 p-0">
            <X className="h-4 w-4" />
          </Button>
        </SheetHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-3 grid grid-cols-4 h-8 shrink-0">
            <TabsTrigger value="cards" className="text-[11px]">Cards</TabsTrigger>
            <TabsTrigger value="timeline" className="text-[11px]">Timeline</TabsTrigger>
            <TabsTrigger value="board" className="text-[11px]">Board</TabsTrigger>
            <TabsTrigger value="graph" className="text-[11px]">Graph</TabsTrigger>
          </TabsList>

          <div className="flex-1 min-h-0 mt-2 bg-gradient-to-br from-background to-surface-elevated/30">
            <TabsContent value="cards" className="h-full m-0">
              <CanvasCardsView seedEntityId={openCanvasSeed} />
            </TabsContent>
            <TabsContent value="timeline" className="h-full m-0">
              <CanvasTimelineView seedEntityId={openCanvasSeed} />
            </TabsContent>
            <TabsContent value="board" className="h-full m-0">
              <CanvasBoardView seedEntityId={openCanvasSeed} />
            </TabsContent>
            <TabsContent value="graph" className="h-full m-0">
              <GraphView seedEntityId={openCanvasSeed} />
            </TabsContent>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
