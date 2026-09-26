// The Echo room on a phone: the software keyboard takes half the screen, and
// the room must give it room — the tab bar slides away, the composer docks on
// the keys, and the context banner rides the stream. These are source
// invariants because the cram was a layout decision, not a runtime accident.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const tabs = readFileSync("src/components/shell/SurfaceTabs.tsx", "utf8");
const dock = readFileSync("src/components/shell/ConversationDock.tsx", "utf8");
const surface = readFileSync("src/components/surfaces/ConversationSurface.tsx", "utf8");
const hook = readFileSync("src/hooks/useKeyboardOpen.ts", "utf8");

describe("Echo room under the software keyboard", () => {
  it("knows the keyboard is up from an editable focus plus a real bite of viewport height", () => {
    expect(hook).toMatch(/focusin/);
    expect(hook).toMatch(/visualViewport/);
    expect(hook).toMatch(/isEditable/);
  });

  it("slides the bottom tab bar out of the way while typing", () => {
    expect(tabs).toMatch(/useKeyboardOpen/);
    expect(tabs).toMatch(/translate-y-\[110%\]/);
  });

  it("drops the composer's tab-bar clearance so it docks on the keys", () => {
    expect(dock).toMatch(/useKeyboardOpen/);
    expect(dock).toContain('keyboardOpen ? "bottom-0" : "bottom-[68px]"');
  });

  it("lets the context banner ride the stream instead of squatting on the view", () => {
    const scroller = surface.indexOf("ref={scrollRef}");
    const strip = surface.indexOf("<AskContextStrip");
    const edge = surface.indexOf("<AskEnvironmentEdge");
    expect(scroller).toBeGreaterThan(-1);
    expect(strip).toBeGreaterThan(scroller);
    expect(edge).toBeGreaterThan(scroller);
  });
});
