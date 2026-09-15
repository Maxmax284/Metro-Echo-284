// webFetch — the one place Echo actually reaches out to a public page.
// Reading only: no cookies, no sign-in, no forms, no POSTs. Shared by the
// web-look function and the watch sweep so both read pages identically.
import { fetchFailLine, hostLabel, readPage, type PageRead } from "./webLook.ts";

const FETCH_TIMEOUT_MS = 12_000;
const MAX_BYTES = 1_500_000;

export async function fetchPage(
  url: string,
): Promise<{ ok: true; read: PageRead } | { ok: false; line: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent": "MetroEcho/1.0 (+https://metroecho.lovable.app)",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!r.ok) return { ok: false, line: fetchFailLine(r.status, hostLabel(url)) };
    const type = (r.headers.get("content-type") ?? "").toLowerCase();
    if (!type.includes("html") && !type.includes("text") && !type.includes("json")) {
      return { ok: false, line: `${hostLabel(url)} answered with a file Echo cannot read as a page.` };
    }
    const body = (await r.text()).slice(0, MAX_BYTES);
    return { ok: true, read: readPage(r.url || url, body) };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      line: aborted
        ? `${hostLabel(url)} took too long to answer.`
        : `Echo could not reach ${hostLabel(url)}.`,
    };
  } finally {
    clearTimeout(timer);
  }
}
