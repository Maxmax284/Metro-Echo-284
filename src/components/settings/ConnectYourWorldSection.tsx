// ConnectYourWorldSection — every way the outside world reaches Vanta, in one
// place, each with one honest state and a proof line under it.
//
// Doctrine:
//  - Not a room. This is the maintenance bay in Settings.
//  - One word per connection, backed by something Vanta actually recorded.
//    "Connected" without a last-received time is a claim, so we do not say it.
//  - Off means off. A missing reading is a gap, never a zero.
//  - Nothing here executes anything: capture paths feed the system only.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity, CalendarClock, Mail, MessageSquare, Plug, RefreshCw, Building2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useSystemControls } from "@/hooks/useSystemControls";
import { useSecretsStatus } from "@/hooks/useSecretsStatus";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SensorKey } from "@/lib/awareness";
import {
  CONN_LABEL, CONN_LAMP, CONN_TONE, DEVICE_FAMILIES, calendarCard, emailCard, platformCard,
  telegramCard, wearableCard, type ConnectionCard,
} from "@/lib/connections";
import { LoadingState } from "@/components/ui/state-views";

type Reading = {
  telegramLinked: boolean;
  telegramLastIn: string | null;
  emailActive: boolean;
  emailLastReceived: string | null;
  feeds: number;
  activeFeeds: number;
  brokenFeeds: number;
  calendarLastSync: string | null;
  wearableLastAt: string | null;
  wearableLastSource: string | null;
  hubLastAt: string | null;
};

const EMPTY: Reading = {
  telegramLinked: false, telegramLastIn: null,
  emailActive: false, emailLastReceived: null,
  feeds: 0, activeFeeds: 0, brokenFeeds: 0, calendarLastSync: null,
  wearableLastAt: null, wearableLastSource: null, hubLastAt: null,
};

function StateChip({ card }: { card: ConnectionCard }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ring-1",
        CONN_TONE[card.state],
      )}
    >
      {CONN_LABEL[card.state]}
    </span>
  );
}

function ConnectionRow({
  card,
  icon: Icon,
  href,
  action,
}: {
  card: ConnectionCard;
  icon: typeof Plug;
  href?: string;
  action?: { label: string; to: string };
}) {
  return (
    <li className="vanta-cut relative rounded-lg bg-muted/20 p-3 pl-4 ring-1 ring-border/40">
      {/* One status lamp: the panel reading you can take without reading. */}
      <span
        className={cn(
          "absolute left-1.5 top-3.5 h-1.5 w-1.5 rounded-full",
          CONN_LAMP[card.state],
        )}
        aria-hidden="true"
      />
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 flex-1 text-[12.5px] font-medium">{card.label}</span>
            <StateChip card={card} />
          </div>
          <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{card.blurb}</p>
          <p className="mt-1 font-mono text-[10.5px] text-foreground/75">{card.proof}</p>
          {card.facts?.length ? (
            <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground/85">
              {card.facts.join(" · ")}
            </p>
          ) : null}
          {card.fix ? (
            <p className="mt-1 text-[11px] leading-snug text-amber-300/90">{card.fix}</p>
          ) : null}
          {(action ?? href) ? (
            <Link
              to={action?.to ?? href!}
              className="vanta-focus mt-2 inline-flex min-h-[36px] items-center rounded-md bg-primary/12 px-2.5 text-[11.5px] font-medium text-primary ring-1 ring-primary/25 hover:bg-primary/18"
            >
              {action?.label ?? "Open"} →
            </Link>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function ConnectYourWorldSection() {
  const { session } = useAuth();
  const { prefs } = useUserPreferences();
  const { controls } = useSystemControls();
  const { status: secrets } = useSecretsStatus(!!session);
  const [r, setR] = useState<Reading>(EMPTY);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    const uid = session.user.id;
    const [tg, tgIn, mail, feeds, wear, hub] = await Promise.all([
      supabase.from("telegram_chat_links").select("id").eq("user_id", uid).limit(1),
      supabase.from("audit_log").select("created_at").eq("user_id", uid)
        .eq("event", "telegram.message_in").order("created_at", { ascending: false }).limit(1),
      supabase.from("email_inbound_addresses").select("active, last_received_at")
        .eq("user_id", uid).order("created_at", { ascending: false }).limit(5),
      supabase.from("calendar_feeds").select("active, last_synced_at, last_error"),
      supabase.from("wearable_readings").select("measured_at, source")
        .order("measured_at", { ascending: false }).limit(1),
      supabase.from("audit_log").select("created_at").eq("user_id", uid)
        .like("event", "ecosystem.gth.%").order("created_at", { ascending: false }).limit(1),
    ]);

    const mailRows = mail.data ?? [];
    const feedRows = (feeds.data ?? []) as Array<{ active: boolean; last_synced_at: string | null; last_error: string | null }>;
    const syncs = feedRows.map((f) => f.last_synced_at).filter(Boolean).sort() as string[];

    setR({
      telegramLinked: (tg.data ?? []).length > 0,
      telegramLastIn: tgIn.data?.[0]?.created_at ?? null,
      emailActive: mailRows.some((m: { active: boolean }) => m.active),
      emailLastReceived:
        mailRows.map((m: { last_received_at: string | null }) => m.last_received_at)
          .filter(Boolean).sort().slice(-1)[0] ?? null,
      feeds: feedRows.length,
      activeFeeds: feedRows.filter((f) => f.active).length,
      brokenFeeds: feedRows.filter((f) => !!f.last_error).length,
      calendarLastSync: syncs.length ? syncs[syncs.length - 1] : null,
      wearableLastAt: wear.data?.[0]?.measured_at ?? null,
      wearableLastSource: wear.data?.[0]?.source ?? null,
      hubLastAt: hub.data?.[0]?.created_at ?? null,
    });
    setLoading(false);
  }, [session]);

  useEffect(() => { void load(); }, [load]);

  const consent = (prefs.sensor_consent ?? {}) as Partial<Record<SensorKey, boolean>>;

  const cards: Array<{ card: ConnectionCard; icon: typeof Plug; action?: { label: string; to: string } }> = [
    {
      card: telegramCard({
        linked: r.telegramLinked,
        lastInAt: r.telegramLastIn,
        captureOn: true,
        remindersOn: !!prefs.telegram_reminders_enabled,
        botConfigured: secrets.TELEGRAM_API_KEY?.present !== false,
      }),
      icon: MessageSquare,
      action: { label: "Telegram setup and test", to: "/settings/g/time" },
    },
    {
      card: emailCard({ addressActive: r.emailActive, lastReceivedAt: r.emailLastReceived }),
      icon: Mail,
      action: { label: "Inbound addresses", to: "/settings/connected-accounts" },
    },
    {
      card: calendarCard({
        feeds: r.feeds, activeFeeds: r.activeFeeds,
        lastSyncedAt: r.calendarLastSync, brokenFeeds: r.brokenFeeds,
      }),
      icon: CalendarClock,
      action: { label: "Calendars", to: "/settings/g/time" },
    },
    {
      card: wearableCard({
        heartConsent: consent.heart_rate === true,
        activityConsent: consent.activity === true,
        lastReadingAt: r.wearableLastAt,
        lastSource: r.wearableLastSource,
      }),
      icon: Activity,
      action: { label: "Wearable setup", to: "/wearables" },
    },
    {
      card: platformCard({
        key: "gth",
        label: "Ground Truth Hub",
        blurb: "Camp and property events arrive as captures for review.",
        enabled: !!controls?.gth_enabled,
        lastAt: r.hubLastAt,
      }),
      icon: Building2,
      action: { label: "External platforms", to: "/settings/integrations" },
    },
  ];

  return (
    <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Plug className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Connect your world</h2>
            <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
              Every way the outside world reaches Vanta, with proof that it actually did. All of
              these feed the system. None of them can run anything.
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Recheck
        </Button>
      </div>

      {loading && !r.telegramLinked && !r.feeds ? (
        <LoadingState label="Checking each connection" />
      ) : (
        <ul className="mt-3 space-y-2">
          {cards.map((c) => (
            <ConnectionRow key={c.card.key} card={c.card} icon={c.icon} action={c.action} />
          ))}
        </ul>
      )}

      <div className="mt-4 border-t border-border/40 pt-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
          Ways a device can reach Vanta
        </p>
        <ul className="mt-2 space-y-2">
          {DEVICE_FAMILIES.map((f) => (
            <li key={f.key} className="rounded-lg bg-muted/15 p-2.5 ring-1 ring-border/30">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 flex-1 text-[12px] font-medium">{f.label}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ring-1",
                    f.supported
                      ? "bg-primary/12 text-primary ring-primary/25"
                      : "bg-muted/40 text-muted-foreground ring-border/60",
                  )}
                >
                  {f.supported ? "Supported" : "Not yet"}
                </span>
              </div>
              <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{f.what}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-foreground/70">
                {f.examples.join(" · ")}
              </p>
              {f.caveat ? (
                <p className="mt-0.5 text-[10.5px] italic leading-snug text-muted-foreground/80">
                  {f.caveat}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
