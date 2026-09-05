import { describe, expect, it } from "vitest";
import { fieldRead } from "@/lib/fieldRead";
import { detectDocTypeFromFile, firstPassIntake } from "@/lib/fileIntake";
import type { Trip, TripPoint } from "@/lib/trips";

const START = "2026-01-01T10:00:00.000Z";
const NOW = new Date("2026-01-01T10:30:00.000Z").getTime();

const trip = (over: Partial<Trip> = {}): Trip =>
  ({
    id: "t1",
    label: null,
    purpose: null,
    started_at: START,
    ended_at: null,
    start_label: "Depot",
    end_label: null,
    distance_m: null,
    point_count: 0,
    closed_by: "open",
    ...over,
  }) as Trip;

const pt = (min: number, lat: number, lon: number, kind = "sample"): TripPoint =>
  ({
    lat,
    lon,
    accuracy_m: 10,
    kind,
    label: null,
    recorded_at: new Date(new Date(START).getTime() + min * 60_000).toISOString(),
  }) as TripPoint;

describe("fieldRead", () => {
  it("says nothing when no trip is open", () => {
    expect(fieldRead(null, [], [], NOW)).toBeNull();
    expect(fieldRead(trip({ ended_at: START }), [], [], NOW)).toBeNull();
  });

  it("reads a running trip with distance and elapsed time", () => {
    const read = fieldRead(trip(), [pt(0, 13.0, 100.0, "start"), pt(10, 13.02, 100.0)], [], NOW)!;
    expect(read.headline).toContain("Trip running for");
    expect(read.distanceM).toBeGreaterThan(1000);
    expect(read.points).toHaveLength(2);
    expect(read.points[0].line).toContain("Started");
    expect(read.nextStep).toContain("I'm here");
  });

  it("never claims a distance it has not measured", () => {
    const read = fieldRead(trip(), [], [], NOW)!;
    expect(read.distanceM).toBeNull();
    expect(read.headline).toContain("distance not measured yet");
    expect(read.summary).toContain("Nothing recorded yet");
  });

  it("measures the nearest saved place from the last point", () => {
    const places = [{ id: "p1", label: "Lamai", lat: 13.02, lon: 100.0 }];
    const read = fieldRead(trip(), [pt(0, 13.0, 100.0, "start"), pt(10, 13.019, 100.0)], places, NOW)!;
    expect(read.nextPlace?.label).toBe("Lamai");
    expect(read.nextLine).toContain("Lamai");
  });

  it("says so when nothing is saved to measure against", () => {
    const read = fieldRead(trip(), [pt(0, 13.0, 100.0, "start")], [], NOW)!;
    expect(read.nextLine).toContain("No saved place");
  });

  it("names a walk session as a walk", () => {
    const read = fieldRead(trip({ purpose: "walk_with_me" }), [pt(0, 13, 100, "start")], [], NOW)!;
    expect(read.isWalk).toBe(true);
    expect(read.headline).toContain("Walk running");
  });
});

describe("first-pass file intake", () => {
  it("classifies by filename and mime shape", () => {
    expect(detectDocTypeFromFile({ filename: "invoice-201.pdf" })).toBe("invoice");
    expect(detectDocTypeFromFile({ filename: "photo.jpg", mime: "image/jpeg" })).toBe("image");
    expect(detectDocTypeFromFile({ filename: "note.oga", isVoice: true })).toBe("voice_note");
    expect(detectDocTypeFromFile({ filename: "scan.pdf" })).toBe("other");
    expect(detectDocTypeFromFile({ filename: "x.bin" })).toBe("unknown");
  });

  it("uses the caption when the filename says nothing", () => {
    expect(detectDocTypeFromFile({ filename: "IMG_0421.jpg", caption: "gym lease agreement" })).toBe("contract");
  });

  it("lands in the Inbox with an honest confidence and flags sensitive types", () => {
    const plain = firstPassIntake({ filename: "photo.jpg", mime: "image/jpeg" });
    expect(plain.review_status).toBe("needs_review");
    expect(plain.confidence).toBe("low");
    expect(plain.sensitive).toBe(false);
    expect(firstPassIntake({ filename: "passport.jpg" }).sensitive).toBe(true);
  });
});
