import { describe, it, expect } from "vitest";
import {
  ADVANCED_SURFACES,
  DEFAULT_SURFACE,
  PRIMARY_ROOMS,
  ROOM_LABEL,
  isPrimaryRoom,
  isSurfaceId,
  parseSurfaceFromSearch,
  roomForSurface,
  surfaceSearch,
} from "@/lib/navigation";

describe("primary navigation", () => {
  it("exposes exactly four rooms", () => {
    expect(PRIMARY_ROOMS).toEqual(["today", "work", "ask", "receipts"]);
  });

  it("labels every room", () => {
    for (const room of PRIMARY_ROOMS) {
      expect(ROOM_LABEL[room]).toBeTruthy();
    }
  });

  it("keeps Today as the default front door", () => {
    expect(DEFAULT_SURFACE).toBe("today");
    expect(parseSurfaceFromSearch("")).toBeNull();
    expect(surfaceSearch("today")).toBe("");
  });

  it("recognises rooms and surfaces", () => {
    expect(isPrimaryRoom("work")).toBe(true);
    expect(isPrimaryRoom("sherlock")).toBe(false);
    expect(isSurfaceId("sherlock")).toBe(true);
    expect(isSurfaceId("nonsense")).toBe(false);
  });
});

describe("specialist desks stay reachable", () => {
  it("maps every desk to an owning room", () => {
    for (const desk of ADVANCED_SURFACES) {
      expect(PRIMARY_ROOMS).toContain(roomForSurface(desk));
    }
  });

  it("puts operational desks under Work", () => {
    for (const desk of ["projects", "inbox", "briefs", "memory", "commitments", "schedule", "actions", "sherlock", "awareness", "command"] as const) {
      expect(roomForSurface(desk)).toBe("work");
    }
  });

  it("keeps one companion room — legacy chat links resolve to Ask", () => {
    expect(roomForSurface("ask")).toBe("ask");
    expect(parseSurfaceFromSearch("?surface=conversation")).toBe("ask");
    expect(isSurfaceId("conversation")).toBe(false);
  });

  it("does not orphan any desk from the More sheet", () => {
    for (const desk of ADVANCED_SURFACES) {
      expect(PRIMARY_ROOMS).not.toContain(desk as string);
      expect(isSurfaceId(desk)).toBe(true);
    }
  });
});

describe("deep link compatibility", () => {
  it("reads ?surface= links", () => {
    expect(parseSurfaceFromSearch("?surface=projects")).toBe("projects");
    expect(parseSurfaceFromSearch("surface=receipts")).toBe("receipts");
  });

  it("reads legacy ?tab= links", () => {
    expect(parseSurfaceFromSearch("?tab=memory")).toBe("memory");
  });

  it("remaps retired keys instead of 404ing", () => {
    expect(parseSurfaceFromSearch("?surface=audit")).toBe("receipts");
    expect(parseSurfaceFromSearch("?surface=cockpit")).toBe("command");
    expect(parseSurfaceFromSearch("?surface=chat")).toBe("ask");
    expect(parseSurfaceFromSearch("?surface=companion")).toBe("ask");
    expect(parseSurfaceFromSearch("?surface=conversation")).toBe("ask");
  });

  it("ignores unknown surfaces rather than crashing navigation", () => {
    expect(parseSurfaceFromSearch("?surface=fenrir")).toBeNull();
  });

  it("round-trips every surface through the URL", () => {
    for (const id of [...PRIMARY_ROOMS, ...ADVANCED_SURFACES]) {
      const search = surfaceSearch(id);
      const parsed = parseSurfaceFromSearch(search);
      expect(parsed ?? DEFAULT_SURFACE).toBe(id);
    }
  });

  it("leaves other query params alone when parsing", () => {
    expect(parseSurfaceFromSearch("?commitment=abc")).toBeNull();
    expect(parseSurfaceFromSearch("?commitment=abc&surface=commitments")).toBe("commitments");
  });
});
