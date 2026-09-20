// What is Metro Echo — the public origin page. Not a hero, not a pitch deck.
// It starts in the noise of a real day and ends somewhere calm, and it never
// claims a capability the product does not have.
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChaosField } from "@/components/origin/ChaosField";
import { SourceWeave } from "@/components/origin/SourceWeave";
import { CapabilitySequence } from "@/components/origin/CapabilitySequence";
import { DaySimulator } from "@/components/origin/DaySimulator";
import { FieldBuilt } from "@/components/origin/FieldBuilt";
import { Head, Line, Section } from "@/components/origin/Section";
import { PRODUCT_NAME } from "@/lib/brand";

const CITIES = [
  { city: "New York", tz: "UTC−4", note: "where the standards came from" },
  { city: "Bangkok", tz: "UTC+7", note: "training, operations, paperwork" },
  { city: "Phuket", tz: "UTC+7", note: "a gym that never stops moving" },
  { city: "Berlin", tz: "UTC+2", note: "people needing answers overnight" },
];

const NOT = [
  "An AI command center",
  "Seventeen dashboards",
  "An agent swarm",
  "A productivity score",
  "Another notification app",
];

const ROOMS = [
  { k: "Today", d: "What matters now." },
  { k: "Work", d: "Where ongoing work lives." },
  { k: "Ask", d: "Talk to Echo with your context already loaded." },
  { k: "Receipts", d: "What happened and why." },
];

const FUTURE = [
  "Body context: sleep, training, recovery, hydration, caffeine — noticed, never diagnosed.",
  "Unfamiliar-place help: pharmacies, clinics, local non-emergency numbers, local rules.",
  "Everyday money and housing context: what can be delayed, what a lease actually says.",
  "Hands-free surfaces: earbuds first, deliberate glasses much later. Never always-watching.",
];

export default function WhatIsMetroEcho() {
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.getAttribute("data-room");
    root.setAttribute("data-room", "door");
    const prevTitle = document.title;
    document.title = `What is ${PRODUCT_NAME}? A situational companion for everyday life`;
    return () => {
      document.title = prevTitle;
      if (prev) root.setAttribute("data-room", prev);
      else root.removeAttribute("data-room");
    };
  }, []);

  return (
    <main className="min-h-dvh bg-background">
      <header className="sticky top-0 z-20 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-5 py-2.5">
          <span className="text-[13px] font-semibold tracking-tight">{PRODUCT_NAME}</span>
          <div className="flex items-center gap-2">
            <Link to="/auth" className="text-[12.5px] text-muted-foreground underline-offset-4 hover:underline">
              Sign in
            </Link>
            <Button asChild size="sm" className="h-8 text-[12px]">
              <Link to="/auth">Create account</Link>
            </Button>
          </div>
        </div>
      </header>

      <ChaosField />

      <Section label="Why it exists">
        <Head>Too much of a life was being assembled by hand, in one head.</Head>
        <Line className="mt-4">
          Life got international. Two continents, several time zones, technical work, training, travel, appointments,
          operations, and people who need an answer while you are somewhere they are not awake for.
        </Line>
        <Line className="mt-3">
          Every tool held one slice. None of them held the situation. The assembly work — what changed, what it means,
          what it does to the rest of the day — always fell back on a person.
        </Line>
        <p className="mt-8 text-balance text-xl font-semibold leading-snug sm:text-2xl">
          “I needed something that could keep up.”
        </p>
        <div className="mt-8 grid gap-2 sm:grid-cols-2">
          {CITIES.map((c) => (
            <div key={c.city} className="rounded-lg border border-border/60 bg-card/60 px-3 py-2">
              <p className="text-sm font-semibold">
                {c.city} <span className="ml-1 text-[11px] font-normal text-muted-foreground">{c.tz}</span>
              </p>
              <p className="text-[12px] text-muted-foreground">{c.note}</p>
            </div>
          ))}
        </div>
      </Section>

      <FieldBuilt />

      <Section label="What it is">
        <Head>A situational companion for everyday life.</Head>
        <Line className="mt-4">
          Not a chatbot with your name on it. Echo reads the situation you are actually in and answers five questions
          without being asked twice.
        </Line>
        <ul className="mt-4 space-y-1.5 text-[15px]">
          {["What matters?", "What changed?", "What needs me?", "What can wait?", "What can Echo help handle?"].map(
            (q) => (
              <li key={q} className="flex gap-2">
                <span className="text-primary">—</span>
                {q}
              </li>
            ),
          )}
        </ul>
        <div className="mt-6 rounded-xl border border-border/60 bg-card/60 p-4">
          <p className="text-[13.5px] leading-relaxed">
            One Echo. One brain. One memory. Many surfaces.
            <br />
            More capability underneath. Less complexity on top.
          </p>
        </div>
      </Section>

      <Section label="Live today">
        <Head>One situation, not five sources.</Head>
        <Line className="mt-4">
          Your calendar, your mail, and your files are connected on your own Google account — read access you grant one
          service at a time. Tap the sources and watch separate facts turn into one conclusion.
        </Line>
        <div className="mt-6">
          <SourceWeave />
        </div>
      </Section>

      <Section label="Not another chatbot">
        <div className="rounded-xl border border-border/60 bg-card/70 p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Ask</p>
          <p className="mt-1 text-lg font-semibold">“What actually needs me today?”</p>
          <div className="mt-4 space-y-2 border-l-2 border-primary/50 pl-3">
            <p className="text-[14px]">Approve the refund note — the customer is waiting on you, not the system.</p>
            <p className="text-[14px]">Leave by 3:20 for the clinic; the address changed.</p>
          </div>
          <p className="mt-4 text-[13px] text-muted-foreground">Everything else can wait.</p>
        </div>
      </Section>

      <Section label="How Echo works">
        <Head>See, understand, prepare — then stop and ask.</Head>
        <div className="mt-6">
          <CapabilitySequence />
        </div>
        <Line className="mt-5">
          Consequential things never happen on their own. Echo prepares; you approve; the receipt records it. There is no
          version of this where it sends something on a hunch.
        </Line>
      </Section>

      <Section label="Silence" className="text-center">
        <p className="text-2xl font-semibold tracking-tight sm:text-4xl">Nothing needs you right now.</p>
        <Line className="mt-4">That counts as intelligence too.</Line>
      </Section>

      <Section label="One Echo, many surfaces">
        <Head>Your life keeps moving. Echo keeps up.</Head>
        <div className="mt-5 grid gap-2">
          {[
            { k: "Phone", d: "The main surface. Everything works here first.", live: true },
            { k: "Watch", d: "Glance, acknowledge, defer. Body context when you allow it.", live: true },
            { k: "Desktop", d: "Deeper work — documents, projects, the long read.", live: true },
            { k: "Messaging", d: "Telegram carries a heads-up when you're away from the app.", live: true },
            { k: "Earbuds", d: "Hands-free, later.", live: false },
            { k: "Glasses", d: "Much later, deliberate, never always-watching.", live: false },
          ].map((s) => (
            <div key={s.k} className="flex items-baseline gap-3 rounded-lg border border-border/60 bg-card/60 px-3 py-2">
              <p className="w-20 shrink-0 text-sm font-semibold">{s.k}</p>
              <p className="min-w-0 text-[12.5px] text-muted-foreground">{s.d}</p>
              {!s.live && (
                <span className="ml-auto shrink-0 text-[9.5px] uppercase tracking-wider text-muted-foreground">
                  planned
                </span>
              )}
            </div>
          ))}
        </div>
        <Line className="mt-4">
          Same Echo, same memory, same thread. Moving from phone to desktop is not a handoff between two assistants.
        </Line>
      </Section>

      <Section label="Pick a day">
        <Head>Different day, different Echo.</Head>
        <div className="mt-6">
          <DaySimulator />
        </div>
      </Section>

      <Section label="Everyday life">
        <Head>Life is bigger than an inbox.</Head>
        <Line className="mt-4">
          A clinic changes its address. A landlord sends a lease you do not understand. You are in a city you have never
          walked, money is tight this month, and the cheapest realistic way across town is not obvious.
        </Line>
        <Line className="mt-3">
          Echo's job in those moments is the next useful move — one line, grounded in what it can actually see, and an
          honest “not recorded” when it cannot.
        </Line>
        <div className="mt-5 rounded-xl border border-warn/40 bg-warn/5 p-4">
          <p className="text-sm font-semibold">About help, and about escalation</p>
          <ul className="mt-2 space-y-1.5 text-[13px] text-muted-foreground">
            <li>Echo can orient you and surface practical local options.</li>
            <li>It does not treat every uncomfortable moment as an emergency.</li>
            <li>No automatic emergency services. No silent location sharing. No panic-button theater.</li>
            <li>Escalation is deliberate, and it is yours. Calm help first.</li>
          </ul>
        </div>
      </Section>

      <Section label="Where Echo is going">
        <Head>Honest about what is not built yet.</Head>
        <ul className="mt-4 space-y-2">
          {FUTURE.map((f) => (
            <li key={f} className="rounded-lg border border-dashed border-border/70 bg-card/40 px-3 py-2 text-[13px] text-muted-foreground">
              {f}
            </li>
          ))}
        </ul>
        <Line className="mt-4">
          All of it lands in the same four rooms. No Health room, no Travel room, no Finance room. And Echo will never
          tell you your cortisol is high — it will tell you that you slept less, trained harder, and had more caffeine
          than usual.
        </Line>
      </Section>

      <Section label={`What ${PRODUCT_NAME} is not`}>
        <ul className="space-y-2">
          {NOT.map((n) => (
            <li key={n} className="text-lg font-medium text-muted-foreground line-through decoration-danger/70">
              {n}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-xl font-semibold">One companion. Four rooms.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {ROOMS.map((r) => (
            <div key={r.k} className="rounded-lg border border-border/60 bg-card/60 px-3 py-2">
              <p className="text-sm font-semibold text-primary">{r.k}</p>
              <p className="text-[12px] text-muted-foreground">{r.d}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section label="Where it lands" className="pb-24">
        <p className="text-[15px] text-muted-foreground">
          Nine things arrived while you were out. Echo already handled six, staged one for your approval, and parked two.
        </p>
        <p className="mt-4 text-balance text-2xl font-semibold leading-snug sm:text-3xl">
          Two things need you. Everything else is handled or can wait.
        </p>
        <Line className="mt-6">{PRODUCT_NAME} was not built to make life feel more technical.</Line>
        <Line className="mt-1">It was built to make a complicated life feel manageable.</Line>
        <p className="mt-8 text-lg font-semibold">Keep moving. Echo keeps the thread.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/auth">Create account</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/auth">Sign in</Link>
          </Button>
        </div>
      </Section>
    </main>
  );
}
