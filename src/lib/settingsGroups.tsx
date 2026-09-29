import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Rocket, User, CalendarClock, Inbox, Radar, Sparkles, Plug, Receipt, Bell,
  type LucideIcon,
} from "lucide-react";

import { HowVantaWorksSection } from "@/components/settings/HowVantaWorksSection";
import { VerdictDownloadCard } from "@/components/settings/VerdictDownloadCard";
import { OperatorProfileSection } from "@/components/settings/OperatorProfileSection";
import { BrandVoiceSection } from "@/components/settings/BrandVoiceSection";
import { CalendarFeedsSection } from "@/components/settings/CalendarFeedsSection";
import { MailSection } from "@/components/settings/MailSection";
import { TimeRemindersSection } from "@/components/settings/TimeRemindersSection";
import { RecapSettingsPanel } from "@/components/settings/RecapSettingsPanel";
import { ProactiveAwarenessSection } from "@/components/settings/ProactiveAwarenessSection";
import { PostureSection } from "@/components/settings/PostureSection";
import { SensorConsentSection } from "@/components/settings/SensorConsentSection";
import { OccasionsSection } from "@/components/settings/OccasionsSection";
import { DeviceSignalsSection } from "@/components/settings/DeviceSignalsSection";
import { PushReadinessSection } from "@/components/settings/PushReadinessSection";
import { NotifyLadderSection } from "@/components/settings/NotifyLadderSection";
import { NotifyFloorsSection } from "@/components/settings/NotifyFloorsSection";
import { NotificationChannelsSection } from "@/components/settings/NotificationChannelsSection";
import { RoomMotionSection } from "@/components/settings/RoomMotionSection";
import { SkinSection } from "@/components/settings/SkinSection";
import { EcosystemSourcesPanel } from "@/components/settings/EcosystemSourcesPanel";
import { DeviceReachSection } from "@/components/settings/DeviceReachSection";
import { UsageModeSection } from "@/components/settings/UsageModeSection";
import { CostTelemetryPanel } from "@/components/settings/CostTelemetryPanel";
import { ApiRecordsSection } from "@/components/settings/ApiRecordsSection";
import { IntakeCleanupSection } from "@/components/settings/IntakeCleanupSection";


export type SettingsGroup = {
  id: string;
  title: string;
  /** One line, plain English: what you came here to change. */
  blurb: string;
  icon: LucideIcon;
  render: () => ReactNode;
};

/** A link out to a page that already lives on its own route. */
function LinkOut({ to, title, blurb }: { to: string; title: string; blurb: string }) {
  return (
    <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">{blurb}</p>
        </div>
        <Link
          to={to}
          className="vanta-focus shrink-0 rounded-md bg-primary/15 px-3 py-1.5 text-[11.5px] font-medium text-primary ring-1 ring-primary/30 hover:bg-primary/20"
        >
          Open →
        </Link>
      </div>
    </section>
  );
}

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    id: "start",
    title: "Getting started",
    blurb: "Replay the walkthrough, read the map, download your data.",
    icon: Rocket,
    render: () => (
      <>
        <LinkOut
          to="/guide/telegram"
          title="What the chat can do"
          blurb="Every file type and size that works, what's read-only, and what only gets finished here. Same words the chat gives you, saveable as a file."
        />
        <HowVantaWorksSection />
        <VerdictDownloadCard />
      </>
    ),
  },
  {
    id: "you",
    title: "You and your voice",
    blurb: "Your name, how Echo addresses you, and the tone it writes in.",
    icon: User,
    render: () => (
      <>
        <OperatorProfileSection />
        <BrandVoiceSection />
      </>
    ),
  },
  {
    id: "awareness",
    title: "Your awareness",
    blurb: "What Echo is allowed to notice — posture, sensors, occasions, and what it's keeping an eye on.",
    icon: Radar,
    render: () => (
      <>
        <ProactiveAwarenessSection />
        <LinkOut
          to="/?surface=work"
          title="What Echo is keeping an eye on"
          blurb="Every live watch with its last check and its next one. Check now, pause, or stop from the shelf on Work."
        />
        <PostureSection />
        <SensorConsentSection />
        <OccasionsSection />
        <DeviceSignalsSection />
        <LinkOut
          to="/how/watch"
          title="The watch loop"
          blurb="Posture, which senses are on, live readings off a watch, the phone hand-off link, and the loop walked step by step."
        />
        <LinkOut
          to="/how/paper"
          title="Paper and phone"
          blurb="Your Telegram loop, the page read, and one promise walked from message to receipt."
        />
      </>
    ),
  },
  {
    id: "notifications",
    title: "Notifications",
    blurb: "What buzzes you, what waits in Today, quiet hours, and a test pulse.",
    icon: Bell,
    render: () => (
      <>
        <NotifyLadderSection />
        <NotifyFloorsSection />
        <PushReadinessSection />
        <NotificationChannelsSection />
      </>
    ),
  },
  {
    id: "time",
    title: "Time and calendar",
    blurb: "Your timezone, your day boundaries, the daily recap, and the calendars Echo reads.",
    icon: CalendarClock,
    render: () => (
      <>
        <TimeRemindersSection />
        <RecapSettingsPanel />
        <CalendarFeedsSection />
      </>
    ),
  },
  {
    id: "mail",
    title: "Your inbox",
    blurb: "Connect Gmail and switch on booking watch — flights Echo reads become drafts you approve.",
    icon: Inbox,
    render: () => <MailSection />,
  },
  {
    id: "connections",
    title: "Connections and workspaces",
    blurb: "Doors to every connection, the one health home, and the lanes your work lives in.",
    icon: Plug,
    render: () => (
      <>
        <LinkOut
          to="/settings/integrations"
          title="Connection health"
          blurb="The one home for status, doctrine and kill switches — Camp State, CampCore, Telegram, Email, Calendar, Fenrir, WhatsApp."
        />
        <LinkOut
          to="/settings/telegram"
          title="Telegram"
          blurb="Connect your bot, pair your phone, and watch messages land in the Inbox."
        />
        <LinkOut
          to="/settings/connected-accounts"
          title="Connected accounts"
          blurb="Inbound mail addresses and linked channels, with the way to disconnect each."
        />
        <LinkOut
          to="/settings/workspaces"
          title="Workspaces & branding"
          blurb="Create lanes, manage members, give each workspace its own short code and accent."
        />
        <EcosystemSourcesPanel />
        <DeviceReachSection />
      </>
    ),
  },
  {
    id: "feel",
    title: "Look and feel",
    blurb: "How fast rooms change and how much the interface moves.",
    icon: Sparkles,
    render: () => (
      <>
        <SkinSection />
        <RoomMotionSection />
      </>
    ),
  },
  {
    id: "records",
    title: "Records and spending",
    blurb: "Limits, kill switches, what everything is costing, and clearing out old intake.",
    icon: Receipt,
    render: () => (
      <>
        <UsageModeSection />
        <CostTelemetryPanel />
        <IntakeCleanupSection />
        <ApiRecordsSection />
      </>
    ),
  },
];

/**
 * Old group ids that merged into a new home. Bookmarks and deep links keep
 * working — SettingsGroup redirects them to the resolved id.
 */
const GROUP_ALIASES: Record<string, string> = {
  calendar: "time",
  spending: "records",
};

export function resolveSettingsGroupId(id: string | undefined): string | undefined {
  if (!id) return id;
  return GROUP_ALIASES[id] ?? id;
}

export function findSettingsGroup(id: string | undefined): SettingsGroup | undefined {
  return SETTINGS_GROUPS.find((g) => g.id === resolveSettingsGroupId(id));
}
