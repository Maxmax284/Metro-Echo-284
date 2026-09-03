import { describe, expect, it } from "vitest";
import {
  looksLikeCrossReference, inferOutputShape, inferSourceRole,
  buildMatrix, fieldsForShape, resolveRecords, differencesFor,
} from "../../supabase/functions/_shared/crossref";

describe("cross-reference intent", () => {
  it("takes two or more sources arriving together as a job", () => {
    expect(looksLikeCrossReference({ text: "same treatment", readableAttachments: 3 }).match).toBe(true);
  });
  it("does not invent a job with nothing attached", () => {
    expect(looksLikeCrossReference({ text: "cross-reference these", readableAttachments: 0 }).match).toBe(false);
  });
  it("stays out of the way for one file", () => {
    expect(looksLikeCrossReference({ text: "what is this", readableAttachments: 1 }).match).toBe(false);
  });
});

describe("output shape", () => {
  it("reads the ask, not the file names", () => {
    expect(inferOutputShape("build me the announcer sheet for the fight card")).toBe("roster_sheet");
    expect(inferOutputShape("reconcile these invoices")).toBe("reconciliation");
    expect(inferOutputShape("compare them side by side")).toBe("comparison_dossier");
  });
  it("holds back personal fields unless allowed", () => {
    const available = ["name", "age", "phone", "address"];
    const held = fieldsForShape("roster_sheet", available);
    expect(held.held_back).toContain("phone");
    const allowed = fieldsForShape("roster_sheet", available, { include_sensitive: ["phone"] });
    expect(allowed.printed).toContain("phone");
  });
});

describe("source authority", () => {
  it("guesses a master sheet from the filename but stays editable", () => {
    expect(inferSourceRole({ filename: "master-fight-card.pdf", mime_type: "application/pdf" })).toBe("master");
    expect(inferSourceRole({ filename: "IMG_2201.jpg", mime_type: "image/jpeg" })).toBe("supporting");
  });
});

describe("matrix honesty", () => {
  const sources = [
    { id: "a", filename: "master.pdf", role: "master" as const, authority_rank: 90, authority_fields: [] },
    { id: "b", filename: "reg.jpg", role: "supporting" as const, authority_rank: 40, authority_fields: [] },
  ];
  const records = resolveRecords([
    { source_id: "a", label: "Joe Riley", claims: [] },
    { source_id: "b", label: "joe riley", claims: [] },
  ]);

  it("treats near-identical labels as the same record without claiming certainty", () => {
    expect(records.length).toBe(1);
  });

  it("marks disagreement instead of picking quietly", () => {
    const m = buildMatrix(records, [
      { source_id: "a", record_key: records[0].record_key, field: "weight", value_text: "70", value_number: 70, certainty: "verified" },
      { source_id: "b", record_key: records[0].record_key, field: "weight", value_text: "72", value_number: 72, certainty: "verified" },
    ], sources);
    const cell = m.cells.find((c) => c.field === "weight");
    expect(cell?.state).toBe("conflicts");
  });

  it("never guesses unreadable handwriting", () => {
    const m = buildMatrix(records, [
      { source_id: "b", record_key: records[0].record_key, field: "age", value_text: null, certainty: "uncertain" },
    ], sources);
    const cell = m.cells.find((c) => c.field === "age");
    expect(cell?.state).toBe("unreadable");
    expect(cell?.value).toBeNull();
  });

  it("calculates differences in code, not in prose", () => {
    const diffs = differencesFor([
      { record_key: "x", field: "weight", value_number: 70, unit: "kg" },
      { record_key: "y", field: "weight", value_number: 72, unit: "kg" },
    ], "weight");
    expect(diffs.some((d) => Math.abs(d.difference - 2) < 1e-9)).toBe(true);
  });
});
