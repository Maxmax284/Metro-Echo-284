import { describe, expect, it } from "vitest";
import {
  absorbFact,
  absorbInto,
  readAddress,
  readCrossSituations,
  saysItMoved,
  worthSaying,
  type CrossFact,
} from "@/lib/crossSource";

const appointment: CrossFact = {
  id: "e1",
  kind: "calendar",
  title: "ADHD appointment",
  at: "2026-09-17T14:00:00Z",
  location: "Riverside Clinic",
  project: "Health",
};

const movedMail: CrossFact = {
  id: "m1",
  kind: "mail",
  title: "Your ADHD appointment has been rescheduled — new address 240 Bergen Street, Suite 3",
  at: "2026-09-15T11:00:00Z",
  from: "Riverside Clinic",
};

const form: CrossFact = {
  id: "f1",
  kind: "file",
  title: "ADHD appointment intake form.pdf",
  at: "2026-09-14T09:00:00Z",
};

describe("cross-source: many sources, one situation", () => {
  it("collapses calendar, mail and a file into one conclusion", () => {
    const [read] = readCrossSituations({ anchors: [appointment], supporting: [movedMail, form] });
    expect(read.conclusion).toContain("ADHD appointment");
    expect(read.conclusion).toContain("Riverside Clinic");
    expect(read.conclusion).toContain("Drive");
    expect(read.timeChanged).toBe(true);
    expect(read.newAddress).toBe("240 Bergen Street, Suite 3");
    expect(read.confidence).toBe("clear");
  });

  it("keeps every source behind the conclusion, named", () => {
    const [read] = readCrossSituations({ anchors: [appointment], supporting: [movedMail, form] });
    expect(read.provenance.length).toBe(3);
    expect(read.provenance.some((p) => p.startsWith("Email from Riverside Clinic"))).toBe(true);
    expect(read.provenance.some((p) => p.startsWith("Drive file"))).toBe(true);
  });

  it("says nothing about an unrelated email that merely has a street in it", () => {
    const junk: CrossFact = {
      id: "m2",
      kind: "mail",
      title: "Your order ships to 90 Water Street",
      at: "2026-09-15T11:00:00Z",
      from: "Shop",
    };
    const reads = readCrossSituations({ anchors: [appointment], supporting: [junk] });
    expect(reads).toHaveLength(0);
  });

  it("leaves a lone calendar entry alone — one source is not a situation", () => {
    expect(readCrossSituations({ anchors: [appointment], supporting: [] })).toHaveLength(0);
  });

  it("never invents an address that was not written down", () => {
    expect(readAddress("moved to the new place, details to follow")).toBeNull();
    expect(saysItMoved("see you Thursday")).toBe(false);
  });

  it("modifies the existing situation instead of starting a second one", () => {
    const situations = readCrossSituations({ anchors: [appointment], supporting: [form] });
    const hit = absorbFact(movedMail, situations);
    expect(hit).toBeTruthy();
    expect(hit!.situation.anchor.id).toBe("e1");

    const updated = absorbInto(hit!.situation, movedMail);
    expect(updated.links).toHaveLength(2);
    expect(updated.timeChanged).toBe(true);
    /* Same anchor, one situation — nothing cloned. */
    expect(updated.anchor.id).toBe(situations[0].anchor.id);
  });

  it("folding the same fact in twice does not duplicate it", () => {
    const [read] = readCrossSituations({ anchors: [appointment], supporting: [movedMail] });
    const twice = absorbInto(absorbInto(read, form), form);
    expect(twice.links.filter((l) => l.fact.id === "f1")).toHaveLength(1);
  });

  it("holds back a thin read from surfacing unasked", () => {
    const vague: CrossFact = {
      id: "m3",
      kind: "mail",
      title: "ADHD paperwork",
      at: "2026-09-16T10:00:00Z",
      from: "Clinic",
    };
    const [read] = readCrossSituations({ anchors: [appointment], supporting: [vague] });
    if (read && read.confidence === "thin") expect(worthSaying(read)).toBe(false);
  });

  it("ties a file to a promise through the project it is filed to", () => {
    const promise: CrossFact = {
      id: "c1",
      kind: "commitment",
      title: "Send the roster",
      at: "2026-09-16T12:00:00Z",
      project: "Fight card",
    };
    const rosterFile: CrossFact = {
      id: "f2",
      kind: "file",
      title: "Lamai roster v3.xlsx",
      at: "2026-09-15T12:00:00Z",
      project: "Fight card",
    };
    const [read] = readCrossSituations({ anchors: [promise], supporting: [rosterFile] });
    expect(read.links[0].reason).toBe("same_project");
    expect(read.conclusion).toContain("Lamai roster v3.xlsx");
  });
});
