// RecapSettingsPanel — Phase 5 (Recap Intelligence)
// Daily / Weekly / Monthly recap controls. Drafts ride brief_exports.
// Generate-now is user-tap only. No automatic execution.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Telescope, ChevronDown, ChevronUp, CalendarRange, CalendarDays } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { vantaToast as toast } from "@/lib/vantaVoice";

type RecapRow = {
  id: string;
  title: string;
  subtitle: string | null;
  scope_kind: string;
  format: string;
  brief: any;
  created_at: string;
};

type RecapPrefs = {
  weekly_enabled?: boolean;
  monthly_enabled?: boolean;
  include_quiet?: boolean;
  include_sherlock?: boolean;
  include_research?: boolean;
};

const DEFAULTS: Required<RecapPrefs> = {
  weekly_enabled: true,
  monthly_enabled: true,
  include_quiet: true,
  include_sherlock: true,
  include_research: true,
};

export function RecapSettingsPanel() {
  const { session } = useAuth();
  const { prefs, update } = useUserPreferences();
  const [rows, setRows] = useState<RecapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"weekly" | "monthly" | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const recap: Required<RecapPrefs> = {
    ...DEFAULTS,
    ...(((prefs as any).recap ?? {}) as RecapPrefs),
  };

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    const { data } = await supabase
      .from("brief_exports")
      .select("id,title,subtitle,scope_kind,format,brief,created_at")
      .eq("user_id", session.user.id)
      .in("scope_kind", ["recap_weekly", "recap_monthly"])
      .order("created_at", { ascending: false })
      .limit(10);
    setRows((data ?? []) as unknown as RecapRow[]);
    setLoading(false);
  }, [session]);

  useEffect(() => { void load(); }, [load]);

  async function setRecap(patch: Partial<RecapPrefs>) {
    const next = { ...recap, ...patch };
    await update({ ...(prefs as any), recap: next } as any);
  }

  async function generate(period: "weekly" | "monthly") {
    setBusy(period);
    try {
      const { data, error } = await supabase.functions.invoke("recap-compose", {
        body: { period },
      });
      if (error) throw error;
      toast.success({
        title: period === "weekly" ? "Weekly recap ready." : "Monthly review ready.",
        description: "Saved under recaps. Tap Read to open.",
      });
      await load();
      if ((data as any)?.brief_export_id) setExpanded((data as any).brief_export_id);
    } catch (e: any) {
      toast.fromError(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Recaps</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Daily Bulletin lives in Command Center. Weekly and Monthly recaps are saved here
            on demand. Nothing runs without your tap.
          </p>
        </div>
      </div>

      {/* Toggles */}
      <ul className="mt-3 divide-y divide-border/40">
        <li className="flex items-start justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <div className="text-xs font-medium">Weekly recap</div>
            <div className="text-[11px] text-muted-foreground">
              What actually happened this week. Saved as a draft you can read or export.
            </div>
          </div>
          <Switch
            checked={recap.weekly_enabled}
            onCheckedChange={(v) => setRecap({ weekly_enabled: v })}
          />
        </li>
        <li className="flex items-start justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <div className="text-xs font-medium">Monthly review</div>
            <div className="text-[11px] text-muted-foreground">
              What bigger pattern is forming. Includes quiet projects and recurring themes.
            </div>
          </div>
          <Switch
            checked={recap.monthly_enabled}
            onCheckedChange={(v) => setRecap({ monthly_enabled: v })}
          />
        </li>
        <li className="flex items-start justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <div className="text-xs font-medium">Include quiet projects</div>
            <div className="text-[11px] text-muted-foreground">Surface projects with no movement.</div>
          </div>
          <Switch
            checked={recap.include_quiet}
            onCheckedChange={(v) => setRecap({ include_quiet: v })}
          />
        </li>
        <li className="flex items-start justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <div className="text-xs font-medium">Include noticed themes</div>
            <div className="text-[11px] text-muted-foreground">
              Repeated topics and possible duplicates Echo spotted across your notes.
            </div>
          </div>
          <Switch
            checked={recap.include_sherlock}
            onCheckedChange={(v) => setRecap({ include_sherlock: v })}
          />
        </li>
        <li className="flex items-start justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <div className="text-xs font-medium">Include outside research</div>
            <div className="text-[11px] text-muted-foreground">Research briefs added during the period.</div>
          </div>
          <Switch
            checked={recap.include_research}
            onCheckedChange={(v) => setRecap({ include_research: v })}
          />
        </li>
      </ul>

      {/* Generate buttons */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={!recap.weekly_enabled || busy !== null}
          onClick={() => generate("weekly")}
        >
          {busy === "weekly" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarRange className="h-3.5 w-3.5" />}
          Generate weekly now
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={!recap.monthly_enabled || busy !== null}
          onClick={() => generate("monthly")}
        >
          {busy === "monthly" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarDays className="h-3.5 w-3.5" />}
          Generate monthly now
        </Button>
      </div>

      {/* Recent recaps */}
      <div className="mt-5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
          Recent recaps
        </div>
        {loading ? (
          <div className="mt-2 flex items-center gap-2 text-[12px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <p className="mt-2 text-[12px] text-muted-foreground">No recaps saved yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {rows.map((r) => {
              const isOpen = expanded === r.id;
              const sections: Array<{ id?: string; heading?: string; body?: string }> =
                Array.isArray(r.brief?.sections) ? r.brief.sections : [];
              const periodLabel = r.scope_kind === "recap_weekly" ? "Weekly" : "Monthly";
              return (
                <li
                  key={r.id}
                  className="rounded-md border border-border/50 bg-surface-elevated/40 p-3"
                >
                  <div className="flex items-start gap-3">
                    <Telescope className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] font-medium text-foreground">{r.title}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted-foreground">
                        <span>{periodLabel} recap</span>
                        <span>·</span>
                        <span>{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</span>
                        <Badge variant="secondary" className="text-[9.5px]">saved</Badge>
                      </div>
                      {r.subtitle && (
                        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{r.subtitle}</div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 text-[11px]"
                      onClick={() => setExpanded(isOpen ? null : r.id)}
                      aria-expanded={isOpen}
                    >
                      {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      <span className="hidden sm:inline">{isOpen ? "Hide" : "Read"}</span>
                    </Button>
                  </div>
                  {isOpen && (
                    <div className="mt-3 space-y-3 border-t border-border/40 pt-3">
                      {sections
                        .filter((s) => {
                          if (s.id === "quiet_areas" && !recap.include_quiet) return false;
                          if (s.id === "sherlock_patterns" && !recap.include_sherlock) return false;
                          if (s.id === "research_activity" && !recap.include_research) return false;
                          return true;
                        })
                        .map((s, i) => (
                          <div key={s.id || i}>
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                              {s.heading || "Section"}
                            </div>
                            <div className="mt-0.5 whitespace-pre-wrap text-[12.5px] text-foreground/90">
                              {s.body || "—"}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
