import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useSystemControls, type SystemControls } from "@/hooks/useSystemControls";
import { Switch } from "@/components/ui/switch";
import { Radio, Building2, Dumbbell, ShieldCheck } from "lucide-react";

type Source = {
  key: keyof Pick<SystemControls, "gth_enabled" | "campcore_enabled" | "fenrir_enabled">;
  label: string;
  icon: typeof Radio;
  hint: string;
  webhook?: string;          // function name to show as endpoint
  auditPrefix: string;       // audit_log event prefix
  ready: boolean;            // is the adapter shipped?
};

const SOURCES: Source[] = [
  {
    key: "gth_enabled",
    label: "Ground Truth Hub",
    icon: Building2,
    hint: "Bookings, guest requests, room notes, payments and check-ins from your properties land as captures.",
    webhook: "gth-inbound",
    auditPrefix: "ecosystem.gth.",
    ready: true,
  },
  {
    key: "campcore_enabled",
    label: "CampCore (gyms)",
    icon: Dumbbell,
    hint: "Member requests land as captures. Coaches read, managers approve drafts — nothing books from chat.",
    webhook: "campcore-inbound",
    auditPrefix: "ecosystem.campcore.",
    ready: true,
  },
  {
    key: "fenrir_enabled",
    label: "Fenrir Lock",
    icon: ShieldCheck,
    hint: "Security alerts land as high-priority captures for your review.",
    webhook: "fenrir-inbound",
    auditPrefix: "ecosystem.fenrir.",
    ready: true,
  },
];

type Counts = Record<string, { count7d: number; lastAt: string | null }>;

export function EcosystemSourcesPanel() {
  const { session } = useAuth();
  const { controls, update } = useSystemControls();
  const [counts, setCounts] = useState<Counts>({});
  const [webhookBase, setWebhookBase] = useState<string>("");

  useEffect(() => {
    setWebhookBase(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1`);
  }, []);

  useEffect(() => {
    if (!session) return;
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    (async () => {
      const next: Counts = {};
      for (const s of SOURCES) {
        const { data } = await supabase
          .from("audit_log")
          .select("created_at")
          .eq("user_id", session.user.id)
          .like("event", `${s.auditPrefix}%`)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(500);
        const rows = data ?? [];
        next[s.key] = {
          count7d: rows.length,
          lastAt: rows[0]?.created_at ?? null,
        };
      }
      setCounts(next);
    })();
  }, [session]);

  if (!controls) return null;

  return (
    <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
      <div className="mb-1 flex items-center gap-2">
        <Radio className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Ecosystem sources</h2>
      </div>
      <p className="mb-3 text-[12px] text-muted-foreground">
        Read-only adapters. Every event lands in the Capture Inbox for review — nothing executes.
      </p>
      <ul className="divide-y divide-border/40">
        {SOURCES.map((s) => {
          const enabled = !!controls[s.key];
          const c = counts[s.key];
          const url = s.webhook ? `${webhookBase}/${s.webhook}` : null;
          return (
            <li key={s.key} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <s.icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">{s.label}</span>
                    {!s.ready && (
                      <span className="rounded-full bg-muted/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground ring-1 ring-border/40">
                        Coming
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{s.hint}</div>
                </div>
                <Switch
                  checked={enabled}
                  disabled={!s.ready}
                  onCheckedChange={(v) => update({ [s.key]: v } as Partial<SystemControls>).catch(() => {})}
                />
              </div>
              {s.ready && (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <span>
                    Last event:{" "}
                    <span className="text-foreground/80">
                      {c?.lastAt ? new Date(c.lastAt).toLocaleString() : "—"}
                    </span>
                  </span>
                  <span>
                    7d captures: <span className="text-foreground/80">{c?.count7d ?? 0}</span>
                  </span>
                  {url && (
                    <span className="break-all">
                      Webhook:{" "}
                      <code className="rounded bg-background/60 px-1 py-0.5 ring-1 ring-border/40">{url}</code>
                    </span>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[11px] text-muted-foreground">
        LMT Camp State uses source key <code className="rounded bg-background/60 px-1 py-0.5 ring-1 ring-border/40">ground_truth_hub</code>{" "}
        and HMAC SHA-256. Sign the exact raw JSON body with{" "}
        <code className="rounded bg-background/60 px-1 py-0.5 ring-1 ring-border/40">GTH_WEBHOOK_SECRET</code>{" "}
        and send as <code className="rounded bg-background/60 px-1 py-0.5 ring-1 ring-border/40">x-gth-signature: sha256=&lt;hex&gt;</code>.
        Body must include <code>source_platform</code>, <code>event_type</code>, <code>event_id</code>, <code>user_id</code>, and <code>payload</code>.
      </p>
    </section>
  );
}
