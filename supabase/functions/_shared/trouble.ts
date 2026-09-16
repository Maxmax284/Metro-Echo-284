// trouble — the street-smart lane. Something went wrong; what is the least
// stupid next move?
//
// Doctrine:
//   - Kept by hand, stamped with the day it was checked. No model wrote a step.
//   - A situation Echo has no playbook for gets no playbook. It says so.
//   - Echo prepares. It never calls anyone, cancels a card, files a claim,
//     books a replacement, or raises an alarm on somebody's behalf.
//   - Every playbook names what Echo still needs from the person, so it never
//     pretends to know the part only they can see.
//
// Pure module: no IO, no React. Same rows on the server and in the browser.

export const TROUBLE_LAW =
  "Echo lines the move up. You make it. It does not phone anyone, cancel a card, file a claim, or call for help on your behalf.";

export type TroubleId =
  | "lost_wallet"
  | "lost_passport"
  | "card_declined"
  | "card_eaten"
  | "dead_phone"
  | "missed_transport"
  | "hotel_problem"
  | "taxi_problem"
  | "locked_out"
  | "missing_package"
  | "utility_outage"
  | "vehicle_trouble"
  | "broken_appliance"
  | "where_for_care"
  | "prescription"
  | "paperwork"
  | "gov_office"
  | "baggage"
  | "fee_check";

export type Playbook = {
  id: TroubleId;
  /** Plain name of the situation, as a person would say it. */
  title: string;
  /** The single first move, before anything else. */
  first: string;
  /** The order after that. Short lines, no theory. */
  steps: string[];
  /** What Echo needs from the person before it can be specific. */
  needs: string[];
  /** Kept reads that make the answer concrete, by read name. */
  reads: string[];
  /** The hard edge — what Echo will not do here. */
  never: string;
  checked_on: string;
};

const CHECKED = "2026-09-16";

const PLAYBOOKS: Playbook[] = [
  {
    id: "lost_wallet",
    title: "Lost wallet",
    first: "Freeze the cards in your bank apps before you go looking for the wallet.",
    steps: [
      "Freeze, do not cancel, first — a freeze is reversible if the wallet turns up in your other jacket.",
      "Write down what was in it: cards, ID, transit pass, cash, keys, anything with your address on it.",
      "Retrace the last three places you paid for something. Ask the last one directly; wallets sit behind counters.",
      "File a police report if ID was in it — insurers and embassies ask for the report number, not the story.",
      "Order replacements one at a time so you can still pay for things while you wait.",
    ],
    needs: ["Which cards were in it", "Whether ID or a residence card was in it", "The city you are in"],
    reads: ["money_read", "how_things_work"],
    never: "Echo does not freeze, cancel, or reorder a card. You do that in the bank's own app.",
    checked_on: CHECKED,
  },
  {
    id: "lost_passport",
    title: "Lost passport",
    first: "Find your nearest embassy or consulate's opening hours before you do anything else — everything downstream runs on their clock.",
    steps: [
      "Report it to the local police and keep the report number.",
      "Report it to your own government so the passport is invalidated and cannot be used.",
      "Book the earliest consular appointment you can. Emergency travel documents exist and are usually same-week, not same-hour.",
      "Bring: police report, any photo of the old passport, a passport photo, proof of onward travel, and a way to pay the fee.",
      "If you have a flight inside 48 hours, tell the consulate that in the first sentence — it changes which document they issue.",
    ],
    needs: ["Your citizenship", "Which city you are in", "Whether you have travel booked in the next few days"],
    reads: ["flights_prepared", "how_things_work"],
    never: "Echo does not contact an embassy, book an appointment, or cancel travel for you.",
    checked_on: CHECKED,
  },
  {
    id: "card_declined",
    title: "Card declined abroad",
    first: "Try a second card before you assume anything is wrong with the first.",
    steps: [
      "Check the bank app for a travel block or a fraud hold — that is the usual cause, and it clears from the app.",
      "If the terminal offered to charge you in your home currency, decline it and pay in local currency. The 'convenience' rate is the worst rate in the room.",
      "Try a chip-and-PIN attempt rather than contactless; some networks refuse contactless above a low ceiling abroad.",
      "Withdraw from a bank-branded ATM as a fallback so you are not stranded on card acceptance.",
      "If it is a hold, expect to confirm the transaction in the app rather than talk to anyone.",
    ],
    needs: ["Which bank", "Which country you are paying in", "Whether the app shows a hold"],
    reads: ["money_read", "convert_money", "how_things_work"],
    never: "Echo does not lift a fraud hold or talk to your bank.",
    checked_on: CHECKED,
  },
  {
    id: "card_eaten",
    title: "ATM kept the card",
    first: "Stay at the machine and note the bank name, the ATM number and the exact time.",
    steps: [
      "If the ATM belongs to a bank branch and the branch is open, go inside now — retained cards are usually held there for a few days.",
      "If it is a standalone machine, the card is gone; treat it as lost and order a replacement.",
      "Freeze the card either way, so nothing rides on who opens the machine.",
      "Check whether the withdrawal debited. If it did and you got no cash, that is a claim with a timestamp behind it.",
    ],
    needs: ["Bank name on the machine", "Whether it was inside a branch", "Whether the amount left your account"],
    reads: ["money_read"],
    never: "Echo does not open a dispute or request a replacement card.",
    checked_on: CHECKED,
  },
  {
    id: "dead_phone",
    title: "Dead phone",
    first: "Work out what you actually need it for in the next hour — that decides whether you need power or a replacement route.",
    steps: [
      "Power first: convenience stores, cafés, pharmacies and transit stations sell cables and battery packs almost everywhere.",
      "If the phone is dead and you need a ticket or a booking reference, ask a counter to look it up by name and ID. Most systems can.",
      "Write your key numbers somewhere physical while you still have a screen: accommodation address, one contact, one booking reference.",
      "If it is broken rather than flat, a cheap prepaid handset plus your SIM buys back calls and maps for the price of a dinner.",
    ],
    needs: ["Flat or broken", "What you need it for in the next hour", "The city you are in"],
    reads: ["how_things_work", "flights_prepared"],
    never: "Echo does not order a device or contact your carrier.",
    checked_on: CHECKED,
  },
  {
    id: "missed_transport",
    title: "Missed a train, bus or connection",
    first: "Find the next departure before you talk to anyone — that number decides whether this is an inconvenience or a problem.",
    steps: [
      "On a flexible or commuter ticket, the next departure usually just works. Check the ticket type before paying twice.",
      "On a fixed ticket, ask at the counter for the same-day rebooking rule. Many carriers do it for a small fee within a set window.",
      "If you were on your way to another leg, count the gap you have left before that leg leaves. That is the real question.",
      "If the gap is gone, deal with the second leg first — it is the one that costs money.",
    ],
    needs: ["The service and route", "Your ticket type", "Anything you are connecting to"],
    reads: ["flights_prepared", "whats_due"],
    never: "Echo does not rebook, refund, or buy a ticket.",
    checked_on: CHECKED,
  },
  {
    id: "hotel_problem",
    title: "Hotel or room problem",
    first: "Photograph the problem before you report it, with the room number in frame if you can.",
    steps: [
      "Report it at the desk in person and ask for a specific remedy: a move, a fix by a stated time, or a reduction.",
      "Get the name of whoever agreed to it. A first name is enough.",
      "If you booked through a platform, open the complaint there too — the platform is the leverage, the desk is the fix.",
      "If nothing moves within the stated time, escalate once, then look at moving. A refund fight is easier than a bad week.",
    ],
    needs: ["What is wrong", "How you booked", "How many nights are left"],
    reads: ["find_note", "whats_due"],
    never: "Echo does not contact the hotel, cancel a booking, or open a platform dispute.",
    checked_on: CHECKED,
  },
  {
    id: "taxi_problem",
    title: "Taxi or ride problem",
    first: "Note the plate and the time before you get out — no plate, no complaint.",
    steps: [
      "On a metered ride, ask for the printed receipt; the meter number is what a complaint runs on.",
      "On an app ride, the trip record is already the evidence. Report the fare in the app that night, not next week.",
      "If a driver refuses the meter and quotes a flat price up front, that is a negotiation, not a fault. Decide before you get in.",
      "If you left something behind, the app has a lost-item flow; a street taxi needs the plate and the dispatcher.",
    ],
    needs: ["App ride or street taxi", "Plate or trip number", "What went wrong"],
    reads: ["how_things_work"],
    never: "Echo does not contact a driver, a dispatcher, or dispute a fare.",
    checked_on: CHECKED,
  },
  {
    id: "locked_out",
    title: "Locked out",
    first: "Check who legally holds the spare — landlord, building manager, front desk, or a neighbour who has done it before.",
    steps: [
      "In a managed building, the manager or desk is faster and cheaper than a locksmith. Call that first.",
      "In a rental, the landlord or agency is usually contractually responsible for access. Ask them before you pay anyone.",
      "If you use a locksmith, ask for the total price before they touch the door, including any call-out fee. 'From' prices are not prices.",
      "If a door was left unlocked or damaged, photograph it before entering.",
    ],
    needs: ["Who manages the building", "Time of day", "Whether anything is inside that cannot wait"],
    reads: ["find_note"],
    never: "Echo does not call a locksmith or authorise a charge.",
    checked_on: CHECKED,
  },
  {
    id: "missing_package",
    title: "Missing package",
    first: "Read the tracking history word for word — 'delivered' and 'out for delivery' send you in different directions.",
    steps: [
      "If it says delivered, check with neighbours, the building desk, and any safe-place instruction on the order.",
      "If it stalled in transit, the seller is the one who has to chase the carrier, not you. Open the claim with the seller.",
      "Note the claim window. Most sellers and carriers close on a fixed number of days from the last scan.",
      "If it says a signature was taken, ask whose. That single question resolves most of these.",
    ],
    needs: ["Carrier and tracking number", "What the last scan says", "Where you ordered it from"],
    reads: ["find_note"],
    never: "Echo does not open a claim or message a seller.",
    checked_on: CHECKED,
  },
  {
    id: "utility_outage",
    title: "Power or internet out",
    first: "Find out whether it is you or the street — that is one look out of the window or one glance at the provider's status page.",
    steps: [
      "If neighbours are dark too, it is the network. Reporting it once helps; reporting it five times does not.",
      "If it is only you, check the breaker or fuse and the router power before calling anyone.",
      "Ask the provider for an estimated restore time and a ticket number. The ticket number is what a rebate later runs on.",
      "If you are working, decide early where you are going instead. Waiting is the expensive option.",
    ],
    needs: ["Whether neighbours are affected", "Provider name", "Whether you need to work today"],
    reads: ["whats_due"],
    never: "Echo does not report an outage or claim a rebate.",
    checked_on: CHECKED,
  },
  {
    id: "vehicle_trouble",
    title: "Flat tyre or scooter trouble",
    first: "Get the vehicle somewhere safe and visible before you look at the problem.",
    steps: [
      "On a rental or a lease, call the number on the paperwork first. Fixing it yourself can void the cover.",
      "On a scooter, a roadside repair shop is normally minutes and small money. Agree the price before the tools come out.",
      "Photograph the damage and the odometer before any work — rentals argue about pre-existing damage.",
      "If you are on a schedule, decide now whether to repair or leave it and take transport.",
    ],
    needs: ["Owned or rented", "Where you are", "Whether you are due somewhere"],
    reads: ["whats_due", "how_things_work"],
    never: "Echo does not call roadside assistance or authorise a repair.",
    checked_on: CHECKED,
  },
  {
    id: "broken_appliance",
    title: "Broken appliance",
    first: "Find out who is responsible before you spend anything — in most rentals it is not you.",
    steps: [
      "In a rental, report it in writing to the landlord or agency with a photo and the date. Writing is what makes it their problem.",
      "Check the warranty date if you own it. A repair inside warranty is a different call entirely.",
      "Get a price before a visit, and ask whether the call-out fee comes off the repair.",
      "If it floods, leaks, or smells of gas, that is not a repair question. Shut it off and use the emergency number.",
    ],
    needs: ["Rented or owned", "What it is", "Whether anything is leaking or unsafe"],
    reads: ["local_help", "find_note"],
    never: "Echo does not book a technician or message a landlord.",
    checked_on: CHECKED,
  },
  {
    id: "where_for_care",
    title: "Doctor, clinic, pharmacy or emergency",
    first: "If it is chest pain, breathing, heavy bleeding, or a head injury, that is the emergency number, not a decision.",
    steps: [
      "Pharmacy: minor and known — a rash, a stomach bug, a refill question. Pharmacists in many countries can treat more than people expect.",
      "Clinic or urgent care: it hurts, it is new, it can wait a few hours. Cheapest sensible door for most things.",
      "Hospital emergency: severe, sudden, or getting worse. Slowest and dearest for anything that is not.",
      "Take ID and your insurance details. Many places want payment at the counter and reimburse later.",
    ],
    needs: ["What is wrong and for how long", "The city you are in", "Whether you have local insurance"],
    reads: ["care_nearby", "local_help"],
    never: "Echo does not diagnose, does not judge how bad it is, and never calls emergency services for you.",
    checked_on: CHECKED,
  },
  {
    id: "prescription",
    title: "Prescription away from home",
    first: "Photograph the box and the label, including the active ingredient — the brand name changes across borders, the ingredient does not.",
    steps: [
      "Ask a pharmacy for the local equivalent by active ingredient and dose.",
      "Some drugs that are over the counter at home need a local prescription, and a few are not legal at all. Ask before you assume.",
      "A local clinic visit is often the fastest way to get a valid local prescription.",
      "Carry the label photo and any doctor's letter through airports with the medicine in its original box.",
    ],
    needs: ["Active ingredient and dose", "Country you are in", "How many days you have left"],
    reads: ["care_nearby", "body_read"],
    never: "Echo does not advise on dosage, substitutes, or whether to stop taking something.",
    checked_on: CHECKED,
  },
  {
    id: "paperwork",
    title: "Printing, notary, mail or copies",
    first: "Check what the receiving side will actually accept — a scan, a stamped copy, or a wet signature are three different errands.",
    steps: [
      "Printing and scanning: copy shops, print shops, and many hotel desks and libraries.",
      "Notarising: in much of Europe and Latin America a notary is a formal appointment; in the US and UK a bank or a solicitor often covers it.",
      "Sending something that must arrive: use a tracked courier, not standard post, and keep the receipt.",
      "Take ID to anything involving a stamp. Ask about the fee before the appointment.",
    ],
    needs: ["What the document is for", "What format the other side demands", "The city you are in"],
    reads: ["how_things_work"],
    never: "Echo does not certify, notarise, or send documents.",
    checked_on: CHECKED,
  },
  {
    id: "gov_office",
    title: "Government office visit",
    first: "Find the exact document list on the official site and print it — do not go on somebody's forum summary.",
    steps: [
      "Check whether it is appointment-only. Turning up at an appointment-only office costs you the day.",
      "Bring originals plus photocopies of everything, plus passport photos. Copies are the usual reason people get sent home.",
      "Arrive at opening. Queue numbers run out, not just close.",
      "Ask, before you leave the counter, what happens next and by when. Get that in writing if they will give it.",
    ],
    needs: ["Which office and which application", "Your nationality and status", "Any deadline you are working to"],
    reads: ["how_things_work", "whats_due"],
    never: "Echo does not book appointments, submit applications, or speak to an office for you.",
    checked_on: CHECKED,
  },
  {
    id: "baggage",
    title: "Bag delayed or damaged",
    first: "Do not leave the airport without a written report — the file reference is the whole claim.",
    steps: [
      "Report at the baggage desk in the arrivals hall before customs, and keep the reference.",
      "Damaged bags usually have a short reporting window, often the same day. Delayed bags have a longer one.",
      "Keep receipts for anything you have to buy while it is missing. That is what gets reimbursed, up to a cap.",
      "Claim with the airline that carried the last leg, whoever you booked through.",
    ],
    needs: ["Airline and flight", "Report reference", "What was in it that matters"],
    reads: ["flights_prepared"],
    never: "Echo does not file a baggage claim or chase an airline.",
    checked_on: CHECKED,
  },
  {
    id: "fee_check",
    title: "Is this fee normal, or am I being tourist-priced?",
    first: "Get the price in writing or on a meter before you agree to anything.",
    steps: [
      "Compare it against the published price if one exists — official taxi tariffs, posted menus, and government fee schedules are public.",
      "Ask what the fee is for, by name. A charge that cannot be named usually is not one.",
      "In places where bargaining is normal, a first quote is an opening, not a price. In places where it is not, haggling reads as rude.",
      "If it is a service charge, check the bill for it before you add anything on top.",
    ],
    needs: ["What you are being charged for", "The amount and currency", "Where you are"],
    reads: ["how_things_work", "local_customs", "convert_money"],
    never: "Echo does not tell you a price is a scam. It shows you the published figure where one exists, and says when there is none.",
    checked_on: CHECKED,
  },
];

const WORDS: Record<TroubleId, string[]> = {
  lost_wallet: ["lost my wallet", "wallet", "lost my purse", "purse stolen", "wallet stolen"],
  lost_passport: ["passport", "lost my passport", "passport stolen"],
  card_declined: ["declined", "card not working", "card won't work", "card wont work", "payment refused", "card blocked"],
  card_eaten: ["atm ate", "ate my card", "machine kept my card", "atm kept", "card stuck", "retained my card"],
  dead_phone: ["phone died", "dead phone", "phone is dead", "battery died", "broke my phone", "phone broken"],
  missed_transport: ["missed my train", "missed the train", "missed my bus", "wrong bus", "missed my connection", "missed the flight", "missed my flight"],
  hotel_problem: ["hotel", "room is", "airbnb", "no hot water", "the room"],
  taxi_problem: ["taxi", "cab", "uber", "grab driver", "ride driver", "overcharged me"],
  locked_out: ["locked out", "lost my keys", "can't get in", "cant get in", "locked myself"],
  missing_package: ["package", "parcel", "delivery never", "didn't arrive", "didnt arrive", "tracking says"],
  utility_outage: ["power is out", "power out", "no electricity", "internet is down", "no internet", "outage", "wifi is down"],
  vehicle_trouble: ["flat tyre", "flat tire", "scooter", "motorbike", "car won't start", "car wont start", "broke down"],
  broken_appliance: ["broken", "not working", "appliance", "washing machine", "fridge", "air con", "aircon", "boiler"],
  where_for_care: ["doctor", "clinic", "pharmacy", "hospital", "should i go to", "am i sick", "urgent care"],
  prescription: ["prescription", "my medication", "medicine", "refill", "pills", "run out of my"],
  paperwork: ["notary", "notarise", "notarize", "print", "photocopy", "post office", "send documents", "certified copy"],
  gov_office: ["immigration office", "visa office", "town hall", "government office", "dmv", "registration office", "residence permit"],
  baggage: ["bag didn't", "bag didnt", "luggage", "baggage", "suitcase damaged", "lost my bag"],
  fee_check: ["is this normal", "tourist price", "tourist priced", "am i being ripped", "ripped off", "is this fee", "too expensive", "scam price"],
};

/** The situation the person described, or null when Echo keeps no playbook for it. */
export function matchTrouble(text: string | null | undefined): Playbook | null {
  const t = (text ?? "").toLowerCase();
  if (!t.trim()) return null;
  let best: { id: TroubleId; score: number } | null = null;
  for (const [id, words] of Object.entries(WORDS) as Array<[TroubleId, string[]]>) {
    for (const w of words) {
      if (!t.includes(w)) continue;
      const score = w.length;
      if (!best || score > best.score) best = { id, score };
    }
  }
  if (!best) return null;
  return PLAYBOOKS.find((p) => p.id === best!.id) ?? null;
}

export function playbook(id: string): Playbook | null {
  return PLAYBOOKS.find((p) => p.id === id) ?? null;
}

export function troubleTitles(): string[] {
  return PLAYBOOKS.map((p) => p.title);
}

export function noPlaybookWords(text: string | null | undefined): string {
  const said = (text ?? "").trim();
  return [
    said
      ? "Echo has no kept playbook for that one, so it will not invent a set of steps."
      : "Echo needs to know what actually went wrong before it can line anything up.",
    `Situations it does keep: ${troubleTitles().join(", ")}.`,
    TROUBLE_LAW,
  ].join(" ");
}

/** One answer: the first move, the order, what Echo still needs, and the edge. */
export function troubleAnswer(text: string | null | undefined): string {
  const pb = matchTrouble(text);
  if (!pb) return noPlaybookWords(text);
  return [
    `${pb.title}. First: ${pb.first}`,
    `Then: ${pb.steps.map((s, i) => `${i + 1}) ${s}`).join(" ")}`,
    `Echo needs from you: ${pb.needs.join("; ")}.`,
    pb.never,
    `Kept notes, checked ${pb.checked_on}.`,
  ].join(" ");
}
