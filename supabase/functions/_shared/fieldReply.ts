// fieldReply — what Echo actually does and says when someone speaks a field
// phrase. One implementation, called by Telegram today and by Ask through the
// same router plan, so "walk with me" behaves identically in both places.
//
// The narrow contract, on purpose:
//  - The only writes are trip-session writes the person explicitly asked for.
//  - Nothing here shares a location, contacts anyone, dials anything, or
//    approves an action. High stakes makes Echo simpler, not autonomous.
//  - Every reply carries its own provenance line, so "Why this?" has a real
//    answer instead of a vibe.

import { PRODUCT_NAME } from "./brand.ts";
import { fieldCapability, type FieldMatch } from "./fieldIntent.ts";
import {
  activeSession,
  endSession,
  holdSession,
  noEtaLine,
  sessionLine,
  startSession,
  WALK_PURPOSE,
  type TripScope,
} from "./tripSession.ts";
import { formatDistance } from "./trips.ts";

export type FieldReply = {
  /** The words to send. Already in the plain, short field register. */
  text: string;
  /** One line answering "Why this?" — recorded facts only, never inference. */
  why: string;
  /** True when Echo must drop personality and stay flat. */
  simplified: boolean;
  /** The session this reply concerns, if any. */
  tripId: string | null;
  /** Deep-link target inside the platform, so a chat can hand off cleanly. */
  link: { kind: string; params?: Record<string, string> } | null;
};

/* One place to describe how Echo's location honestly works, so no surface
   quietly implies background tracking that does not exist. */
const NO_TRACKING =
  "I only know where you are when you send it — I'm not following you in the background.";

/**
 * High-stakes handoff. Options and a door, never an action.
 *
 * Deliberately does NOT: share a location, message a contact, place a call, or
 * prepare anything that could fire without approval. Location sharing and
 * trusted contacts do not exist in this platform yet, and this reply must not
 * imply they do.
 */
function safetyReply(match: FieldMatch, hasSession: boolean): FieldReply {
  if (match.intent === "high_stakes") {
    const lines = [
      "Stop and read this.",
      "",
      "If you're in danger, call your local emergency number now — your phone does that faster than I can.",
      "",
      `I can't call anyone, and I can't send your location to anyone. ${PRODUCT_NAME} has no way to do that yet, so don't wait on me for it.`,
      "",
      hasSession
        ? "Your walk is still open, so where you've been is recorded for you."
        : "Say \"walk with me\" and I'll keep a record of this trip for you.",
      "",
      `Open ${PRODUCT_NAME} and everything's there.`,
    ];
    return {
      text: lines.join("\n"),
      why: `You said "${match.matched}". Echo treats that as high-stakes: shortest answer, real emergency options first, no automatic action.`,
      simplified: true,
      tripId: null,
      link: { kind: "today" },
    };
  }
  return {
    text: [
      "Heard you.",
      "",
      "If this turns into danger, call your local emergency number — that's faster than anything I can do.",
      hasSession ? "Your walk's still running." : "Want me to keep a record? Say \"walk with me\".",
    ].join("\n"),
    why: `You said "${match.matched}". Echo reads that as unease, not an emergency, so it stays calm and offers the record — it doesn't escalate on your behalf.`,
    simplified: true,
    tripId: null,
    link: null,
  };
}

/**
 * Run a recognized field phrase. Returns null when the phrase needs the normal
 * conversational path instead (a "possible" match is asked about, not acted on).
 */
export async function runFieldIntent(
  admin: any,
  scope: TripScope,
  match: FieldMatch,
  opts: { via: string } = { via: "unknown" },
): Promise<FieldReply | null> {
  const cap = fieldCapability(match.intent);

  if (cap.offers_help) {
    const open = await activeSession(admin, scope);
    return safetyReply(match, !!open.trip);
  }

  /* A soft match never writes. Echo asks rather than opening a session the
     person didn't mean to open. */
  if (match.confidence === "possible" && cap.writes_session) {
    return {
      text: `Sounded like you're heading out. Say "walk with me" and I'll start the record.`,
      why: `You said "${match.matched}", which is close but not certain, so Echo asked instead of starting anything.`,
      simplified: false,
      tripId: null,
      link: null,
    };
  }

  switch (match.intent) {
    case "walk_start": {
      const res = await startSession(admin, scope, {
        purpose: WALK_PURPOSE,
        label: "Walk with me",
        via: opts.via,
      });
      if (!res) {
        return {
          text: "Couldn't open the walk — nothing was recorded. Try again in a second.",
          why: "The session write failed, so Echo is saying so instead of pretending a walk is running.",
          simplified: false,
          tripId: null,
          link: null,
        };
      }
      const text = res.reused
        ? [`Already walking with you.`, sessionLine(await activeSession(admin, scope)), NO_TRACKING].join("\n")
        : [
            "Walking with you.",
            `Say "I'm here" to mark a spot, "end the walk" when you're in.`,
            NO_TRACKING,
          ].join("\n");
      return {
        text: [text, res.autoClosed].filter(Boolean).join("\n\n"),
        why: res.reused
          ? `You asked to walk, and a session was already open, so Echo reused it — one walk, not two.`
          : `You said "${match.matched}". Echo opened one walk session, the same one the app shows.`,
        simplified: false,
        tripId: res.trip.id,
        link: { kind: "awareness", params: { tripId: res.trip.id } },
      };
    }

    case "walk_end": {
      const res = await endSession(admin, scope, { via: opts.via });
      if (!res) {
        return {
          text: "Nothing was running, so there was nothing to close.",
          why: "Echo checked for an open session and found none.",
          simplified: false,
          tripId: null,
          link: null,
        };
      }
      const dist = res.distanceM == null
        ? "No distance measured — you never sent a second point."
        : `Measured ${formatDistance(res.distanceM)}.`;
      return {
        text: ["Walk closed. Glad you're in.", dist].join("\n"),
        why: `You said "${match.matched}". Echo closed the one open session and recorded it — the receipt is in ${PRODUCT_NAME}.`,
        simplified: false,
        tripId: res.trip.id,
        link: { kind: "receipts" },
      };
    }

    case "walk_hold": {
      const trip = await holdSession(admin, scope, opts.via);
      if (!trip) {
        return {
          text: "No walk or trip open right now, so there's nothing to hold.",
          why: "Echo checked for an open session and found none.",
          simplified: false,
          tripId: null,
          link: null,
        };
      }
      return {
        text: "Holding it open. It won't close itself for another twelve hours.",
        why: `You asked to keep it open. Echo restarted the twelve-hour clock — it does not remove it, because a session that never closes is tracking.`,
        simplified: false,
        tripId: trip.id,
        link: null,
      };
    }

    case "walk_checkin": {
      const open = await activeSession(admin, scope);
      if (!open.trip) {
        return {
          text: `Nothing's running. Say "walk with me" first and "I'm here" will mark the spot.`,
          why: "A check-in needs an open session, and Echo found none.",
          simplified: false,
          tripId: null,
          link: null,
        };
      }
      /* Echo cannot invent a coordinate. A check-in from a chat marks the
         moment as a recorded event; the position only exists if a surface sends
         one, so no place is claimed. */
      await admin.from("audit_log").insert({
        user_id: scope.userId,
        organization_id: scope.orgId ?? null,
        entity_type: "trip",
        entity_id: open.trip.id,
        event: "trip.checked_in",
        payload: { via: opts.via, has_fix: false, said: match.matched },
      });
      return {
        text: [
          "Marked the moment.",
          "I don't have a fix from here, so it's a time, not a place. Open the Aware room if you want the spot on the map.",
        ].join("\n"),
        why: "Echo recorded the check-in against your open session. No coordinates came with the message, so none were claimed.",
        simplified: false,
        tripId: open.trip.id,
        link: { kind: "awareness", params: { tripId: open.trip.id } },
      };
    }

    case "walk_eta": {
      const open = await activeSession(admin, scope);
      return {
        text: noEtaLine(open),
        why: "Read straight off your open session: start time and the points it has. Echo has no route or destination, so it won't guess an arrival.",
        simplified: false,
        tripId: open.trip?.id ?? null,
        link: open.trip ? { kind: "awareness", params: { tripId: open.trip.id } } : null,
      };
    }

    case "trip_status": {
      const open = await activeSession(admin, scope);
      return {
        text: [sessionLine(open), open.autoClosed].filter(Boolean).join("\n\n"),
        why: open.trip
          ? "Read from the one open session row every surface shares."
          : "Echo looked for an open session and there isn't one.",
        simplified: false,
        tripId: open.trip?.id ?? null,
        link: open.trip ? { kind: "awareness", params: { tripId: open.trip.id } } : null,
      };
    }

    default:
      return null;
  }
}
