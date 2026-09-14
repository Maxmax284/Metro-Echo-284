import { describe, expect, it } from "vitest";
import {
  appointmentReminderSignals,
  eventKey,
  isMeaningfulAppointment,
  reminderClass,
  reminderToSignal,
} from "../lib/awareness";
import { classifyUrgency, scoreRelevance, recommendDelivery, suppress, signalDedupeKey } from "../lib/awareness";

const TZ = "America/New_York";
const scope = { userId: "u1", organizationId: null as string | null };

// Sat evening in New York (19:05 local), the day before the appointment.
const EVENING = new Date("2026-09-13T23:05:00Z").getTime();
// Same day, 11:00 local, five hours before the appointment.
const MORNING_OF = new Date("2026-09-14T15:00:00Z").getTime();

const adhd = {
  id: "row-google",
  uid: "6gqjcc9o@google.com",
  title: "ADHD appointment",
  location: "Loudoun",
  starts_at: "2026-09-14T20:00:00Z",
  ends_at: "2026-09-14T21:00:00Z",
  all_day: false,
};
// The same appointment as carried by the second feed.
const adhdMirror = { ...adhd, id: "row-ical", feed_id: "ical" };

function relevanceFor(signal: any, now: number) {
  const hours = (new Date(signal.currentState.due_at).getTime() - now) / 3_600_000;
  return scoreRelevance(signal, { hoursUntilDue: hours });
}

describe("appointment meaning", () => {
  it("counts a real appointment", () => {
    expect(isMeaningfulAppointment(adhd)).toBe(true);
  });
  it("ignores calendar furniture and all-day rows", () => {
    expect(isMeaningfulAppointment({ ...adhd, title: "Busy" })).toBe(false);
    expect(isMeaningfulAppointment({ ...adhd, title: "Dani's birthday" })).toBe(false);
    expect(isMeaningfulAppointment({ ...adhd, all_day: true })).toBe(false);
    expect(isMeaningfulAppointment({ ...adhd, title: "  " })).toBe(false);
    // A whole working day blocked out is a block, not an appointment.
    expect(isMeaningfulAppointment({ ...adhd, title: "Offsite", ends_at: "2026-09-15T08:00:00Z" })).toBe(false);
  });
});

describe("which heads-up an appointment earns", () => {
  it("gives a meaningful appointment one evening-before heads-up", () => {
    expect(reminderClass(adhd, EVENING, TZ)).toBe("next_day");
  });
  it("stays quiet outside the evening window", () => {
    // 09:05 local the day before — too early to be useful.
    expect(reminderClass(adhd, new Date("2026-09-13T13:05:00Z").getTime(), TZ)).toBeNull();
  });
  it("speaks once on the day, a few hours out", () => {
    expect(reminderClass(adhd, MORNING_OF, TZ)).toBe("same_day");
    // Eight hours out on the day is premature.
    expect(reminderClass(adhd, new Date("2026-09-14T12:00:00Z").getTime(), TZ)).toBeNull();
  });
  it("leaves the last 45 minutes to the starts-soon signal", () => {
    expect(reminderClass(adhd, new Date("2026-09-14T19:30:00Z").getTime(), TZ)).toBeNull();
  });
  it("stays quiet for a low-value calendar item", () => {
    expect(reminderClass({ ...adhd, title: "Blocked" }, EVENING, TZ)).toBeNull();
  });
  it("honors an explicit reminder request even for a boring entry", () => {
    expect(reminderClass({ ...adhd, title: "Hold" }, EVENING, TZ, { explicit: true })).toBe("next_day");
    // Explicit intent may also speak earlier in the day, but never overnight.
    expect(
      reminderClass({ ...adhd, title: "Hold" }, new Date("2026-09-13T13:05:00Z").getTime(), TZ, { explicit: true }),
    ).toBe("next_day");
    expect(
      reminderClass({ ...adhd, title: "Hold" }, new Date("2026-09-13T09:05:00Z").getTime(), TZ, { explicit: true }),
    ).toBeNull();
  });
  it("reads tomorrow in the person's own zone, not UTC", () => {
    const lateNight = { ...adhd, starts_at: "2026-09-15T02:00:00Z", ends_at: "2026-09-15T03:00:00Z" };
    // 10 PM Monday in New York is still tomorrow from Sunday evening.
    expect(reminderClass(lateNight, EVENING, TZ)).toBe("next_day");
    // In UTC that same instant is two days out, so nothing is said yet.
    expect(reminderClass(lateNight, EVENING, "UTC")).toBeNull();
  });
});

describe("one appointment, one heads-up", () => {
  it("collapses the same appointment carried by two feeds", () => {
    const signals = appointmentReminderSignals([adhd, adhdMirror], scope, EVENING, TZ);
    expect(signals).toHaveLength(1);
    expect(signalDedupeKey(signals[0])).toBe("aw:appointment_ahead:6gqjcc9o@google.com:next_day:personal");
    expect(eventKey(adhdMirror)).toBe(eventKey(adhd));
  });

  it("does not repeat itself on the next run", () => {
    const [signal] = appointmentReminderSignals([adhd], scope, EVENING, TZ);
    const relevance = relevanceFor(signal, EVENING);
    const urgency = classifyUrgency(signal, relevance);
    const later = EVENING + 60 * 60 * 1000;
    const verdict = suppress(
      signal,
      relevance,
      urgency,
      { dedupeKey: signalDedupeKey(signal), status: "pending", lastSurfacedAt: new Date(EVENING).toISOString(), lastUrgency: null },
      { surfacedLast24h: 1, dismissedLast7d: 0, inQuietHours: false },
      later,
    );
    expect(verdict.suppressed).toBe(true);
  });

  it("stays quiet when the appointment is already speaking because it moved", () => {
    const signals = appointmentReminderSignals([adhd, adhdMirror], scope, EVENING, TZ, {
      changedUids: [adhd.uid],
    });
    expect(signals).toEqual([]);
  });

  it("says nothing about an appointment that is neither today nor tomorrow", () => {
    const nextWeek = { ...adhd, starts_at: "2026-09-20T20:00:00Z", ends_at: "2026-09-20T21:00:00Z" };
    expect(appointmentReminderSignals([nextWeek], scope, EVENING, TZ)).toEqual([]);
  });

  it("bases nothing on Google's own reminder settings", () => {
    const withGoogleReminders = { ...adhd, reminders: { overrides: [{ minutes: 10 }] } } as any;
    const signals = appointmentReminderSignals([withGoogleReminders], scope, EVENING, TZ);
    expect(signals).toHaveLength(1);
    expect(JSON.stringify(signals[0].metadata)).not.toMatch(/override|minutes/i);
  });
});

describe("how far a heads-up may reach", () => {
  const nextDay = () => reminderToSignal(adhd, "next_day", scope, EVENING, TZ);
  const sameDay = () => reminderToSignal(adhd, "same_day", scope, MORNING_OF, TZ);

  it("keeps the evening heads-up calm — Today only", () => {
    const s = nextDay();
    const r = relevanceFor(s, EVENING);
    const u = classifyUrgency(s, r);
    expect(u).toBe("attention");
    expect(
      recommendDelivery(u, { pushOptIn: true, pushSubscribed: true, messagingOptIn: true, messagingLinked: true })
        .recommendedChannel,
    ).toBe("today");
  });

  it("lets the same-day heads-up reach the phone, with Telegram only as fallback", () => {
    const s = sameDay();
    const r = relevanceFor(s, MORNING_OF);
    const u = classifyUrgency(s, r);
    expect(u).toBe("time_sensitive");
    // Both available: phone wins, Telegram does not also fire.
    expect(
      recommendDelivery(u, { pushOptIn: true, pushSubscribed: true, messagingOptIn: true, messagingLinked: true })
        .recommendedChannel,
    ).toBe("phone");
    // No usable phone: Telegram carries it instead.
    expect(
      recommendDelivery(u, { pushOptIn: true, pushSubscribed: false, messagingOptIn: true, messagingLinked: true })
        .recommendedChannel,
    ).toBe("messaging");
    // Neither switched on: it still lands in Today, and nowhere else.
    expect(recommendDelivery(u, {}).recommendedChannel).toBe("today");
  });

  it("holds everything during quiet hours", () => {
    const s = sameDay();
    const r = relevanceFor(s, MORNING_OF);
    const verdict = suppress(s, r, classifyUrgency(s, r), null, {
      surfacedLast24h: 0,
      dismissedLast7d: 0,
      inQuietHours: true,
    }, MORNING_OF);
    expect(verdict).toMatchObject({ suppressed: true, reason: "quiet_hours" });
  });

  it("surfaces normally outside quiet hours", () => {
    const s = nextDay();
    const r = relevanceFor(s, EVENING);
    const verdict = suppress(s, r, classifyUrgency(s, r), null, {
      surfacedLast24h: 0,
      dismissedLast7d: 0,
      inQuietHours: false,
    }, EVENING);
    expect(verdict.suppressed).toBe(false);
  });
});

describe("staying out of Google's lane", () => {
  it("drops the same-day heads-up when Google keeps the day-of alarm", () => {
    const out = appointmentReminderSignals([adhd], scope, MORNING_OF, TZ, { deferToGoogle: true });
    expect(out).toHaveLength(0);
  });
  it("still gives the evening look-ahead Google never speaks", () => {
    const out = appointmentReminderSignals([adhd], scope, EVENING, TZ, { deferToGoogle: true });
    expect(out).toHaveLength(1);
    expect(out[0].metadata?.reminder_class).toBe("next_day");
  });
  it("honours an explicit watch even when deferring to Google", () => {
    const out = appointmentReminderSignals([adhd], scope, MORNING_OF, TZ, {
      deferToGoogle: true,
      explicitUids: [eventKey(adhd)],
    });
    expect(out).toHaveLength(1);
    expect(out[0].metadata?.reminder_class).toBe("same_day");
  });
  it("keeps the same-day heads-up when the person turns deferral off", () => {
    const out = appointmentReminderSignals([adhd, adhdMirror], scope, MORNING_OF, TZ, { deferToGoogle: false });
    expect(out).toHaveLength(1);
    expect(out[0].metadata?.reminder_class).toBe("same_day");
  });
});
