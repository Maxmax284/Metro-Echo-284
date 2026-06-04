// Connected Accounts — per-user channel pairings (Telegram first; WhatsApp later).
// Each row shows the channel state and a Default Route that says where new
// captures from that channel land: personal, ask each time, or a specific workspace.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, MessageSquare, RefreshCw, Send, Unlink, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/providers/WorkspaceProvider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { formatDistanceToNow } from "date-fns";
import { AftermathFooter } from "@/components/aftermath/AftermathFooter";
import { SherlockHintChip, type SherlockHint } from "@/components/sherlock/SherlockHintChip";
import { useSherlock } from "@/components/sherlock/SherlockContext";
import type { SherlockFinding } from "@/lib/sherlock/types";
import { humanizeChannel, renderPlainLine } from "@/lib/plainEnglish";

type ChannelLink = {
  id: string;
  channel: "telegram" | "whatsapp" | "email";
  status: string;
  default_route: string; // 'personal' | 'ask_each_time' | 'workspace:<uuid>'
  external_channel_id: string | null;
  linked_at: string;
  last_seen_at: string | null;
};

export default function ConnectedAccounts() {
  const { session } = useAuth();
  const { memberships } = useWorkspace();
  const [links, setLinks] = useState<ChannelLink[]>([]);
  const [activity, setActivity] = useState<Record<string, { today: number; pending: number }>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const refresh = async () => {
    if (!session) return;
    setLoading(true);
    const { data } = await supabase
      .from("user_channel_links")
      .select("id, channel, status, default_route, external_channel_id, linked_at, last_seen_at")
      .eq("user_id", session.user.id)
      .order("linked_at", { ascending: false });
    setLinks((data ?? []) as ChannelLink[]);
    // Activity counts per channel (today's captures + pending-route count).
    // Plain receipt counts, scoped by RLS to the current user.
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const { data: routes } = await supabase
      .from("capture_routes")
      .select("source, user_action, created_at")
      .eq("user_id", session.user.id)
      .gte("created_at", startOfToday.toISOString())
      .limit(500);
    const acc: Record<string, { today: number; pending: number }> = {};
    for (const r of routes ?? []) {
      const k = String((r as any).source ?? "unknown");
      const slot = (acc[k] ??= { today: 0, pending: 0 });
      slot.today += 1;
      if ((r as any).user_action === "routed" || (r as any).user_action === "accepted") {
        // landed cleanly — not pending
      } else if ((r as any).user_action === "reviewed" || (r as any).user_action === "snoozed") {
        slot.pending += 1;
      }
    }
    setActivity(acc);
    setLoading(false);
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [session]);

  const setRoute = async (id: string, route: string) => {
    setSavingId(id);
    const { error } = await supabase
      .from("user_channel_links")
      .update({ default_route: route })
      .eq("id", id);
    setSavingId(null);
    if (error) { toast.fromError(error); return; }
    setLinks((rs) => rs.map((r) => (r.id === id ? { ...r, default_route: route } : r)));
    toast.success("Default route updated");
  };

  const disconnect = async (link: ChannelLink) => {
    if (!confirm("Disconnect this channel? Future messages won't reach Vanta until you re-link.")) return;
    setSavingId(link.id);
    if (link.channel === "telegram" && link.external_channel_id) {
      await supabase.from("telegram_chat_links").delete().eq("chat_id", Number(link.external_channel_id));
    }
    await supabase.from("user_channel_links").update({ status: "disconnected" }).eq("id", link.id);
    setSavingId(null);
    await refresh();
  };

  const testMessage = async (link: ChannelLink) => {
    if (link.channel !== "telegram") return;
    setTestingId(link.id);
    try {
      const { error } = await supabase.functions.invoke("telegram-test", { body: {} });
      if (error) throw error;
      toast.success("Test message sent");
    } catch (e: any) {
      toast.fromError(e);
    } finally {
      setTestingId(null);
    }
  };

  if (!session) return <div className="p-8 text-sm text-muted-foreground">Sign in required.</div>;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-6">
      <header className="mb-6 flex items-center gap-3">
        <Link to="/settings" className="inline-flex h-8 w-8 items-center justify-center rounded-md ring-1 ring-border/60 hover:bg-surface-elevated">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-base font-semibold">Connected accounts</h1>
          <p className="text-xs text-muted-foreground">Your private channels. Captures feed Vanta — nothing executes from chat.</p>
        </div>
        <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1 text-[11px]" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </Button>
      </header>

      {loading && links.length === 0 && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      {!loading && links.length === 0 && (
        <Card className="p-4">
          <p className="text-sm text-foreground">No channels connected yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Pair Telegram from <Link to="/settings" className="underline">Settings</Link> — your first message creates the link.
          </p>
        </Card>
      )}

      <div className="space-y-3">
        {links.map((link) => {
          const ev = humanizeChannel(link);
          const needsRoute = link.default_route === "ask_each_time" || !link.default_route;
          return (
          <Card key={link.id} className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium capitalize">{link.channel}</span>
              <Badge variant={link.status === "active" ? "secondary" : "outline"} className="text-[9.5px] uppercase tracking-wider">
                {link.status}
              </Badge>
              <span className="ml-auto text-[10.5px] text-muted-foreground">
                {link.last_seen_at ? `Active ${formatDistanceToNow(new Date(link.last_seen_at), { addSuffix: true })}` : "Not used yet"}
              </span>
            </div>

            <p className="text-[12px] text-foreground/85">{renderPlainLine(ev)}</p>

            {(() => {
              const a = activity[link.channel] ?? { today: 0, pending: 0 };
              if (a.today === 0) {
                return (
                  <p className="text-[11px] text-muted-foreground">
                    Quiet today. Nothing captured from {link.channel} since midnight.
                  </p>
                );
              }
              return (
                <p className="text-[11px] text-foreground/85">
                  Captured {a.today} item{a.today === 1 ? "" : "s"} today
                  {a.pending > 0 ? ` · ${a.pending} still needs routing` : " · all routed"}.
                </p>
              );
            })()}


            <div>
              <div className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">Default route</div>
              <div className="flex flex-wrap gap-1.5">
                <RouteChip
                  active={link.default_route === "personal"}
                  label="Personal"
                  onClick={() => setRoute(link.id, "personal")}
                  disabled={savingId === link.id}
                />
                <RouteChip
                  active={link.default_route === "ask_each_time"}
                  label="Ask each time"
                  onClick={() => setRoute(link.id, "ask_each_time")}
                  disabled={savingId === link.id}
                />
                {memberships.map((m) => {
                  const key = `workspace:${m.organization_id}`;
                  return (
                    <RouteChip
                      key={m.organization_id}
                      active={link.default_route === key}
                      label={m.name}
                      onClick={() => setRoute(link.id, key)}
                      disabled={savingId === link.id}
                    />
                  );
                })}
              </div>
              <p className="mt-1.5 text-[10.5px] text-muted-foreground">
                Where new captures from {link.channel} land by default. Personal stays private to you.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              {link.channel === "telegram" && (
                <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]"
                  onClick={() => testMessage(link)} disabled={testingId === link.id}
                >
                  {testingId === link.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  Send test
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-7 gap-1 text-[11px] text-muted-foreground hover:text-destructive"
                onClick={() => disconnect(link)} disabled={savingId === link.id}
              >
                <Unlink className="h-3 w-3" /> Disconnect
              </Button>
            </div>

            <AftermathFooter
              next={{
                label: needsRoute ? "Pick a default route" : "Review routing options",
                onClick: () => {
                  document.querySelector(`[data-link-id="${link.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                },
                hint: needsRoute
                  ? "Every capture from this channel will ask where to land until you set one."
                  : `Captures from ${link.channel} land in ${
                      link.default_route === "personal" ? "Personal"
                      : link.default_route.startsWith("workspace:")
                        ? (memberships.find((m) => `workspace:${m.organization_id}` === link.default_route)?.name ?? "a workspace")
                        : "Ask each time"
                    }.`,
              }}
              whatHappensIfTap="Opens routing options — nothing sends."
            />
          </Card>
          );
        })}
      </div>
    </div>
  );
}

function RouteChip({ active, label, onClick, disabled }: { active: boolean; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
        active
          ? "border-primary/40 bg-primary/10 text-foreground"
          : "border-border/50 bg-background/40 text-muted-foreground hover:text-foreground hover:border-border",
        disabled ? "opacity-60" : "",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
