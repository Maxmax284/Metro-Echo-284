import { describe, it, expect } from "vitest";
import { eventPhrase } from "@/components/memory/CaptureEventGroup";

describe("eventPhrase", () => {
  it("names known bridge events in plain English", () => {
    expect(eventPhrase("guest.message_received", 16)).toBe("16 guest messages");
    // The bridge actually sends this spelling; both must read the same.
    expect(eventPhrase("guest_message.received", 16)).toBe("16 guest messages");

    expect(eventPhrase("guest.message_received", 1)).toBe("1 guest message");
    expect(eventPhrase("booking.state_changed", 2)).toBe("2 booking updates");
  });

  it("never pluralizes the verb at the end of an unknown phrase", () => {
    const out = eventPhrase("shipment.label_printed", 3);
    expect(out).toBe("3 shipments label printed");
    expect(out.endsWith("printeds")).toBe(false);
  });

  it("leaves a single unknown event singular", () => {
    expect(eventPhrase("shipment.label_printed", 1)).toBe("1 shipment label printed");
  });
});
