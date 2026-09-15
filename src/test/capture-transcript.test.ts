// Transcript pieces, bookmarks, evidence tethering and title suggestions.
// The law under test: interpretation always points BACK at recorded evidence,
// and the evidence itself is never rewritten.
import { describe, it, expect } from "vitest";
import {
  DIARIZATION_NOTE, RECORDING_NOTICE, CAPTURE_SECTIONS,
  bookmarkedMoments, extractSignals, followUpProposals, isRawPreserved, locateEvidence,
  mergeLayers, newLayers, pushSegment, searchSegments, segmentsText, stampAt,
  titleSuggestions, toggleBookmark, type TranscriptSegment,
} from "@/lib/captureLayers";

const seg = (t: number, text: string): TranscriptSegment => ({ t, text, speaker: null });

describe("stamps", () => {
  it("reads as mm:ss", () => {
    expect(stampAt(0)).toBe("00:00");
    expect(stampAt(62)).toBe("01:02");
    expect(stampAt(-4)).toBe("00:00");
  });
});

describe("segments", () => {
  it("appends stamped pieces and drops empty ones", () => {
    let s: TranscriptSegment[] = [];
    s = pushSegment(s, seg(0, "  we decided to move the booking to Friday "));
    s = pushSegment(s, seg(12.9, "   "));
    expect(s).toHaveLength(1);
    expect(s[0].text).toBe("we decided to move the booking to Friday");
    expect(s[0].t).toBe(0);
  });

  it("never invents a speaker", () => {
    const s = pushSegment([], seg(3, "hello"));
    expect(s[0].speaker).toBeNull();
    expect(DIARIZATION_NOTE).toMatch(/aren't separated/);
  });

  it("keeps a bookmark on the words without changing them", () => {
    const before = pushSegment([], seg(9, "airport pickup is unresolved"));
    const after = toggleBookmark(before, 0);
    expect(after[0].bookmark).toBe(true);
    expect(after[0].text).toBe(before[0].text);
    expect(bookmarkedMoments(after)).toHaveLength(1);
    expect(bookmarkedMoments(toggleBookmark(after, 0))).toHaveLength(0);
  });

  it("rebuilds the words in order", () => {
    const s = [seg(0, "first line."), seg(5, "second line.")];
    expect(segmentsText(s)).toBe("first line. second line.");
  });
});

describe("evidence jump", () => {
  const s = [
    seg(0, "So about the trip."),
    seg(11, "We decided to move the booking to Friday."),
    seg(26, "I'll call the hotel tomorrow."),
  ];

  it("locates the moment an extracted decision came from", () => {
    const hit = locateEvidence(s, "We decided to move the booking to Friday.");
    expect(hit).toEqual({ index: 1, t: 11 });
  });

  it("still locates a lightly reworded line", () => {
    const hit = locateEvidence(s, "decided to move booking Friday");
    expect(hit?.index).toBe(1);
  });

  it("returns nothing rather than pointing at an unrelated moment", () => {
    expect(locateEvidence(s, "renew the passport before December")).toBeNull();
    expect(locateEvidence([], "anything")).toBeNull();
  });

  it("ties every extracted decision back to a moment", () => {
    const found = extractSignals(segmentsText(s));
    expect(found.decisions.length).toBeGreaterThan(0);
    for (const d of found.decisions) expect(locateEvidence(s, d)).not.toBeNull();
  });
});

describe("transcript search", () => {
  const s = [seg(0, "Booking moved to Friday"), seg(8, "Airport pickup still open")];
  it("matches every word in any order", () => {
    expect(searchSegments(s, "friday booking")).toEqual([0]);
    expect(searchSegments(s, "airport")).toEqual([1]);
    expect(searchSegments(s, "")).toEqual([]);
    expect(searchSegments(s, "nothing here")).toEqual([]);
  });
});

describe("titles", () => {
  it("suggests from the capture's own words and never locks in", () => {
    const out = titleSuggestions("We decided to move the booking to Friday. I'll call the hotel.", "conversation");
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]).toContain("booking");
    expect(out[0].endsWith(".")).toBe(false);
  });
});

describe("raw stays raw after a round of interpretation", () => {
  it("keeps stamped segments and words untouched", () => {
    const segments = [seg(0, "We agreed to wait on the airport pickup.")];
    const before = newLayers({
      text: segmentsText(segments),
      mode: "conversation",
      captured_at: "2026-09-15T18:42:00.000Z",
      segments,
    });
    const after = mergeLayers(before, {
      clean: { text: "cleaned up", source: "rules", at: "2026-09-15T18:43:00.000Z" },
      mattered: extractSignals(segmentsText(segments)),
      raw: { ...before.raw, text: "TAMPERED", segments: [] },
    });
    expect(isRawPreserved(before, after)).toBe(true);
    expect(after.raw.text).toBe(before.raw.text);
    expect(after.raw.segments).toHaveLength(1);
  });
});

describe("extraction is still not execution", () => {
  it("proposals from a recorded transcript stay proposals", () => {
    const found = extractSignals("I'll book the taxi. We should confirm the room.");
    for (const p of followUpProposals(found)) {
      expect(p.status).toBe("proposed");
      expect(p.requiresApproval).toBe(true);
    }
  });
});

describe("note sections and the recording notice", () => {
  it("are sections of a note, not new rooms", () => {
    expect([...CAPTURE_SECTIONS]).toEqual([
      "summary", "transcript", "decisions", "followups", "unresolved", "connections",
    ]);
  });
  it("states responsibility once, without threatening", () => {
    expect(RECORDING_NOTICE).toMatch(/vary by where you are/);
    expect(RECORDING_NOTICE).toMatch(/never listens on its own/);
  });
});
