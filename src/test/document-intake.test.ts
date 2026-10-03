// One-breath intake: the sieve keeps the model honest.
import { describe, expect, it } from "vitest";
import {
  compactCatalog,
  sanitizeIntake,
  type IntakeCatalogTemplate,
} from "../../supabase/functions/_shared/intakeParse";
import { DOCUMENT_TEMPLATES } from "@/lib/documentTemplates";

const CATALOG: IntakeCatalogTemplate[] = compactCatalog(DOCUMENT_TEMPLATES);

describe("sanitizeIntake", () => {
  it("accepts a well-formed SOW parse", () => {
    const out = sanitizeIntake({
      template_key: "sow_simple",
      title: "Kru Glitch SOW",
      tone: "formal",
      inputs: {
        client: "Kru Glitch",
        provider: "Maxwell Wolfe",
        project_name: "Coaching pilot",
        scope: "3-month trial, 20 hours a week",
        fee: "$2,500",
      },
    }, CATALOG);
    expect(out).not.toBeNull();
    expect(out!.template_key).toBe("sow_simple");
    expect(out!.title).toBe("Kru Glitch SOW");
    expect(out!.tone).toBe("formal");
    expect(out!.inputs.client).toBe("Kru Glitch");
    expect(out!.inputs.fee).toBe("$2,500");
  });

  it("returns null when the model names a template that does not exist", () => {
    expect(sanitizeIntake({ template_key: "blood_oath", inputs: {} }, CATALOG)).toBeNull();
    expect(sanitizeIntake(null, CATALOG)).toBeNull();
    expect(sanitizeIntake("sow_simple", CATALOG)).toBeNull();
  });

  it("drops field keys the template never asked for", () => {
    const out = sanitizeIntake({
      template_key: "nda_mutual",
      inputs: { party_a: "Acme", party_b: "Jane", hourly_rate: "$900" },
    }, CATALOG);
    expect(out!.inputs.party_a).toBe("Acme");
    expect(out!.inputs.hourly_rate).toBeUndefined();
  });

  it("matches select values by value or label, case-insensitively, and drops misses", () => {
    const byLabel = sanitizeIntake({
      template_key: "service_agreement",
      inputs: { client: "A", provider: "B", services: "Coaching", fee_model: "Monthly Retainer" },
    }, CATALOG);
    expect(byLabel!.inputs.fee_model).toBe("retainer");

    const byValue = sanitizeIntake({
      template_key: "service_agreement",
      inputs: { client: "A", provider: "B", services: "Coaching", fee_model: "HOURLY" },
    }, CATALOG);
    expect(byValue!.inputs.fee_model).toBe("hourly");

    const miss = sanitizeIntake({
      template_key: "service_agreement",
      inputs: { client: "A", provider: "B", services: "Coaching", fee_model: "blood diamonds" },
    }, CATALOG);
    expect(miss!.inputs.fee_model).toBeUndefined();
  });

  it("keeps real ISO dates and drops prose dates", () => {
    const out = sanitizeIntake({
      template_key: "sow_simple",
      inputs: { start_date: "2027-03-03", end_date: "next Friday" },
    }, CATALOG);
    expect(out!.inputs.start_date).toBe("2027-03-03");
    expect(out!.inputs.end_date).toBeUndefined();
  });

  it("ignores an invalid tone and empty values", () => {
    const out = sanitizeIntake({
      template_key: "letter_general",
      tone: "unhinged",
      inputs: { sender: "  ", recipient: "Nikki", subject: "Rates", intent: "Proposing new rates" },
    }, CATALOG);
    expect(out!.tone).toBeUndefined();
    expect(out!.inputs.sender).toBeUndefined();
    expect(out!.inputs.recipient).toBe("Nikki");
  });

  it("clamps over-long strings instead of rejecting the parse", () => {
    const out = sanitizeIntake({
      template_key: "nda_mutual",
      title: "x".repeat(500),
      inputs: { purpose: "y".repeat(5_000) },
    }, CATALOG);
    expect(out!.title.length).toBeLessThanOrEqual(120);
    expect(out!.inputs.purpose!.length).toBeLessThanOrEqual(2_000);
  });
});

describe("compactCatalog", () => {
  it("carries every template, field and option through", () => {
    expect(CATALOG.length).toBe(DOCUMENT_TEMPLATES.length);
    const sow = CATALOG.find((t) => t.key === "sow_simple")!;
    expect(sow.fields.map((f) => f.key)).toContain("deliverables");
    const svc = CATALOG.find((t) => t.key === "service_agreement")!;
    const feeModel = svc.fields.find((f) => f.key === "fee_model")!;
    expect(feeModel.options!.map((o) => o.value)).toEqual(["retainer", "hourly", "project"]);
  });
});
