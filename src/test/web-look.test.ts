import { describe, expect, it } from "vitest";
import {
  BLOCK_LINE,
  checkPage,
  fetchFailLine,
  hostLabel,
  htmlToText,
  looksLikeLogin,
  pageFingerprint,
  pageTitle,
  readPage,
  safeUrl,
  searchFingerprint,
  checkSearch,
  sourceLine,
  webSearchWatchGoal,
  webWatchGoal,
} from "@/lib/webLook";

describe("safeUrl", () => {
  it("accepts a public https page and adds a scheme when missing", () => {
    expect(safeUrl("https://example.com/booking")).toEqual({ ok: true, url: "https://example.com/booking" });
    const bare = safeUrl("example.com/x");
    expect(bare.ok && bare.url.startsWith("https://example.com")).toBe(true);
  });

  it("refuses private and non-web addresses", () => {
    expect(safeUrl("http://localhost:8080")).toEqual({ ok: false, reason: "private_host" });
    expect(safeUrl("http://192.168.1.4/admin")).toEqual({ ok: false, reason: "private_host" });
    expect(safeUrl("file:///etc/passwd")).toEqual({ ok: false, reason: "not_http" });
    expect(safeUrl("")).toEqual({ ok: false, reason: "bad_url" });
    expect(BLOCK_LINE.private_host).toMatch(/private network/);
  });
});

describe("reading a page", () => {
  const html = `<html><head><title>Booking #4821</title></head>
    <body><script>junk()</script><h1>Confirmed</h1><p>Check-in Sept 20, 2026</p></body></html>`;

  it("keeps the words and drops the markup", () => {
    const text = htmlToText(html);
    expect(text).toContain("Confirmed");
    expect(text).toContain("Check-in Sept 20, 2026");
    expect(text).not.toContain("junk()");
    expect(pageTitle(html)).toBe("Booking #4821");
  });

  it("names the host and the time it was read", () => {
    const read = readPage("https://www.hotel.example/booking/4821", html, new Date("2026-09-15T16:00:00Z"));
    expect(read.host).toBe("hotel.example");
    expect(hostLabel(read.url)).toBe("hotel.example");
    expect(sourceLine(read, "America/New_York")).toMatch(/^Read from hotel\.example on Sep 15/);
  });

  it("spots a sign-in wall instead of pretending to read it", () => {
    const login = `<form><input type="password" name="p"/></form><p>Sign in with your username and password</p>`;
    expect(looksLikeLogin(login, htmlToText(login))).toBe(true);
    expect(fetchFailLine(403, "portal.example")).toMatch(/sign-in/);
  });
});

describe("fingerprint and watching", () => {
  it("ignores whitespace and tracking noise but catches real edits", () => {
    const a = pageFingerprint("Check-in  Sept 20   https://t.example/abc123");
    const b = pageFingerprint("Check-in Sept 20\nhttps://t.example/zzz999");
    expect(a).toBe(b);
    expect(pageFingerprint("Check-in Sept 21")).not.toBe(a);
  });

  it("says nothing on the first look and on an unchanged page", () => {
    const read = readPage("https://example.com/x", "<title>T</title><p>same words</p>");
    const first = checkPage({ url: read.url }, read);
    expect(first).toEqual({ changed: false, fingerprint: read.fingerprint });
    expect(checkPage({ url: read.url, fingerprint: read.fingerprint }, read)).toEqual({
      changed: false,
      fingerprint: read.fingerprint,
    });
  });

  it("reports a diff once the page actually moves", () => {
    const before = readPage("https://example.com/x", "<title>Room 4</title><p>Sept 20</p>");
    const after = readPage("https://example.com/x", "<title>Room 4</title><p>Sept 22</p>");
    const res = checkPage({ url: before.url, fingerprint: before.fingerprint }, after);
    expect(res).toMatchObject({ changed: true });
    if ("outcome" in res) expect(res.outcome).toBe("Room 4 (example.com) changed since Echo last looked.");
  });

  it("stops watching a page that turns into a login wall", () => {
    const login = readPage("https://portal.example/a", `<input type="password"/> please log in with your password`);
    const res = checkPage({ url: login.url, fingerprint: "old" }, login);
    expect(res).toMatchObject({ failed: true, behind_login: true });
  });

  it("names the watch in plain words", () => {
    expect(webWatchGoal("https://www.example.com/x", "confirm the booking")).toBe(
      "Watch example.com — confirm the booking",
    );
    expect(webWatchGoal("https://www.example.com/x")).toBe("Watch example.com for changes");
  });
});

describe("watching a topic", () => {
  const hitsA = [
    { title: "Flooding worsens", url: "https://news.example/bangkok-floods", snippet: "…" },
    { title: "Official updates", url: "https://gov.example/flood-watch", snippet: "…" },
  ];

  it("treats the same pages in a new order as ranking jitter, not news", () => {
    const reordered = [...hitsA].reverse();
    expect(searchFingerprint(reordered)).toBe(searchFingerprint(hitsA));
    const checked = checkSearch({ fingerprint: searchFingerprint(hitsA) }, "bangkok flooding", reordered);
    expect(checked.changed).toBe(false);
  });

  it("stays quiet on the first reading — no baseline, no claim of change", () => {
    const first = checkSearch({ fingerprint: null }, "bangkok flooding", hitsA);
    expect(first.changed).toBe(false);
    expect(first.fingerprint).toBe(searchFingerprint(hitsA));
  });

  it("speaks when new pages show up, and names the question", () => {
    const moved = [...hitsA, { title: "Evacuations ordered", url: "https://wire.example/evac", snippet: "…" }];
    const checked = checkSearch({ fingerprint: searchFingerprint(hitsA) }, "bangkok flooding", moved);
    expect(checked.changed).toBe(true);
    if (checked.changed) expect(checked.outcome).toContain("bangkok flooding");
  });

  it("normalizes host and trailing slash so the same page fingerprints the same", () => {
    const variants = [
      { title: "t", url: "https://www.news.example/bangkok-floods/", snippet: "" },
      { title: "u", url: "https://gov.example/flood-watch", snippet: "" },
    ];
    expect(searchFingerprint(variants)).toBe(searchFingerprint(hitsA));
  });

  it("states the watched question in the goal", () => {
    expect(webSearchWatchGoal("  bangkok   flooding ")).toBe("Watch the web for “bangkok flooding”");
  });
});
