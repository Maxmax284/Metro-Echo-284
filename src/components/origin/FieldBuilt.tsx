import { Head, Line, Section } from "./Section";

const ROUTE = ["IAD", "TPE", "BKK", "USM"];

const FIELD_NOTES = [
  {
    label: "The clock that matters",
    copy: "A boarding time on paper can matter more than a departure estimate in a feed. Metro Echo keeps the source and the moment attached, so a correction does not erase how the earlier answer happened.",
  },
  {
    label: "Arrival is not one state",
    copy: "Landed, entered the country, collected a bag, and left the terminal are different facts. The platform is being taught to hold that uncertainty instead of skipping ahead because the itinerary says arrived.",
  },
  {
    label: "Life kept running",
    copy: "Messages, documents, calendar changes, training, and ordinary work did not pause for the trip. The same four rooms had to stay useful through weak Wi-Fi, offline stretches, changing time zones, and a day that refused to become a clean demo.",
  },
];

const PRINCIPLES = [
  ["Now over noise", "Lead with the thing that changes the next move. Park the rest until it is useful."],
  ["Source over certainty", "Keep apart what a provider reported, what a pass printed, and what the traveler observed."],
  ["Receipts over amnesia", "Record what changed, when it changed, and whose word moved it."],
  ["Adapt over defend", "When reality contradicts the product, correct the product and preserve the trail."],
  ["People decide", "Echo can notice, prepare, and explain. Consequential decisions stay with the person responsible."],
];

/** The origin story is deliberately separate from the feature story: evidence of
 * direct use, not a claim that every surface is proven or complete. */
export function FieldBuilt() {
  return (
    <Section label="How it is being built" id="built-in-the-field">
      <Head>Built in the field. Tested against real life.</Head>
      <Line className="mt-4">
        Metro Echo is being developed alongside the life it is meant to support. Its creator builds it, carries it,
        uses it, finds the bad assumptions, and goes back in. A polished preview is not treated as proof that the work
        is done.
      </Line>

      <div className="vanta-card vanta-grain vanta-cut mt-7 overflow-hidden p-4 sm:p-5">
        <p className="vanta-machine-label text-primary">Field run · four airports · one continuing day</p>
        <ol className="mt-4 flex items-center" aria-label="Field journey from Dulles to Koh Samui">
          {ROUTE.map((airport, index) => (
            <li key={airport} className="flex min-w-0 flex-1 items-center last:flex-none">
              <span className="vanta-machine flex h-9 min-w-9 items-center justify-center rounded-[3px] bg-primary/10 px-1 text-[11px] font-bold text-primary ring-1 ring-primary/30">
                {airport}
              </span>
              {index < ROUTE.length - 1 ? (
                <span className="mx-1.5 h-px min-w-2 flex-1 bg-border sm:mx-2" aria-hidden />
              ) : null}
            </li>
          ))}
        </ol>
        <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
          Dulles to Taipei to Bangkok to Koh Samui became a live development environment: airport Wi-Fi that came and
          went, boarding and gate realities, an international connection, immigration, arrival paperwork, conflicting
          clocks, and the work waiting outside the itinerary.
        </p>
      </div>

      <div className="mt-5 space-y-2">
        {FIELD_NOTES.map((note) => (
          <div key={note.label} className="vanta-inset px-3.5 py-3">
            <p className="text-[13px] font-semibold text-foreground">{note.label}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{note.copy}</p>
          </div>
        ))}
      </div>

      <blockquote className="my-8 border-l-2 border-primary/60 pl-4">
        <p className="text-balance text-xl font-semibold leading-snug sm:text-2xl">
          “Reality gets the last word. The system keeps the receipt.”
        </p>
      </blockquote>

      <Head className="text-xl sm:text-2xl">The builder is part of the test.</Head>
      <Line className="mt-4">
        That includes human fallibility. Preparation and timing around Thailand's arrival declaration were not perfect.
        The address was ready, but accommodation fields on the official form were unexpectedly unavailable. A person at
        immigration helped resolve the situation.
      </Line>
      <Line className="mt-3">
        Echo did not submit the form, inspect a government database, approve entry, or resolve immigration. Government
        personnel make those decisions. The useful lesson was narrower and more important: <span className="font-medium text-foreground">submitted</span>,{" "}
        <span className="font-medium text-foreground">verified</span>, and <span className="font-medium text-foreground">resolved</span> are different states.
      </Line>
      <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
        No private address, passport detail, tenancy paper, landlord information, or immigration record is part of this
        account. The product can learn the operational lesson without turning a person's documents into a story.
      </p>

      <div className="mt-8 vanta-rule pt-5">
        <p className="vanta-machine-label text-muted-foreground">What the field keeps teaching</p>
        <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {PRINCIPLES.map(([term, description]) => (
            <div key={term} className="min-w-0">
              <dt className="text-[13px] font-semibold text-primary">{term}</dt>
              <dd className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{description}</dd>
            </div>
          ))}
        </dl>
      </div>

      <Line className="mt-7">
        This is not a claim that every part of Metro Echo has been field-proven, or that the platform is flawless. It is
        a commitment to develop the whole everyday companion through direct use, honest failures, and continual
        refinement — proactive when timing matters, quiet when it does not.
      </Line>
    </Section>
  );
}