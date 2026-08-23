import { describe, expect, it, beforeEach } from "vitest";
import {
  DEFAULT_SKIN,
  SKINS,
  applyAmbient,
  applySkin,
  normalizeSkin,
  readAmbient,
  readSkin,
  setRoom,
  writeAmbient,
  writeSkin,
} from "@/lib/skins";

describe("skins", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-skin");
    document.documentElement.removeAttribute("data-ambient");
    document.documentElement.removeAttribute("data-room");
  });

  it("falls back to the house skin for anything unknown", () => {
    expect(normalizeSkin("nonsense")).toBe(DEFAULT_SKIN);
    expect(normalizeSkin(null)).toBe(DEFAULT_SKIN);
    expect(readSkin()).toBe(DEFAULT_SKIN);
  });

  it("keeps every registered skin id valid", () => {
    for (const s of SKINS) expect(normalizeSkin(s.id)).toBe(s.id);
  });

  it("persists a chosen skin and writes it onto the document", () => {
    writeSkin("neon-rain");
    expect(readSkin()).toBe("neon-rain");
    expect(document.documentElement.getAttribute("data-skin")).toBe("neon-rain");
  });

  it("treats background motion as on unless explicitly turned off", () => {
    expect(readAmbient()).toBe(true);
    writeAmbient(false);
    expect(readAmbient()).toBe(false);
    expect(document.documentElement.getAttribute("data-ambient")).toBe("off");
  });

  it("records the room so the backdrop can move with navigation", () => {
    setRoom("work");
    expect(document.documentElement.getAttribute("data-room")).toBe("work");
    setRoom("work"); // idempotent — no churn from a second render
    expect(document.documentElement.getAttribute("data-room")).toBe("work");
  });

  it("applies attributes without touching storage", () => {
    applySkin("circuit");
    applyAmbient(true);
    expect(document.documentElement.getAttribute("data-skin")).toBe("circuit");
    expect(document.documentElement.getAttribute("data-ambient")).toBe("on");
    expect(window.localStorage.getItem("vanta.skin")).toBeNull();
  });
});
