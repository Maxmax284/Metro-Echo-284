// gmailBatch — many message headers in one request instead of one each.
//
// Doctrine:
//   - A sweep that costs fifty provider calls to read fifty subject lines is a
//     sweep nobody can afford to run hourly. One request, fifty parts.
//   - A part that failed is reported, never quietly dropped. A blind spot that
//     looks like an empty inbox is the exact lie this product refuses to tell.
// Pure module: no IO, no Deno globals.

/** Gmail's own cap on parts in one batch. */
export const BATCH_MAX = 50;

export const METADATA_HEADERS = ["From", "Subject", "Date"];

export type BatchPart = { status: number; body: unknown };

export function batchBoundary(seed: string): string {
  return `echo_batch_${seed.replace(/[^A-Za-z0-9_]/g, "").slice(0, 24) || "x"}`;
}

/** One `GET .../messages/{id}?format=metadata` per id, as a multipart body. */
export function buildMetadataBatch(
  ids: string[],
  boundary: string,
): { contentType: string; body: string } {
  const headers = METADATA_HEADERS.map((h) => `metadataHeaders=${h}`).join("&");
  const parts = ids.slice(0, BATCH_MAX).map((id, i) =>
    [
      `--${boundary}`,
      "Content-Type: application/http",
      `Content-ID: <part-${i}>`,
      "",
      `GET /gmail/v1/users/me/messages/${id}?format=metadata&${headers}`,
      "",
    ].join("\r\n")
  );
  return {
    contentType: `multipart/mixed; boundary=${boundary}`,
    body: `${parts.join("\r\n")}\r\n--${boundary}--\r\n`,
  };
}

/** The boundary a multipart response says it used. */
export function boundaryOf(contentType: string | null | undefined): string | null {
  const hit = (contentType ?? "").match(/boundary=("?)([^";]+)\1/i);
  return hit ? hit[2].trim() : null;
}

/**
 * Gmail answers on its own boundary, not the one the request used, and a caller
 * that only has the body text still has to be able to read it. The first line of
 * a multipart body is that boundary.
 */
export function sniffBoundary(text: string): string | null {
  const first = (text ?? "").trimStart().split(/\r?\n/, 1)[0] ?? "";
  const hit = first.match(/^--(\S+?)(--)?$/);
  return hit ? hit[1] : null;
}


/**
 * Split a multipart/mixed response into its embedded HTTP answers, keeping each
 * status. An unparseable part comes back as status 0 with a null body so the
 * caller can count it rather than mistake it for silence.
 */
export function parseBatch(contentType: string | null | undefined, text: string): BatchPart[] {
  const named = boundaryOf(contentType);
  /* Trust the body over the header: the answer carries its own boundary. */
  const boundary = named && text.includes(`--${named}`) ? named : sniffBoundary(text);
  if (!boundary) return [];
  const chunks = text.split(`--${boundary}`);
  const out: BatchPart[] = [];
  for (const chunk of chunks) {
    const at = chunk.indexOf("HTTP/");
    if (at < 0) continue;
    const rest = chunk.slice(at);
    const status = Number(rest.split(/\r?\n/, 1)[0]?.split(/\s+/)[1] ?? 0) || 0;
    const split = rest.search(/\r?\n\r?\n/);
    if (split < 0) {
      out.push({ status, body: null });
      continue;
    }
    const raw = rest.slice(split).replace(/^\r?\n\r?\n/, "");
    /* Past the embedded headers sits the JSON. Anything after it is boundary
       noise the split already cut. */
    const jsonAt = raw.search(/[{[]/);
    if (jsonAt < 0) {
      out.push({ status, body: null });
      continue;
    }
    try {
      out.push({ status, body: JSON.parse(raw.slice(jsonAt).trim()) });
    } catch {
      out.push({ status, body: null });
    }
  }
  return out;
}
