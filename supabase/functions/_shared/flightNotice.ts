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
import {
  fillPatch,
  isSameFiledFlight,
  reconcileFlight,
  reconcileWords,
  type FiledFlight,
} from "./flightReconcile.ts";

type SupabaseClient = { from: (table: string) => any; rpc?: (fn: string, args: Record<string, unknown>) => any };

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
  /** Flights already on record. Left alone unless the evidence filled a blank. */
  known: number;
  questions: string[];
  /** Blanks this evidence filled on a flight that already existed. */
  filled: string[];
  /** Facts this evidence disagrees with. Nothing was written for these. */
  conflicts: string[];
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
 * Keep the original evidence attached to the flight it spoke about, so the
 * desk, Today and Ask can all say which source a fact came from. A link that
 * cannot be written is not worth failing a capture over.
 */
async function linkEvidence(
  sb: SupabaseClient,
  scope: NoticeScope,
  planId: string,
  ref: { kind: string; id: string } | null | undefined,
  reason: string,
): Promise<void> {
  if (!ref?.id) return;
  /* The same link table the rest of the product uses, with the words it
     already accepts: a stored file or note is *about* this flight. Written
     here rather than through the user-facing helper, because a sweep has no
     session — the link still carries the person it belongs to. */
  const kind = ref.kind === "ingested_file" ? "file" : ref.kind;
  if (!["file", "note", "message", "capture"].includes(kind)) return;
  try {
    const { data: existing } = await sb
      .from("cross_links")
      .select("id")
      .eq("user_id", scope.userId)
      .eq("source_kind", kind)
      .eq("source_id", ref.id)
      .eq("target_kind", "flight_plan")
      .eq("target_id", planId)
      .maybeSingle();
    if (existing?.id) return;
    const { data: link, error } = await sb
      .from("cross_links")
      .insert({
        user_id: scope.userId,
        source_kind: kind,
        source_id: ref.id,
        target_kind: "flight_plan",
        target_id: planId,
        relation: "about",
        confidence: "high",
        created_by: "system",
        reason,
      })
      .select("id")
      .single();
    if (error || !link) throw new Error(error?.message ?? "no link");
    await sb.from("audit_log").insert({
      user_id: scope.userId,
      organization_id: scope.orgId,
      entity_type: "cross_link",
      entity_id: link.id,
      event: "link.created",
      payload: {
        source_kind: kind,
        source_id: ref.id,
        target_kind: "flight_plan",
        target_id: planId,
        relation: "about",
        created_by: "system",
        reason,
      },
    });
  } catch (e) {
    console.error("flightNotice evidence link", (e as Error)?.message);
  }
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
  const empty: NoticeResult = { created: 0, asked: 0, known: 0, questions: [], filled: [], conflicts: [] };

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

  const result: NoticeResult = { created: 0, asked: 0, known: 0, questions: [], filled: [], conflicts: [] };

  for (const leg of recognition.legs) {
    if (!leg.depart_on) continue;
    /* The same flight on the same day is the same flight. Read the day's drafts
       and compare rather than trusting a unique index over jsonb. */
    const { data: sameDay } = await scoped(
      sb
        .from("flight_plans")
        .select("id, origin, destination, depart_on, options, booking_ref, traveller_name, noticed_from")
        .eq("depart_on", leg.depart_on),
      scope,
    );
    const filed = ((sameDay ?? []) as any[]).find((r) =>
      isSameFiledFlight(
        {
          id: String(r.id),
          origin: r.origin ?? null,
          destination: r.destination ?? null,
          depart_on: String(r.depart_on),
          booking_ref: r.booking_ref ?? null,
          traveller_name: r.traveller_name ?? null,
          options: Array.isArray(r.options) ? r.options : [],
        },
        leg,
      ),
    );
    if (filed) {
      /* The flight exists. New evidence is allowed to fill what is blank, is
         recorded when it agrees, and is only ever a question when it disagrees.
         Nothing already filled in is rewritten here. */
      result.known += 1;
      const record: FiledFlight = {
        id: String(filed.id),
        origin: filed.origin ?? null,
        destination: filed.destination ?? null,
        depart_on: String(filed.depart_on),
        booking_ref: filed.booking_ref ?? null,
        traveller_name: filed.traveller_name ?? null,
        options: Array.isArray(filed.options) ? filed.options : [],
      };
      const recon = reconcileFlight(record, leg, {
        booking_ref: recognition.booking_ref,
        traveller: recognition.travellers[0] ?? null,
      });
      const patch = fillPatch(record, recon.fills, { arrive_on: leg.arrive_on ?? null });
      /* The provenance trail grows; it is never replaced. Each source that
         contributed stays readable on the flight. */
      const previous = (filed.noticed_from ?? {}) as Record<string, unknown>;
      const nowIso = new Date().toISOString();
      const nextNoticed: Record<string, unknown> = { ...previous };
      /* Where it was booked is provenance: recorded when it is blank, never
         rewritten, and never used as a status. */
      const bookingFilled =
        recognition.booking && !previous.booking
          ? ((nextNoticed.booking = recognition.booking), true)
          : false;
      /* A disagreement is kept on the flight so it can be settled where the
         flight lives. Nothing here writes the disputed field. */
      if (recon.conflicts.length) {
        const open = Array.isArray(previous.conflicts)
          ? (previous.conflicts as Array<Record<string, unknown>>)
          : [];
        const added = recon.conflicts
          .filter((c) => !open.some((o) => o.key === c.key && o.seen === c.seen))
          .map((c) => ({
            key: c.key,
            filed: c.filed,
            seen: c.seen,
            words: c.words,
            source_words: SOURCE_WORDS[input.source],
            at: nowIso,
          }));
        nextNoticed.conflicts = [...open, ...added];
      }
      /* A sentence that makes something wait on this flight is kept as words.
         It becomes a promise only when the person says so. */
      if (recognition.condition && !previous.condition) {
        nextNoticed.condition = { ...recognition.condition, at: nowIso, kept_at: null };
      }
      if (patch || bookingFilled || recon.conflicts.length || nextNoticed.condition !== previous.condition) {
        const filledKeys = [...recon.fills.map((f) => f.key), ...(bookingFilled ? ["booking"] : [])];
        nextNoticed.sources = [
          ...(Array.isArray(previous.sources) ? (previous.sources as unknown[]) : []),
          {
            source: input.source,
            source_words: SOURCE_WORDS[input.source],
            origin_ref: input.origin_ref ?? null,
            filled: filledKeys,
            line: leg.line,
            at: nowIso,
          },
        ];
        const { error: upErr } = await sb
          .from("flight_plans")
          .update({ ...(patch ?? {}), noticed_from: nextNoticed })
          .eq("id", record.id);
        if (upErr) console.error("flightNotice fill", upErr.message);
        else if (patch || bookingFilled) {
          result.filled.push(
            ...recon.fills.map((f) => f.words),
            ...(bookingFilled ? [recognition.booking!.words] : []),
          );
          await sb.from("audit_log").insert({
            user_id: scope.userId,
            organization_id: scope.orgId,
            entity_type: "flight_plan",
            entity_id: record.id,
            event: "flight.filled_from_evidence",
            payload: {
              flight_no: leg.flight_no,
              source: input.source,
              origin_ref: input.origin_ref ?? null,
              filled: [
                ...recon.fills.map((f) => ({ fact: f.key, value: f.value })),
                ...(bookingFilled ? [{ fact: "booking", value: recognition.booking!.words }] : []),
              ],
              overwritten: [],
            },
          });
        }
      }
      if (recognition.condition) await noticeCondition(sb, scope, record.id, leg.flight_no, recognition.condition);
      if (recon.conflicts.length) {
        result.conflicts.push(...recon.conflicts.map((c) => c.words));
        await sb.from("audit_log").insert({
          user_id: scope.userId,
          organization_id: scope.orgId,
          entity_type: "flight_plan",
          entity_id: record.id,
          event: "flight.evidence_conflict",
          payload: {
            flight_no: leg.flight_no,
            source: input.source,
            origin_ref: input.origin_ref ?? null,
            conflicts: recon.conflicts,
            changed: false,
          },
        });
        await sb.from("nudges").insert({
          user_id: scope.userId,
          organization_id: scope.orgId,
          kind: "flight_evidence_conflict",
          title: `Two versions of ${leg.flight_no}`,
          body: reconcileWords(recon).join(" "),
          related_entity_type: "flight_plan",
          related_entity_id: record.id,
          priority: 55,
          dedupe_key: `flight_conflict:${leg.flight_no}:${leg.depart_on}`,
        });
      }
      await linkEvidence(sb, scope, record.id, input.origin_ref, `read off ${SOURCE_WORDS[input.source]}`);
      continue;
    }


    /* A booking with no departure time on it gets no departure time. Midnight
       would read as a fact nobody wrote down. An overnight flight lands on the
       day the evidence actually named, not the day it left. */
    const departAt = leg.depart_time ? `${leg.depart_on}T${leg.depart_time}:00` : null;
    const arriveAt = leg.arrive_time
      ? `${leg.arrive_on ?? leg.depart_on}T${leg.arrive_time}:00`
      : null;

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
          /* Where it was booked, when the page named it. Provenance only. */
          booking: recognition.booking ?? null,
          condition: recognition.condition
            ? { ...recognition.condition, at: new Date().toISOString(), kept_at: null }
            : null,
        },
      })
      .select("id")
      .single();
    if (error || !plan) {
      console.error("flightNotice insert", error?.message);
      continue;
    }
    result.created += 1;
    await linkEvidence(sb, scope, String(plan.id), input.origin_ref, `read off ${SOURCE_WORDS[input.source]}`);



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
    if (recognition.condition) {
      await noticeCondition(sb, scope, String(plan.id), leg.flight_no, recognition.condition);
    }
  }
  return result;
}

/**
 * One note that something is waiting on this flight. It is a draft: a promise
 * only exists once the person keeps it, and the words come off the evidence,
 * never off a rule Echo made up. Deduped per flight, so a resend is silent.
 */
async function noticeCondition(
  sb: SupabaseClient,
  scope: NoticeScope,
  flightId: string,
  flightNo: string,
  condition: { words: string; because: string },
): Promise<void> {
  const { error } = await sb.from("nudges").insert({
    user_id: scope.userId,
    organization_id: scope.orgId,
    kind: "flight_condition_noticed",
    title: `Something is waiting on ${flightNo}`,
    body: `"${condition.words}" Keep it as a promise on this flight, or leave it as a note.`,
    related_entity_type: "flight_plan",
    related_entity_id: flightId,
    priority: 45,
    dedupe_key: `flight_condition:${flightId}`,
  });
  if (error && !/duplicate/i.test(error.message)) console.error("flightNotice condition", error.message);
  else if (!error) {
    await sb.from("audit_log").insert({
      user_id: scope.userId,
      organization_id: scope.orgId,
      entity_type: "flight_plan",
      entity_id: flightId,
      event: "flight.condition_noticed",
      payload: { flight_no: flightNo, words: condition.words, because: condition.because, kept: false },
    });
  }
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
