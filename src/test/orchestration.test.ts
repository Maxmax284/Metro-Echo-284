import { describe, it, expect } from "vitest";
import {
  routeRequest,
  planMayExecute,
  escalationFor,
  sanitizeQuery,
  safeResearchLog,
  normalizeSource,
  classifySource,
  rankSources,
  assessAgreement,
  depthForIntent,
  researchNeedsReceipt,
  summarizeExtraction,
  bestReliableIdentification,
  weakestConfidence,
  applyCorrection,
  type PerceptionResult,
  type SourceResult,
} from "@/lib/orchestration";

describe("capability routing", () => {
  it("reads an attachment without reaching outside", () => {
    const plan = routeRequest({
      text: "Read this receipt",
      attachments: [{ kind: "photo" }],
      scope: "personal",
    });
    expect(plan.perception).toContain("extract");
    expect(plan.research).toBeNull();
    expect(plan.capabilities).toContain("ocr");
  });

  it("routes verification through research and source verification", () => {
    const plan = routeRequest({ text: "Verify whether this refund rule is current", scope: "personal" });
    expect(plan.research?.intent).toBe("verify");
    expect(plan.capabilities).toContain("source_verification");
    expect(plan.min_confidence).toBe("high");
  });

  it("sends current-events phrasing to a live lookup, not a memory answer", () => {
    const plan = routeRequest({ text: "What's going on with the Bangkok flooding?", scope: "personal" });
    expect(plan.research?.intent).toBe("lookup");
    expect(plan.capabilities).toContain("web_lookup");
  });

  it("keeps internal project talk internal", () => {
    const plan = routeRequest({ text: "What did we decide about this project last time?", scope: "personal" });
    expect(plan.research?.intent).not.toBe("lookup");
  });

  it("retrieves internally before reasoning about our own history", () => {
    const plan = routeRequest({ text: "What did we decide about rollback?", scope: "personal" });
    expect(plan.retrieval).toContain("memory");
    expect(plan.retrieval).toContain("receipts");
    expect(plan.capabilities).toContain("internal_retrieval");
  });

  it("inherits scope and never leaks an org id into personal scope", () => {
    const personal = routeRequest({ text: "look up opening hours", scope: "personal", organization_id: "org-1" });
    expect(personal.organization_id).toBeNull();
    const workspace = routeRequest({ text: "look up opening hours", scope: "organization", organization_id: "org-1" });
    expect(workspace.organization_id).toBe("org-1");
  });

  it("can only prepare an action, never execute one", () => {
    const plan = routeRequest({ text: "Draft a follow-up about this", scope: "personal" });
    expect(plan.may_prepare_action).toBe(true);
    expect(planMayExecute(plan)).toBe(false);
  });
});

describe("sherlock escalation", () => {
  it("escalates to a full investigation on request", () => {
    const e = escalationFor("Sherlock this contract", true);
    expect(e.level).toBe("full_investigation");
    expect(e.sherlock).toBe(true);
    expect(e.research).toBe("verify");
  });

  it("keeps a plain read shallow", () => {
    const e = escalationFor("read this", true);
    expect(e.level).toBe("perception_only");
    expect(e.sherlock).toBe(false);
    expect(e.perception).toEqual(["extract"]);
  });

  it("joins perception to context when asked what it means", () => {
    const e = escalationFor("explain what this means for the project", true);
    expect(e.internal_retrieval).toBe(true);
    expect(e.perception).toContain("interpret");
  });
});

describe("query sanitization", () => {
  it("keeps the public facts and drops the private ones", () => {
    const r = sanitizeQuery(
      "Max is building CampStay for Nikki and needs Stripe partial refund API behavior",
      { private_names: ["CampStay"], people: ["Max", "Nikki"] },
    );
    expect(r.query).not.toMatch(/CampStay|Nikki|Max/i);
    expect(r.query.toLowerCase()).toContain("stripe");
    expect(r.withheld.length).toBeGreaterThan(0);
    expect(r.blocked).toBe(false);
  });

  it("strips secrets and contact details", () => {
    const r = sanitizeQuery("use sk_live_abcd1234efgh and email max@example.com about webhook retries");
    expect(r.query).not.toContain("sk_live_");
    expect(r.query).not.toContain("@example.com");
    expect(r.withheld).toContain("an API key");
  });

  it("blocks a query with nothing usable left", () => {
    const r = sanitizeQuery("CampStay", { private_names: ["CampStay"] });
    expect(r.blocked).toBe(true);
  });

  it("logs safe metadata only", () => {
    const r = sanitizeQuery("stripe refund rules 2026");
    const log = safeResearchLog(r, { intent: "verify", depth: "standard", provider: "serpapi" });
    expect(log.query).toContain("stripe");
    expect(Object.keys(log).sort()).toEqual(["depth", "intent", "provider", "query", "withheld"]);
  });
});

describe("source normalization", () => {
  it("classifies authority by source family", () => {
    expect(classifySource("https://docs.stripe.com/refunds")).toBe("official_docs");
    expect(classifySource("https://www.reddit.com/r/stripe/x")).toBe("forum_social");
    expect(classifySource("https://irs.gov/notice")).toBe("government");
  });

  it("normalizes provider output into one shape", () => {
    const now = new Date("2026-08-24T00:00:00Z");
    const s = normalizeSource(
      { title: "Refunds", url: "https://docs.stripe.com/refunds", snippet: "How refunds work", published_at: "2026-07-01T00:00:00Z", provider: "serpapi" },
      { query_id: "q1", now },
    )!;
    expect(s.source).toBe("docs.stripe.com");
    expect(s.authority).toBe("authoritative");
    expect(s.freshness).toBe("current");
    expect(s.verification_state).toBe("unverified");
    expect(normalizeSource({ title: "x", url: "" })).toBeNull();
  });

  it("prefers authoritative, fresher sources", () => {
    const now = new Date("2026-08-24T00:00:00Z");
    const a = normalizeSource({ title: "forum", url: "https://reddit.com/a" }, { now })!;
    const b = normalizeSource({ title: "docs", url: "https://docs.stripe.com/b", published_at: now.toISOString() }, { now })!;
    expect(rankSources([a, b])[0].source).toBe("docs.stripe.com");
  });

  it("says when sources disagree instead of guessing", () => {
    const base: SourceResult = {
      title: "t", source: "docs.stripe.com", url: "https://docs.stripe.com/x",
      category: "official_docs", authority: "authoritative", freshness: "current",
      retrieved_at: new Date().toISOString(), verification_state: "corroborated",
    };
    expect(assessAgreement([base, { ...base, url: "https://docs.stripe.com/y" }]).state).toBe("agreed");
    expect(assessAgreement([{ ...base, verification_state: "contradicted" }]).state).toBe("conflicting");
    expect(assessAgreement([]).state).toBe("no_sources");
  });

  it("maps intent to a proportionate depth", () => {
    expect(depthForIntent("lookup")).toBe("quick");
    expect(depthForIntent("investigate")).toBe("deep");
  });

  it("does not receipt a throwaway lookup", () => {
    expect(researchNeedsReceipt({ saved: false, intent: "lookup", project_id: null })).toBe(false);
    expect(researchNeedsReceipt({ saved: true, intent: "lookup", project_id: null })).toBe(true);
    expect(researchNeedsReceipt({ saved: false, intent: "monitor", project_id: null })).toBe(true);
  });
});

describe("confidence honesty", () => {
  it("reports partial extraction rather than inventing fields", () => {
    const r = summarizeExtraction([
      { key: "vendor", value: "Acme", confidence: "high" },
      { key: "total", value: null, confidence: "unreadable", unclear: true },
    ]);
    expect(r.confidence).toBe("partial");
    expect(r.unresolved).toEqual(["total"]);
  });

  it("stops at the highest reliable identification level", () => {
    const best = bestReliableIdentification([
      { level: 1, label: "electronic adapter", confidence: "high" },
      { level: 2, label: "USB-C ethernet adapter", confidence: "probable" },
      { level: 3, label: "Acme X1", confidence: "uncertain" },
    ]);
    expect(best?.level).toBe(2);
    expect(weakestConfidence(["high", "uncertain"])).toBe("uncertain");
  });

  it("lets a correction land without erasing the observation", () => {
    const result: PerceptionResult = {
      job: "extract",
      input: { kind: "photo" },
      fields: [{ key: "total", value: "6500", confidence: "uncertain", unclear: true }],
      confidence: "partial",
    };
    const fixed = applyCorrection(result, { result_field: "total", was: "6500", now: "8500", corrected_at: new Date().toISOString() });
    expect(fixed.fields?.[0].value).toBe("8500");
    expect(fixed.confidence).toBe("high");
    expect(result.fields?.[0].value).toBe("6500");
  });
});
