// flightNotice — a flight Echo noticed becomes a question, never a fact.
//
// Doctrine:
//   - Capture never executes. Noticing a flight files a draft with its evidence
//     attached and, when whose it is cannot be read from the record, one nudge
//     that asks. Nothing lands on the board until the person answers.
//   - One question per booking, ever. The same flight seen twice is the same
//     draft, and a sender already answered for is filed by that answer instead
//     of asked about again.
//   - No login is ever performed. This reads text that was already readable.
import {
  ownershipQuestion,
  recognizeFlights,
  relationEvidence,
  SOURCE_WORDS,
  type NoticeSource,
  type Ownership,
} from "./flightRecognize.ts";

type SupabaseClient = { from: (table: string) => any };

export type NoticeScope = { userId: string; orgId: string | null };

export type NoticeInput = {
  text: string | null | undefined;
  source: NoticeSource;
  sender?: { name?: string | null; email?: string | null } | null;
  /** Where the person can go back and read the original. */
  link?: string | null;
  /** The record this came out of, so the draft can point at it. */
  origin_ref?: { kind: string; id: string } | null;
  /** This person's own addresses, when the caller knows them. */
  myEmails?: string[];
  today?: string;
};

export type NoticeResult = {
  created: number;
  asked: number;
  /** Flights already on record, left alone. */
  known: number;
  questions: string[];
};

function scoped(q: any, scope: NoticeScope) {
  const u = q.eq("user_id", scope.userId);
  return scope.orgId ? u.eq("organization_id", scope.orgId) : u.is("organization_id", null);
}

export function senderKey(sender?: { name?: string | null; email?: string | null } | null): string | null {
  const email = (sender?.email ?? "").trim().toLowerCase();
  if (email) return email;
  const name = (sender?.name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return name || null;
}

/**
 * Read flight information out of one piece of text and file what it finds.
 * Returns what it did, so the caller can say so instead of guessing.
 */
export async function noticeFlights(
  sb: SupabaseClient,
  scope: NoticeScope,
  input: NoticeInput,
): Promise<NoticeResult> {
  const empty: NoticeResult = { created: 0, asked: 0, known: 0, questions: [] };
  const recognition = recognizeFlights(input.text, { today: input.today });
  if (!recognition.legs.length) return empty;

  /* Who this person is, from their own row. Used only to see whether their own
     name or address is on the booking. */
  const { data: profile } = await sb
    .from("profiles")
    .select("*")
    .eq("id", scope.userId)
    .maybeSingle();
  const me = {
    name: (profile?.display_name ?? profile?.full_name ?? profile?.name ?? null) as string | null,
    emails: [...(input.myEmails ?? []), (profile?.email ?? null) as string | null].filter(Boolean) as string[],
  };

  const key = senderKey(input.sender);
  let known: { ownership: Exclude<Ownership, "unknown">; name?: string | null } | null = null;
  if (key) {
    const { data: row } = await scoped(sb.from("flight_senders").select("*").eq("sender_key", key), scope).maybeSingle();
    if (row) known = { ownership: row.ownership as Exclude<Ownership, "unknown">, name: row.sender_name ?? null };
  }

  /* Places and windows already on record, so "related to you" is evidence
     rather than a feeling. */
  const [{ data: places }, { data: events }] = await Promise.all([
    scoped(sb.from("awareness_places").select("name, city, country").limit(40), scope),
    scoped(sb.from("calendar_events").select("starts_at, ends_at").order("starts_at", { ascending: false }).limit(60), scope),
  ]);
  const myPlaces = ((places ?? []) as any[])
    .flatMap((p) => [p.name, p.city, p.country])
    .filter(Boolean)
    .map(String);
  const myWindows = ((events ?? []) as any[])
    .map((e) => ({
      start: String(e.starts_at ?? "").slice(0, 10),
      end: String(e.ends_at ?? e.starts_at ?? "").slice(0, 10),
    }))
    .filter((w) => w.start && w.end);

  const relation = relationEvidence({
    recognition,
    text: input.text ?? "",
    me,
    sender: input.sender ?? null,
    knownSender: known,
    myPlaces,
    myWindows,
  });

  const result: NoticeResult = { created: 0, asked: 0, known: 0, questions: [] };

  for (const leg of recognition.legs) {
    if (!leg.depart_on) continue;
    /* The same flight on the same day is the same flight. Read the day's drafts
       and compare rather than trusting a unique index over jsonb. */
    const { data: sameDay } = await scoped(
      sb.from("flight_plans").select("id, options, booking_ref").eq("depart_on", leg.depart_on),
      scope,
    );
    const already = ((sameDay ?? []) as any[]).some((r) =>
      (Array.isArray(r.options) ? r.options : []).some(
        (o: any) => String(o?.flight_no ?? "").toUpperCase() === leg.flight_no,
      ),
    );
    if (already) {
      result.known += 1;
      continue;
    }

    const departAt = leg.depart_time ? `${leg.depart_on}T${leg.depart_time}:00` : `${leg.depart_on}T00:00:00`;
    const arriveAt = leg.arrive_time ? `${leg.depart_on}T${leg.arrive_time}:00` : null;
    const option = {
      id: `${leg.flight_no}-${leg.depart_time ?? "0000"}`,
      airline: leg.airline,
      flight_no: leg.flight_no,
      depart_at: departAt,
      arrive_at: arriveAt,
      price: null,
      currency: null,
      stops: null,
      note: leg.depart_time ? null : "no departure time was on the booking",
    };

    const ownership: Ownership = relation.suggested;
    const { data: plan, error } = await sb
      .from("flight_plans")
      .insert({
        user_id: scope.userId,
        organization_id: scope.orgId,
        origin: leg.origin ?? "",
        destination: leg.destination ?? "",
        depart_on: leg.depart_on,
        passengers: Math.max(1, recognition.travellers.length || 1),
        currency: null,
        source: "pasted",
        options: [option],
        status: "prepared",
        origin_kind: "recognised",
        ownership,
        traveller_name: recognition.travellers[0] ?? null,
        booking_ref: recognition.booking_ref,
        noticed_from: {
          source: input.source,
          source_words: SOURCE_WORDS[input.source],
          sender: input.sender ?? null,
          link: input.link ?? null,
          origin_ref: input.origin_ref ?? null,
          evidence: relation.lines,
          confidence: relation.confidence,
          line: leg.line,
          noticed_at: new Date().toISOString(),
        },
      })
      .select("id")
      .single();
    if (error || !plan) {
      console.error("flightNotice insert", error?.message);
      continue;
    }
    result.created += 1;

    await sb.from("audit_log").insert({
      user_id: scope.userId,
      organization_id: scope.orgId,
      entity_type: "flight_plan",
      entity_id: plan.id,
      event: "flight.noticed",
      payload: {
        flight_no: leg.flight_no,
        depart_on: leg.depart_on,
        source: input.source,
        sender: key,
        ownership,
        confidence: relation.confidence,
        bought: false,
      },
    });

    if (ownership === "unknown") {
      const question = ownershipQuestion({ ...recognition, legs: [leg] }, input.source, input.sender ?? null);
      result.asked += 1;
      result.questions.push(question);
      await sb.from("nudges").insert({
        user_id: scope.userId,
        organization_id: scope.orgId,
        kind: "flight_noticed",
        title: "A flight turned up that Echo cannot place",
        body: [question, ...relation.lines].join(" "),
        related_entity_type: "flight_plan",
        related_entity_id: plan.id,
        priority: 40,
        dedupe_key: `flight_noticed:${leg.flight_no}:${leg.depart_on}`,
      });
    }
  }
  return result;
}

/** The person's answer, remembered against the sender so it is asked once. */
export async function rememberSender(
  sb: SupabaseClient,
  scope: NoticeScope,
  sender: { key: string; name?: string | null },
  ownership: Exclude<Ownership, "unknown">,
): Promise<void> {
  const { data: existing } = await scoped(
    sb.from("flight_senders").select("id, times_seen").eq("sender_key", sender.key),
    scope,
  ).maybeSingle();
  if (existing) {
    await sb
      .from("flight_senders")
      .update({
        ownership,
        sender_name: sender.name ?? null,
        times_seen: Number(existing.times_seen ?? 1) + 1,
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    return;
  }
  await sb.from("flight_senders").insert({
    user_id: scope.userId,
    organization_id: scope.orgId,
    sender_key: sender.key,
    sender_name: sender.name ?? null,
    ownership,
  });
}
