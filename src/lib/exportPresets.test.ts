import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase client before importing the module under test.
const invokeMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invokeMock(...args) } },
}));

// PDF + brief helpers touch react-pdf which we don't want to load in jsdom.
vi.mock("@/lib/projectSummaryPdf", () => ({
  buildProjectSummaryBrief: vi.fn(() => ({ title: "stub" })),
  renderProjectSummaryPdf: vi.fn(async () => new Blob()),
}));
vi.mock("@/lib/briefs", () => ({
  approveAndExportBrief: vi.fn(async ({ row }: any) => ({ ...row, storage_path: "x/y.pdf" })),
  getBriefDownloadUrl: vi.fn(async () => "https://example.test/url"),
}));

import { runExportPreset, EXPORT_PRESETS } from "./exportPresets";

function makeHandle() {
  return {
    id: "h1",
    advance: vi.fn(),
    patch: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
    waitForUser: vi.fn(),
    cancel: vi.fn(),
  };
}

describe("project-summary-report preset", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("invokes project-summarize with replace_prior and completes with PDF + project actions", async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        structured: { blocks: { overall_summary: { text: "ok" } } },
        brief_export_id: "be-1",
        project_id: "p-1",
      },
      error: null,
    });
    const handle = makeHandle();
    const onOpenProject = vi.fn();
    const onRegenerate = vi.fn();

    await runExportPreset(
      "project-summary-report",
      { projectId: "p-1", projectName: "Demo", onOpenProject, onRegenerate },
      handle as any,
    );

    expect(invokeMock).toHaveBeenCalledWith("project-summarize", {
      body: { project_id: "p-1", tone: "narrative", replace_prior: true },
    });
    expect(handle.fail).not.toHaveBeenCalled();
    expect(handle.complete).toHaveBeenCalledTimes(1);
    const opts = handle.complete.mock.calls[0][0];
    expect(opts.primaryAction?.label).toBe("Open project");
    expect(opts.secondaryAction?.label).toBe("Download PDF");
    expect(opts.tertiaryAction?.label).toBe("Regenerate");
  });

  it("handles rate_limited error from the function", async () => {
    invokeMock.mockResolvedValueOnce({ data: { error: "rate_limited" }, error: null });
    const handle = makeHandle();
    await runExportPreset(
      "project-summary-report",
      { projectId: "p-1", projectName: "Demo" },
      handle as any,
    );
    expect(handle.fail).toHaveBeenCalledTimes(1);
    expect(handle.fail.mock.calls[0][0].message).toMatch(/Too many requests/i);
    expect(handle.complete).not.toHaveBeenCalled();
  });

  it("handles credits_exhausted error", async () => {
    invokeMock.mockResolvedValueOnce({ data: { error: "credits_exhausted" }, error: null });
    const handle = makeHandle();
    await runExportPreset(
      "project-summary-report",
      { projectId: "p-1" },
      handle as any,
    );
    expect(handle.fail).toHaveBeenCalledTimes(1);
    expect(handle.fail.mock.calls[0][0].message).toMatch(/credits/i);
  });

  it("waits for the user when the project has no items", async () => {
    invokeMock.mockResolvedValueOnce({ data: { empty: true }, error: null });
    const handle = makeHandle();
    await runExportPreset(
      "project-summary-report",
      { projectId: "p-1" },
      handle as any,
    );
    expect(handle.waitForUser).toHaveBeenCalledTimes(1);
    expect(handle.waitForUser.mock.calls[0][0].message).toMatch(/attach a few items/i);
  });

  it("waits for the user when no project is provided", async () => {
    const handle = makeHandle();
    await runExportPreset(
      "project-summary-report",
      {},
      handle as any,
    );
    expect(invokeMock).not.toHaveBeenCalled();
    expect(handle.waitForUser).toHaveBeenCalledTimes(1);
    expect(handle.waitForUser.mock.calls[0][0].message).toMatch(/Pick a project/i);
  });

  it("fails calmly when the function returns a transport error", async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const handle = makeHandle();
    await runExportPreset(
      "project-summary-report",
      { projectId: "p-1" },
      handle as any,
    );
    expect(handle.fail).toHaveBeenCalledTimes(1);
    expect(handle.fail.mock.calls[0][0].message).toBe(
      EXPORT_PRESETS["project-summary-report"].failureCopy,
    );
  });
});
