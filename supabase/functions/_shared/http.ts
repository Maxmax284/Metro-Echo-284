// Canonical HTTP edge layer for every Echo function.
// One CORS policy, one JSON envelope, one preflight answer.
// Pure module (no external imports) so it is unit-testable outside Deno.

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Back-compat alias: many functions already reference `corsHeaders`.
export const corsHeaders = CORS_HEADERS;

export const JSON_HEADERS: Record<string, string> = {
  ...CORS_HEADERS,
  "Content-Type": "application/json",
};

/** Answer a CORS preflight, or null when the request is not a preflight. */
export function preflight(req: Request): Response | null {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  return null;
}

export function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
}

export function okResponse(body: Record<string, unknown> = {}): Response {
  return jsonResponse({ ok: true, ...body }, 200);
}

/** Safe JSON body read — never throws on empty or malformed bodies. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
