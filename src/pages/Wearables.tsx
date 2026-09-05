// Wearables — plain talk about posture, senses and the watch feed.
//
// One page, no jargon: what a wearable is for, what it will never do, and the
// two switches that decide how much it can say.
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { WearableContextPanel } from "@/components/wearables/WearableContextPanel";
import { AutoSendPanel } from "@/components/wearables/AutoSendPanel";
import { WearableReadingsPanel } from "@/components/wearables/WearableReadingsPanel";
import { PostureSection } from "@/components/settings/PostureSection";
import { SensorConsentSection } from "@/components/settings/SensorConsentSection";

const RULES = [
  "A wearable can tell Echo what kind of moment you're in. That's context.",
  "A wearable can show you what's next and what just changed. That's reading.",
  "A wearable can never approve or run anything. Approval doesn't travel.",
  "Nothing here goes through Telegram. This is your own device, feeding your own core.",
];

export default function WearablesPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-6">
      <header className="mb-5 flex items-center gap-3">
        <Link
          to="/"
          aria-label="Back to Echo"
          className="vanta-focus inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md ring-1 ring-border/60 hover:bg-surface-elevated"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">Wearables</h1>
          <p className="text-xs text-muted-foreground">
            A watch on your wrist, the same core underneath.
          </p>
        </div>
      </header>

      <section className="vanta-card mb-4 p-4">
        <h2 className="text-[14px] font-semibold tracking-tight">How this works</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          Echo has one brain and many bodies. A phone, a desk, a watch — each one gets the same
          truth in a different size. The watch gets the shortest version, because you're moving.
        </p>
        <ul className="mt-3 space-y-1.5">
          {RULES.map((r) => (
            <li key={r} className="flex gap-2 text-[12px] leading-snug text-foreground/90">
              <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="mb-4">
        <WearableContextPanel />
      </div>

      <div className="mb-4">
        <AutoSendPanel />
      </div>

      <div className="mb-4">
        <WearableReadingsPanel />
      </div>

      <PostureSection />
      <SensorConsentSection />
    </div>
  );
}
