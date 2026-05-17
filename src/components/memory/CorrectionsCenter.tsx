// Stage 4 — Corrections Center.
// Review and prune what Vanta learned from you.
// Lives inside MemorySurface as a swappable view.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Archive, Clock, MapPin, AlertTriangle, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PrivacySettingsPanel } from "./PrivacySettingsPanel";

type Correction = {
  id: string;
  surface: string;
  target_type: string;
  target_id: string;
  feedback_type: string;
  user_note: string | null;
  confidence_impact: string;
  status: string;
  created_at: string;
};

type FieldNote = {
  id: string;
  note_type: string;
  summary: string;
  details: string | null;
  location_label: string | null;
  confidence: string;
  freshness: string;
  status: string;
  expires_at: string | null;
  created_at: string;
};

type Tab = "corrections" | "field_notes";

const FEEDBACK_TONE: Record<string, string> = {
  wrong:      "text-danger ring-danger/30 bg-danger/10",
  reject:     "text-danger ring-danger/30 bg-danger/10",
  outdated:   "text-warn ring-warn/30 bg-warn/10",
  source_bad: "text-warn ring-warn/30 bg-warn/10",
  useful:     "text-primary ring-primary/30 bg-primary/10",
  correct:    "text-primary ring-primary/30 bg-primary/10",
  override:   "text-accent ring-accent/30 bg-accent/10",
  risk_adjust:"text-warn ring-warn/30 bg-warn/10",
  style:      "text-muted-foreground ring-border/60 bg-muted/30",
  not_useful: "text-muted-foreground ring-border/60 bg-muted/30",
};

export function CorrectionsCenter() {
  const [tab, setTab] = useState<Tab>("corrections");
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [notes, setNotes] = useState<FieldNote[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  const load = async () => {
    setLoading(true);
    const [c, n] = await Promise.all([
      supabase
        .from("corrections")
        .select("id, surface, target_type, target_id, feedback_type, user_note, confidence_impact, status, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("field_notes")
        .select("id, note_type, summary, details, location_label, confidence, freshness, status, expires_at, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    setCorrections((c.data ?? []) as Correction[]);
    setNotes((n.data ?? []) as FieldNote[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const setCorrectionStatus = async (id: string, status: "archived" | "active") => {
    setBusy(id);
    const { error } = await supabase.from("corrections").update({ status }).eq("id", id);
    setBusy(null);
    if (error) { toast.error("Couldn't update", { description: error.message }); return; }
    setCorrections((p) => p.map((c) => (c.id === id ? { ...c, status } : c)));
    toast.success(status === "archived" ? "Archived." : "Restored.");
  };

  const setNoteStatus = async (id: string, status: "archived" | "active" | "expired") => {
    setBusy(id);
    const { error } = await supabase.from("field_notes").update({ status }).eq("id", id);
    setBusy(null);
    if (error) { toast.error("Couldn't update", { description: error.message }); return; }
    setNotes((p) => p.map((n) => (n.id === id ? { ...n, status } : n)));
    toast.success(status === "archived" ? "Archived." : status === "expired" ? "Marked expired." : "Restored.");
  };

  const deleteNote = async (id: string) => {
    if (!confirm("Delete this field note? This can't be undone.")) return;
    setBusy(id);
    const { error } = await supabase.from("field_notes").delete().eq("id", id);
    setBusy(null);
    if (error) { toast.error("Couldn't delete", { description: error.message }); return; }
    setNotes((p) => p.filter((n) => n.id !== id));
    toast.success("Deleted.");
  };

  const visibleCorrections = corrections.filter((c) => showArchived || c.status === "active");
  const visibleNotes = notes.filter((n) => showArchived || n.status === "active");

  return (
    <div className="flex h-full flex-col gap-2">
      <PrivacySettingsPanel />
      {/* Header strip */}
      <div className="flex items-center gap-2 px-1 pb-2">
        <button
          onClick={() => setTab("corrections")}
          className={cn(
            "rounded-full px-2.5 py-0.5 text-[11px] ring-1 transition-colors",
            tab === "corrections"
              ? "bg-primary/15 text-primary ring-primary/40"
              : "bg-muted/30 text-muted-foreground ring-border/60 hover:bg-muted/50",
          )}
        >
          Corrections <span className="opacity-60">· {corrections.filter((c) => c.status === "active").length}</span>
        </button>
        <button
          onClick={() => setTab("field_notes")}
          className={cn(
            "rounded-full px-2.5 py-0.5 text-[11px] ring-1 transition-colors",
            tab === "field_notes"
              ? "bg-primary/15 text-primary ring-primary/40"
              : "bg-muted/30 text-muted-foreground ring-border/60 hover:bg-muted/50",
          )}
        >
          Field notes <span className="opacity-60">· {notes.filter((n) => n.status === "active").length}</span>
        </button>
        <label className="ml-auto flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-3 w-3"
          />
          Show archived
        </label>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : tab === "corrections" ? (
        visibleCorrections.length === 0 ? (
          <EmptyState icon={<AlertTriangle className="h-4 w-4 opacity-60" />} label="No corrections yet. Vanta will list things you've marked wrong, outdated, or useful here." />
        ) : (
          <ul className="space-y-2">
            {visibleCorrections.map((c) => (
              <li
                key={c.id}
                className={cn(
                  "rounded-xl border border-border/60 bg-surface-elevated/40 p-3 ring-1 ring-border/50",
                  c.status !== "active" && "opacity-60",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className={cn(
                        "rounded-full px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider ring-1",
                        FEEDBACK_TONE[c.feedback_type] ?? "text-muted-foreground ring-border/60 bg-muted/30",
                      )}>
                        {c.feedback_type.replace(/_/g, " ")}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {c.surface} · {c.target_type}
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-snug text-foreground/90">
                      {c.target_id}
                    </p>
                    {c.user_note && (
                      <p className="mt-1 text-xs text-muted-foreground">"{c.user_note}"</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  {c.status === "active" ? (
                    <button
                      onClick={() => setCorrectionStatus(c.id, "archived")}
                      disabled={busy === c.id}
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ring-1 ring-border/60 hover:bg-muted/40 disabled:opacity-50"
                    >
                      <Archive className="h-2.5 w-2.5" /> Archive
                    </button>
                  ) : (
                    <button
                      onClick={() => setCorrectionStatus(c.id, "active")}
                      disabled={busy === c.id}
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ring-1 ring-border/60 hover:bg-muted/40 disabled:opacity-50"
                    >
                      Restore
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )
      ) : visibleNotes.length === 0 ? (
        <EmptyState icon={<MapPin className="h-4 w-4 opacity-60" />} label="No field notes yet. Tap 'Note' on any signal to add lived context for a place." />
      ) : (
        <ul className="space-y-2">
          {visibleNotes.map((n) => (
            <li
              key={n.id}
              className={cn(
                "rounded-xl border border-border/60 bg-surface-elevated/40 p-3 ring-1 ring-border/50",
                n.status !== "active" && "opacity-60",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider text-accent ring-1 ring-accent/30">
                      {n.note_type.replace(/_/g, " ")}
                    </span>
                    {n.location_label && (
                      <span className="text-[10px] text-muted-foreground">@ {n.location_label}</span>
                    )}
                    <span className="text-[10px] text-muted-foreground">· {n.confidence}</span>
                  </div>
                  <p className="mt-1 text-sm leading-snug text-foreground/90">{n.summary}</p>
                  {n.details && (
                    <p className="mt-1 text-xs text-muted-foreground">{n.details}</p>
                  )}
                </div>
                <div className="shrink-0 text-right text-[10px] text-muted-foreground">
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                {n.status === "active" && (
                  <>
                    <button
                      onClick={() => setNoteStatus(n.id, "expired")}
                      disabled={busy === n.id}
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ring-1 ring-border/60 hover:bg-muted/40 disabled:opacity-50"
                    >
                      <Clock className="h-2.5 w-2.5" /> Mark expired
                    </button>
                    <button
                      onClick={() => setNoteStatus(n.id, "archived")}
                      disabled={busy === n.id}
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ring-1 ring-border/60 hover:bg-muted/40 disabled:opacity-50"
                    >
                      <Archive className="h-2.5 w-2.5" /> Archive
                    </button>
                  </>
                )}
                {n.status !== "active" && (
                  <button
                    onClick={() => setNoteStatus(n.id, "active")}
                    disabled={busy === n.id}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ring-1 ring-border/60 hover:bg-muted/40 disabled:opacity-50"
                  >
                    Restore
                  </button>
                )}
                <button
                  onClick={() => deleteNote(n.id)}
                  disabled={busy === n.id}
                  className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-danger ring-1 ring-danger/30 hover:bg-danger/10 disabled:opacity-50"
                >
                  <Trash2 className="h-2.5 w-2.5" /> Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border/60 py-10 text-center text-sm text-muted-foreground">
      <div className="mx-auto mb-2 flex justify-center">{icon}</div>
      {label}
    </div>
  );
}
