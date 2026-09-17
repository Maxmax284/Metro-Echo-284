import { describe, it, expect } from "vitest";
import {
  planDelivery,
  dedupeKey,
  pushPayload,
  deliveryReceipt,
  lockScreenWords,
  ACTION_STATUS,
  type DeliveryRequest,
} from "@/lib/delivery";

const situation = { id: "f1", kind: "flight_change", url: "/flights?plan=f1" };

function req(over: Partial<DeliveryRequest> = {}): DeliveryRequest {
  return {
    situation,
    urgency: "time_sensitive",
    sensitivity: "ordinary",
    headline: "Gate 64 now, 23 minutes later",
    detail: "TG601 moved gate and time.",
    changeKey: "gate:64",
    context: { pushOptIn: true, pushSubscribed: true, messagingOptIn: true, messagingLinked: true },
    ...over,
  };
}

describe("one event, one delivery", () => {
  it("reaches the phone when the phone is opted in", () => {
    const plan = planDelivery(req());
    expect(plan.surface).toBe("phone");
    expect(plan.fallback).toBe("messaging");
    expect(plan.duplicate).toBe(false);
  });

  it("stays silent for a repeat of the same change", () => {
    const plan = planDelivery(
      req({ prior: [{ dedupeKey: dedupeKey(situation, "gate:64"), surface: "phone", sentAt: "now", ok: true }] }),
    );
    expect(plan.surface).toBe("silent");
    expect(plan.duplicate).toBe(true);
    expect(plan.because).toContain("already delivered");
  });

  it("treats a different change as a different event", () => {
    const plan = planDelivery(
      req({ changeKey: "gate:S110", prior: [{ dedupeKey: dedupeKey(situation, "gate:64"), surface: "phone", sentAt: "now", ok: true }] }),
    );
    expect(plan.surface).toBe("phone");
    expect(plan.duplicate).toBe(false);
  });

  it("does not double-buzz push and Telegram for one event", () => {
    const plan = planDelivery(req());
    expect(["phone", "messaging", "today", "silent"]).toContain(plan.surface);
    expect(plan.surface).not.toBe("messaging");
  });

  it("falls back to Telegram only when the phone is not available", () => {
    const plan = planDelivery(req({ context: { messagingOptIn: true, messagingLinked: true } }));
    expect(plan.surface).toBe("messaging");
    expect(plan.fallback).toBe("today");
  });

  it("holds a time-sensitive item in Today during quiet hours", () => {
    const plan = planDelivery(req({ context: { pushOptIn: true, pushSubscribed: true, sleeping: true } }));
    expect(plan.surface).toBe("today");
    expect(plan.because).toContain("quiet hours");
  });

  it("lets a critical item through quiet hours", () => {
    const plan = planDelivery(
      req({ urgency: "critical", context: { pushOptIn: true, pushSubscribed: true, sleeping: true } }),
    );
    expect(plan.surface).toBe("phone");
  });

  it("says nothing at all when nothing earns an interruption", () => {
    const plan = planDelivery(req({ urgency: "background" }));
    expect(plan.surface).toBe("silent");
    expect(plan.actions).toEqual([]);
    expect(deliveryReceipt(plan, true)).toContain("Said nothing");
  });

  it("keeps attention-level items in Today with no actions", () => {
    const plan = planDelivery(req({ urgency: "attention" }));
    expect(plan.surface).toBe("today");
    expect(plan.actions).toEqual([]);
  });
});

describe("notification wording and actions", () => {
  it("hides sensitive content on the lock screen by default", () => {
    const words = lockScreenWords(req({ sensitivity: "sensitive" }));
    expect(words).not.toContain("TG601");
    expect(words).toContain("Open Metro Echo");
  });

  it("shows ordinary detail on the lock screen", () => {
    expect(lockScreenWords(req())).toContain("TG601");
  });

  it("offers only low-consequence actions and deep-links to the situation", () => {
    const payload = pushPayload(planDelivery(req()));
    const names = payload.actions.map((a) => a.action);
    expect(names).toContain("view");
    expect(names).not.toContain("approve" as never);
    expect(names.length).toBeLessThanOrEqual(3);
    expect(payload.url).toBe("/flights?plan=f1");
    expect(payload.tag).toBe(dedupeKey(situation, "gate:64"));
  });

  it("maps every action to a status, never to an execution", () => {
    expect(ACTION_STATUS.later).toBe("snoozed");
    expect(ACTION_STATUS.got_it).toBe("acted");
    expect(ACTION_STATUS.stop_watching).toBe("muted");
  });

  it("writes a receipt whether the reach worked or not", () => {
    const plan = planDelivery(req());
    expect(deliveryReceipt(plan, true)).toContain("Reached your phone");
    expect(deliveryReceipt(plan, false)).toContain("failed");
  });
});
