// Stage 5 — Privacy & consent panel.
// Inline (no separate Settings surface) so users see it next to the data it governs.
// All defaults are private. Nothing leaves the user's account until they flip a switch.

import { useEffect, useState } from "react";
import { useScope } from "@/hooks/useScope";
import { supabase } from "@/integrations/supabase/client";
import { vantaToast as toast, vantaSay } from "@/lib/vantaVoice";
import { Download, Loader2, ShieldAlert, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Settings = {
  default_share_intent: "private_only" | "ask" | "anonymized_ok";
  ask_before_contributing: boolean;
  sensitive_by_default: boolean;
  allow_shared_aggregation: boolean;
};

const DEFAULTS: Settings = {
  default_share_intent: "private_only",
  ask_before_contributing: true,
  sensitive_by_default: false,
  allow_shared_aggregation: false,
};

export function PrivacySettingsPanel() {
  const { applyScope } = useScope();
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [working, setWorking] = useState<"export" | "delete" | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setLoading(false); return; }
      const { data } = await supabase
        .from("privacy_settings")
        .select("default_share_intent, ask_before_contributing, sensitive_by_default, allow_shared_aggregation")
        .eq("user_id", u.user.id)
        .maybeSingle();
      if (data) setSettings(data as Settings);
      setLoading(false);
    })();
  }, []);

  const save = async (next: Partial<Settings>) => {
    const merged = { ...settings, ...next };
    setSettings(merged);
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setSaving(false); return; }
    const { error } = await supabase
      .from("privacy_settings")
      .upsert({ user_id: u.user.id, ...merged }, { onConflict: "user_id" });
    setSaving(false);
    if (error) toast.error(vantaSay.couldntSave());
  };

  const exportAll = async () => {
    setWorking("export");
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in.");
      const [c, f] = await Promise.all([
        applyScope(supabase.from("corrections").select("*")),
        applyScope(supabase.from("field_notes").select("*")),
      ]);
      const blob = new Blob(
        [JSON.stringify({ exported_at: new Date().toISOString(), corrections: c.data ?? [], field_notes: f.data ?? [] }, null, 2)],
        { type: "application/json" },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vanta-corrections-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(vantaSay.exported());
    } catch (e: any) {
      toast.error(vantaSay.couldntExport());
    } finally {
      setWorking(null);
    }
  };

  const deleteAll = async () => {
    if (!confirm("Delete ALL corrections and field notes? This can't be undone.")) return;
    if (!confirm("Really delete everything?")) return;
    setWorking("delete");
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in.");
      const [c, f] = await Promise.all([
        supabase.from("corrections").delete().eq("user_id", u.user.id),
        supabase.from("field_notes").delete().eq("user_id", u.user.id),
      ]);
      if (c.error) throw c.error;
      if (f.error) throw f.error;
      toast.success(vantaSay.deleted());
    } catch (e: any) {
      toast.error(vantaSay.couldntDelete());
    } finally {
      setWorking(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-surface-elevated/40 px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading privacy settings…
      </div>
    );
  }

  return (
    <details className="group rounded-xl border border-border/60 bg-surface-elevated/40 ring-1 ring-border/50">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs text-foreground/90 [&::-webkit-details-marker]:hidden">
        <ShieldAlert className="h-3.5 w-3.5 text-warn" />
        <span className="font-medium">Privacy & consent</span>
        <span className="text-muted-foreground">· private by default</span>
        {saving && <Loader2 className="ml-auto h-3 w-3 animate-spin opacity-60" />}
      </summary>

      <div className="space-y-3 border-t border-border/60 px-3 py-3 text-xs">
        <Row
          label="Default share intent for new field notes"
          hint="Even when set higher, no sharing happens until aggregation is enabled."
        >
          <select
            value={settings.default_share_intent}
            onChange={(e) => save({ default_share_intent: e.target.value as Settings["default_share_intent"] })}
            className="rounded border border-border/60 bg-background px-1.5 py-0.5 text-[11px]"
          >
            <option value="private_only">Private only</option>
            <option value="ask">Ask first</option>
            <option value="anonymized_ok">Anonymized OK</option>
          </select>
        </Row>

        <Toggle
          label="Ask before contributing to shared intelligence"
          checked={settings.ask_before_contributing}
          onChange={(v) => save({ ask_before_contributing: v })}
        />
        <Toggle
          label="Mark new field notes as sensitive by default"
          checked={settings.sensitive_by_default}
          onChange={(v) => save({ sensitive_by_default: v })}
        />
        <Toggle
          label="Allow shared aggregation (off — pipeline not enabled)"
          checked={settings.allow_shared_aggregation}
          onChange={(v) => save({ allow_shared_aggregation: v })}
        />

        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
          <button
            onClick={exportAll}
            disabled={working !== null}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] ring-1 ring-border/60 hover:bg-muted/40 disabled:opacity-50"
          >
            {working === "export" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
            Export JSON
          </button>
          <button
            onClick={deleteAll}
            disabled={working !== null}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-danger ring-1 ring-danger/30 hover:bg-danger/10 disabled:opacity-50"
          >
            {working === "delete" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            Delete all
          </button>
        </div>
      </div>
    </details>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-foreground/90">{label}</div>
        {hint && <div className="mt-0.5 text-[10.5px] text-muted-foreground">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span className="text-foreground/90">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-4 w-7 shrink-0 rounded-full ring-1 transition-colors",
          checked ? "bg-primary/80 ring-primary/40" : "bg-muted/50 ring-border/60",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-3 w-3 rounded-full bg-background transition-all",
            checked ? "left-3" : "left-0.5",
          )}
        />
      </button>
    </label>
  );
}
