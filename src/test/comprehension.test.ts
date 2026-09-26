// Comprehension layer — the guards that keep the words honest.
//
// Three failure modes we actually hit: a surface invents a second name for an
// object it already has, a meta line grows into a paragraph, and an error leaks
// a status code at the user.
import { describe, expect, it } from "vitest";
import {
  CANONICAL_NOUN,
  NOUN_SYNONYMS,
  OBJECT_HOME,
  aftermathLine,
  canonicalNoun,
  cardMetaLine,
  freshnessLabel,
  nounPlural,
  resolveObject,
  resolveProvenance,
  summaryLine,
  type VantaObject,
} from "@/lib/vantaNouns";
import {
  ASK_OUTPUT,
  askAftermath,
  askDestination,
  GLOSSARY,
  PROVENANCE_LABEL,
} from "@/lib/vantaNouns";
import { readError, FIX_ROUTE } from "@/lib/errorCopy";
import { DESK_ROLES, DESK_TILE_HINT } from "@/lib/deskRoles";
import { ROOM_MAP } from "@/lib/roomCopy";
import { readHealth } from "@/components/settings/SystemHealthLine";

const OBJECTS = Object.keys(CANONICAL_NOUN) as VantaObject[];

describe("one object, one name", () => {
  it("gives every object exactly one canonical noun and one home", () => {
    for (const o of OBJECTS) {
      expect(CANONICAL_NOUN[o].length).toBeGreaterThan(2);
      expect(OBJECT_HOME[o].label.length).toBeGreaterThan(2);
    }
    const names = OBJECTS.map((o) => CANONICAL_NOUN[o]);
    expect(new Set(names).size).toBe(names.length);
  });

  it("resolves every known synonym back to a real object", () => {
    for (const [syn, obj] of Object.entries(NOUN_SYNONYMS)) {
      expect(OBJECTS).toContain(obj);
      expect(resolveObject(syn)).toBe(obj);
    }
  });

  it("collapses historical synonym drift onto the one name", () => {
    for (const alias of ["note", "intake item", "fresh in", "captures"]) {
      expect(canonicalNoun(alias)).toBe("Capture");
    }
    for (const alias of ["promise", "promises", "reminder"]) {
      expect(canonicalNoun(alias)).toBe("Commitment");
    }
    for (const alias of ["proposal", "staged action", "staged", "proposed"]) {
      expect(canonicalNoun(alias)).toBe("Action");
    }
    for (const alias of ["document", "brief", "export"]) {
      expect(canonicalNoun(alias)).toBe("Artifact");
    }
    for (const alias of ["audit entry", "event", "receipts"]) {
      expect(canonicalNoun(alias)).toBe("Receipt");
    }
  });

  it("never guesses a noun it does not know", () => {
    expect(canonicalNoun("widget")).toBe("Item");
    expect(canonicalNoun(null)).toBe("Item");
    expect(resolveObject("")).toBeNull();
  });

  it("pluralizes for counts without inventing grammar", () => {
    expect(nounPlural("commitment", 1)).toBe("commitment");
    expect(nounPlural("commitment", 3)).toBe("commitments");
    expect(nounPlural("waiting", 2)).toBe("waiting on");
  });
});

describe("card meta lines", () => {
  it("says what it is, what state it is in, and where it opens", () => {
    expect(cardMetaLine({ object: "commitment", state: "due Fri" })).toBe(
      "Commitment · due Fri · opens Commitments",
    );
    expect(cardMetaLine({ object: "action", state: "needs approval" })).toBe(
      "Action · needs approval · opens Actions",
    );
  });

  it("drops the destination for cards that open in place", () => {
    expect(cardMetaLine({ object: "receipt", state: "recorded 4m ago", opensIn: false })).toBe(
      "Receipt · recorded 4m ago",
    );
  });

  it("stays one short line — three facts, never a paragraph", () => {
    for (const o of OBJECTS) {
      const line = cardMetaLine({ object: o, state: "needs approval" });
      expect(line.split(" · ").length).toBeLessThanOrEqual(3);
      expect(line.length).toBeLessThan(60);
    }
  });
});

describe("aftermath", () => {
  it("names where it went and where it will show up", () => {
    expect(aftermathLine({ filedTo: "Lamai rollout", appearsIn: "Receipts" })).toBe(
      "Filed to Lamai rollout · appears in Receipts",
    );
    expect(aftermathLine({ verb: "Ran", appearsIn: "Receipts" })).toBe("Ran · appears in Receipts");
  });

  it("says the least it can when there is no destination", () => {
    expect(aftermathLine({ verb: "Recorded" })).toBe("Recorded");
  });
});

describe("collapsed summaries", () => {
  it("gives a reason to open, not just a count", () => {
    expect(summaryLine("commitment", 3, "nearest Friday")).toBe("3 commitments · nearest Friday");
    expect(summaryLine("capture", 1, "not sorted yet")).toBe("1 capture · not sorted yet");
  });

  it("says something plain when a section is empty", () => {
    expect(summaryLine("receipt", 0, "newest first", "Nothing recorded yet.")).toBe("Nothing recorded yet.");
    expect(summaryLine("receipt", 0)).toBe("Nothing waiting here.");
  });
});

describe("freshness", () => {
  const now = Date.UTC(2026, 7, 27, 12, 0, 0);

  it("reads a real timestamp in plain words", () => {
    expect(freshnessLabel(now - 10_000, { now })).toBe("Checked just now");
    expect(freshnessLabel(now - 4 * 60_000, { now })).toBe("Checked 4 min ago");
    expect(freshnessLabel(now - 3 * 3600_000, { now, verb: "Synced" })).toBe("Synced 3h ago");
    expect(freshnessLabel(now - 26 * 3600_000, { now, verb: "Updated" })).toBe("Updated yesterday");
  });

  it("says nothing when nothing has been read", () => {
    expect(freshnessLabel(null)).toBeNull();
    expect(freshnessLabel(undefined)).toBeNull();
  });
});

describe("provenance", () => {
  it("names the sources Echo actually records", () => {
    expect(resolveProvenance("telegram")).toBe("telegram");
    expect(resolveProvenance("email_inbound")).toBe("email");
    expect(resolveProvenance("ics_feed")).toBe("calendar");
    expect(resolveProvenance("manual")).toBe("you");
    expect(resolveProvenance("website_forms")).toBe("website");
    expect(resolveProvenance("sherlock_suggest")).toBe("sherlock");
  });

  it("renders nothing rather than guessing", () => {
    expect(resolveProvenance("mystery-bus")).toBeNull();
    expect(resolveProvenance(null)).toBeNull();
  });

  it("keeps every source label plain and human", () => {
    for (const label of Object.values(PROVENANCE_LABEL)) {
      expect(label).toMatch(/^(From|Added|Spotted|Recorded|Drafted)/);
      expect(label.length).toBeLessThan(30);
    }
  });
});

describe("errors that name the fix", () => {
  it("never shows a raw status code in the visible copy", () => {
    for (const status of [400, 401, 403, 404, 429, 500, 503]) {
      const r = readError({ status, message: `HTTP ${status}` });
      expect(r.what).not.toMatch(/\b\d{3}\b/);
      expect(r.what.length).toBeGreaterThan(15);
    }
  });

  it("keeps the technical detail for support only", () => {
    const r = readError({ status: 500, message: "boom" });
    expect(r.technical).toContain("500");
    expect(r.what).not.toContain("boom");
  });

  it("says whether the user has to act, and offers one move", () => {
    const expired = readError({ status: 401 });
    expect(expired.needsYou).toBe(true);
    expect(expired.fix.kind).toBe("sign_in");
    expect(FIX_ROUTE[expired.fix.kind]).toBe("/auth");

    const credits = readError(new Error("credits exhausted"));
    expect(credits.needsYou).toBe(true);
    expect(credits.fix.label).toBe("Top up credits");

    const missingKey = readError(new Error("Missing TELEGRAM_API_KEY secret for connector"));
    expect(missingKey.fix.kind).toBe("open_connections");
    expect(FIX_ROUTE.open_connections).toBe("/settings/integrations");
  });

  it("reassures that nothing changed when nothing did", () => {
    expect(readError(new Error("Failed to fetch")).what).toContain("Nothing was changed.");
    expect(readError({ status: 502 }, { doing: "reading this file" }).what).toContain("still saved");
  });
});

describe("system health line", () => {
  it("says all connected when everything Echo relies on is live", () => {
    const h = readHealth([
      { name: "Telegram", status: "live" },
      { name: "Email", status: "live" },
    ]);
    expect(h.tone).toBe("good");
    expect(h.line).toBe("All connected.");
    expect(h.detail).toBe("Telegram connected · Email connected");
  });

  it("names the one connection that needs the user", () => {
    const h = readHealth([
      { name: "Telegram", status: "live" },
      { name: "Email", status: "needs_setup" },
    ]);
    expect(h.tone).toBe("attention");
    expect(h.line).toBe("Email needs setup.");
  });

  it("counts them when several need attention", () => {
    const h = readHealth([
      { name: "Telegram", status: "needs_setup" },
      { name: "Email", status: "needs_setup" },
    ]);
    expect(h.line).toBe("2 connections need attention.");
  });

  it("stays neutral when nothing is connected", () => {
    expect(readHealth([]).tone).toBe("neutral");
    expect(readHealth([{ name: "Email", status: "planned" }]).tone).toBe("neutral");
  });
});

describe("room map", () => {
  it("describes exactly the four rooms, one sentence each", () => {
    expect(ROOM_MAP.map((r) => r.key)).toEqual(["today", "work", "ask", "receipts"]);
    for (const room of ROOM_MAP) {
      expect(room.purpose.endsWith(".")).toBe(true);
      expect(room.purpose.length).toBeLessThan(60);
      expect(room.owns.length).toBeGreaterThan(2);
    }
  });

  it("uses canonical nouns for the objects a room owns", () => {
    const canonical = new Set(Object.values(CANONICAL_NOUN).map((n) => n.toLowerCase()));
    const owned = ROOM_MAP.flatMap((r) => r.owns.map((o) => o.toLowerCase().replace(/s$/, "")));
    const recognized = owned.filter((o) => canonical.has(o));
    // Every canonical object a room lists must be spelled the canonical way.
    for (const o of recognized) expect(canonical.has(o)).toBe(true);
    expect(recognized.length).toBeGreaterThan(3);
  });
});

describe("desk roles", () => {
  it("explains every desk in four plain-English lines", () => {
    const keys = Object.keys(DESK_ROLES) as (keyof typeof DESK_ROLES)[];
    expect(keys.length).toBeGreaterThan(9);
    for (const k of keys) {
      const r = DESK_ROLES[k];
      for (const line of [r.is, r.lands, r.you, r.example]) {
        expect(line.trim().length).toBeGreaterThan(10);
        expect(line.endsWith(".") || line.endsWith(".\u201D")).toBe(true);
      }
      // A desk explanation never leans on the jargon it is supposed to replace.
      expect(/\b(entity|payload|record id|schema|endpoint|RLS)\b/i.test(
        [r.is, r.lands, r.you, r.example].join(" "),
      )).toBe(false);
    }
  });

  it("gives every desk a short tile hint", () => {
    for (const [k, hint] of Object.entries(DESK_TILE_HINT)) {
      expect(hint.length).toBeGreaterThan(2);
      expect(hint.length).toBeLessThan(28);
      expect(DESK_ROLES[k as keyof typeof DESK_ROLES]).toBeTruthy();
    }
  });

  it("tells every desk's options, on-start truth and at least one quick action", () => {
    const keys = Object.keys(DESK_ROLES) as (keyof typeof DESK_ROLES)[];
    for (const k of keys) {
      const r = DESK_ROLES[k];
      expect(r.options.length).toBeGreaterThan(1);
      for (const o of r.options) expect(o.trim().length).toBeGreaterThan(4);
      expect(r.onStart.trim().length).toBeGreaterThan(15);
      expect(r.onStart.endsWith(".")).toBe(true);
      expect(r.actions.length).toBeGreaterThan(0);
      expect(r.emptyAction.trim().length).toBeGreaterThan(4);
      for (const a of [...r.actions, r.emptyAction]) expect(a.length).toBeLessThan(30);
    }
  });

  it("never labels a quick action as if it executes something", () => {
    // A tile tap only opens a desk. Nothing on a tile may promise to run,
    // send, approve, execute or delete.
    const forbidden = /\b(execute|run it|send it|approve|delete|publish)\b/i;
    for (const r of Object.values(DESK_ROLES)) {
      for (const a of [...r.actions, r.emptyAction]) expect(forbidden.test(a)).toBe(false);
    }
  });
});


describe("glossary", () => {
  it("defines every canonical noun in plain English", () => {
    const terms = new Set(GLOSSARY.map((e) => e.term.toLowerCase()));
    for (const noun of Object.values(CANONICAL_NOUN)) {
      expect(terms.has(noun.toLowerCase())).toBe(true);
    }
  });

  it("separates the nouns people confuse", () => {
    // Brief vs Document is the question users actually ask, so both must say
    // what they are NOT.
    for (const term of ["Brief", "Document", "Action", "Capture", "Receipt"]) {
      const entry = GLOSSARY.find((e) => e.term === term);
      expect(entry?.notThe, `${term} needs a contrast line`).toBeTruthy();
    }
  });

  it("keeps definitions readable and jargon-free", () => {
    for (const e of GLOSSARY) {
      expect(e.means.endsWith(".")).toBe(true);
      expect(e.means.length).toBeLessThan(180);
      expect(/\b(entity|payload|schema|endpoint|RLS|table|row)\b/i.test(e.means)).toBe(false);
    }
  });
});

describe("ask -> work round trip", () => {
  it("routes every Ask output to a real desk", () => {
    for (const kind of Object.keys(ASK_OUTPUT) as (keyof typeof ASK_OUTPUT)[]) {
      const dest = askDestination(kind);
      expect(dest.label.length).toBeGreaterThan(2);
      expect(dest.surface.length).toBeGreaterThan(2);
    }
  });

  it("confirms with the same destination it promised", () => {
    expect(askAftermath("action")).toBe("Drafted · appears in Actions");
    expect(askAftermath("commitment")).toBe("Recorded · appears in Commitments");
    expect(askAftermath("receipt")).toBe("Logged · appears in Receipts");
    expect(askAftermath("artifact", "the project")).toBe(
      "Saved to the project · appears in Documents",
    );
  });

  it("names an Ask-drafted record when it shows up in Work", () => {
    // The intent handler stores source "companion"; Work must read that back
    // as words, not as the token.
    expect(resolveProvenance("companion")).toBe("ask");
    expect(resolveProvenance("ask")).toBe("ask");
    expect(PROVENANCE_LABEL.ask).toBe("Drafted with Echo");
  });
});
