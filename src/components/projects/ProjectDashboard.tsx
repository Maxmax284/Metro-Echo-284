// Project dashboard: what's attached to this project across the desks.
// Read-only. Links come from real columns only:
//   documents.project_id, calendar_events.project_id,
//   flight_plans.event_ids ∩ this project's calendar events.
// Money has no project link yet — the tile says so instead of guessing.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, CalendarDays, Plane, Wallet } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

interface Row { id: string; label: string; sub?: string }
interface Data { docs: Row[]; events: Row[]; flights: Row[] }

export function ProjectDashboard({ projectId }: { projectId: string }) {
  const nav = useNavigate();
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    let off = false;
    (async () => {
      const [d, e] = await Promise.all([
        supabase.from("documents").select("id,title,updated_at").eq("project_id", projectId).order("updated_at", { ascending: false }).limit(20),
        supabase.from("calendar_events").select("id,title,starts_at").eq("project_id", projectId).order("starts_at", { ascending: true }).limit(50),
      ]);
      const evRows = e.data ?? [];
      const evIds = evRows.map((r) => r.id);
      let flights: Row[] = [];
      if (evIds.length) {
        const f = await supabase.from("flight_plans").select("id,origin,destination,depart_on").overlaps("event_ids", evIds).order("depart_on").limit(10);
        flights = (f.data ?? []).map((r) => ({ id: r.id, label: `${r.origin} → ${r.destination}`, sub: format(new Date(r.depart_on), "MMM d") }));
      }
      const now = Date.now();
      const upcoming = evRows.filter((r) => new Date(r.starts_at).getTime() >= now - 3600_000);
      if (off) return;
      setData({
        docs: (d.data ?? []).map((r) => ({ id: r.id, label: r.title || "Untitled document" })),
        events: upcoming.map((r) => ({ id: r.id, label: r.title || "Untitled entry", sub: format(new Date(r.starts_at), "MMM d, h:mm a") })),
        flights,
      });
    })();
    return () => { off = true; };
  }, [projectId]);

  const tiles = [
    { key: "docs", icon: FileText, title: "Documents", rows: data?.docs, to: "/documents", empty: "Upload a contract or letter on Documents and pick this project." },
    { key: "sched", icon: CalendarDays, title: "Schedule", rows: data?.events, to: "/?surface=schedule", empty: "Nothing coming up. Entries tied to this project land here." },
    { key: "fly", icon: Plane, title: "Flights", rows: data?.flights, to: "/flights", empty: "Flights show here once their calendar entry belongs to this project." },
    { key: "money", icon: Wallet, title: "Money", rows: [] as Row[], to: "/?surface=schedule", empty: "Money isn't tied to projects yet. Your bank lives on the Money desk." },
  ];

  return (
    <section className="mb-6 rounded-2xl border border-border/60 bg-surface-elevated p-4">
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">On this project</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {tiles.map((t) => {
          const Icon = t.icon;
          const rows = t.rows ?? [];
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => nav(t.to)}
              className="vanta-card min-h-[44px] rounded-xl p-3 text-left transition-transform active:scale-[0.98]"
            >
              <div className="mb-1.5 flex items-center gap-2">
                <Icon className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">{t.title}</span>
                <span className="ml-auto font-mono text-xs text-muted-foreground">{data ? rows.length : "…"}</span>
              </div>
              {data && rows.length === 0 && <p className="text-xs text-muted-foreground">{t.empty}</p>}
              <ul className="space-y-1">
                {rows.slice(0, 3).map((r) => (
                  <li key={r.id} className="flex gap-2 text-xs">
                    <span className="truncate">{r.label}</span>
                    {r.sub && <span className="ml-auto shrink-0 text-muted-foreground">{r.sub}</span>}
                  </li>
                ))}
                {rows.length > 3 && <li className="text-xs text-muted-foreground">+{rows.length - 3} more</li>}
              </ul>
            </button>
          );
        })}
      </div>
    </section>
  );
}
