// PhysicalLoop — the paper-and-phone loop as its own page.
//
// The same live panel that sits in Work, given room to breathe, with the plain
// explanation of what the phone can and cannot do around it.
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { PhysicalLoopPanel } from "@/components/work/PhysicalLoopPanel";
import { TelegramLinkCard } from "@/components/TelegramLinkCard";

const STEPS = [
  "Send a message or a photo of a page from your phone.",
  "Echo reads it and files it in your Inbox as a draft. It routes nothing on its own.",
  "You turn it into a promise here, where you can see the whole thing.",
  "The reminder goes to your phone. Its buttons only mark done or snooze.",
  "The receipt lands in Receipts, with the time and what changed.",
];

export default function PhysicalLoopPage() {
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
          <h1 className="text-lg font-semibold tracking-tight">Paper and phone</h1>
          <p className="text-xs text-muted-foreground">
            From a note in your pocket to a receipt in here.
          </p>
        </div>
      </header>

      <section className="vanta-card mb-4 p-4">
        <h2 className="text-[14px] font-semibold tracking-tight">The loop</h2>
        <ol className="mt-2 space-y-1.5">
          {STEPS.map((s, i) => (
            <li key={s} className="flex gap-2 text-[12px] leading-snug text-foreground/90">
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{i + 1}.</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[11.5px] leading-snug text-muted-foreground">
          Your phone feeds Echo. It never controls it. You don't have to wait on the nightly read
          either — the buttons below run the read and send the reminder right now.
        </p>
      </section>

      <div className="mb-4">
        <PhysicalLoopPanel />
      </div>

      <TelegramLinkCard />
    </div>
  );
}
