import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Rocket, User, CalendarClock, CalendarCheck2, Inbox, Radar, Sparkles, Plug, Gauge, Receipt,
  type LucideIcon,
} from "lucide-react";

import { HowVantaWorksSection } from "@/components/settings/HowVantaWorksSection";
import { VerdictDownloadCard } from "@/components/settings/VerdictDownloadCard";
import { OperatorProfileSection } from "@/components/settings/OperatorProfileSection";
import { BrandVoiceSection } from "@/components/settings/BrandVoiceSection";
import { CalendarFeedsSection } from "@/components/settings/CalendarFeedsSection";
import { TimeRemindersSection } from "@/components/settings/TimeRemindersSection";
import { RecapSettingsPanel } from "@/components/settings/RecapSettingsPanel";
import { PostureSection } from "@/components/settings/PostureSection";
import { SensorConsentSection } from "@/components/settings/SensorConsentSection";
import { DeviceSignalsSection } from "@/components/settings/DeviceSignalsSection";
import { PushReadinessSection } from "@/components/settings/PushReadinessSection";
import { RoomMotionSection } from "@/components/settings/RoomMotionSection";
import { SkinSection } from "@/components/settings/SkinSection";
import { EcosystemSourcesPanel } from "@/components/settings/EcosystemSourcesPanel";
import { UsageModeSection } from "@/components/settings/UsageModeSection";
import { CostTelemetryPanel } from "@/components/settings/CostTelemetryPanel";
import { ApiRecordsSection } from "@/components/settings/ApiRecordsSection";
import { IntakeCleanupSection } from "@/components/settings/IntakeCleanupSection";
import { ConnectYourWorldSection } from "@/components/settings/ConnectYourWorldSection";


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
    id: "calendar",
    title: "Your calendar",
    blurb: "Sign in with Google so Echo reads your real calendar — or paste a read-only link.",
    icon: CalendarCheck2,
    render: () => <CalendarFeedsSection />,
  },
  {
    id: "time",
    title: "Time and reminders",
    blurb: "Quiet hours, your day boundaries, when the daily recap lands.",
    icon: CalendarClock,
    render: () => (
      <>
        <TimeRemindersSection />
        <RecapSettingsPanel />
      </>
    ),
  },
  {
    id: "awareness",
    title: "Awareness and senses",
    blurb: "What Echo is allowed to notice, your posture, and how it reaches you.",
    icon: Radar,
    render: () => (
      <>
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
        <PostureSection />
        <SensorConsentSection />
        <DeviceSignalsSection />
        <PushReadinessSection />
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
    id: "connections",
    title: "Connections and workspaces",
    blurb: "Platforms, messaging, sources, and the lanes your work lives in.",
    icon: Plug,
    render: () => (
      <>
        <ConnectYourWorldSection />
        <LinkOut
          to="/settings/telegram"
          title="Telegram"
          blurb="Connect your bot, pair your phone, and watch messages land in the Inbox."
        />
        <LinkOut
          to="/guide/telegram"
          title="What the chat can do"
          blurb="File types, sizes, read-only sources, and what only finishes here. Save a copy to hand to someone else."
        />
        <LinkOut

          to="/settings/integrations"
          title="Platform Integrations"
          blurb="Camp State, CampCore, Telegram, Email, Calendar, Fenrir, WhatsApp. Status, doctrine and kill switches."
        />
        <LinkOut
          to="/settings/workspaces"
          title="Workspaces & branding"
          blurb="Create lanes, manage members, give each workspace its own short code and accent."
        />
        <EcosystemSourcesPanel />
      </>
    ),
  },
  {
    id: "spending",
    title: "Spending and safety",
    blurb: "Overall posture, kill switches, and what everything is costing.",
    icon: Gauge,
    render: () => (
      <>
        <UsageModeSection />
        <CostTelemetryPanel />
      </>
    ),
  },
  {
    id: "records",
    title: "Records and cleanup",
    blurb: "Limits, the raw call record, and clearing out old intake.",
    icon: Receipt,
    render: () => (
      <>
        <IntakeCleanupSection />
        <ApiRecordsSection />
      </>
    ),
  },
];

export function findSettingsGroup(id: string | undefined): SettingsGroup | undefined {
  return SETTINGS_GROUPS.find((g) => g.id === id);
}
