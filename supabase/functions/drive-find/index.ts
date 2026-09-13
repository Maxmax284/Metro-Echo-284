// drive-find — names, not contents.
//
// Doctrine:
//   - Searching returns what a folder listing would: name, kind, when it
//     changed, a link. Never the inside of a file.
//   - Reading the inside is a second, explicit yes per file. That lives in
//     drive-read, which records what it read.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, jsonResponse, preflight, readJson } from "../_shared/http.ts";
import { resolveUser } from "../_shared/authContext.ts";
import { callGoogle } from "../_shared/googleService.ts";
import { GOOGLE_DRIVE_CONNECTOR_ID } from "../_shared/appUserScopes.ts";
import { driveKindLabel, driveQuery } from "../_shared/driveRead.ts";

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const user = await resolveUser(req, sb as never);
    if (!user) return jsonResponse({ error: "sign in required" }, 401);

    const body = (await readJson(req)) as { query?: string } | null;
    const term = String(body?.query ?? "").trim().slice(0, 120);

    const params = new URLSearchParams({
      q: driveQuery(term),
      pageSize: "15",
      orderBy: "modifiedTime desc",
      fields: "files(id,name,mimeType,modifiedTime,webViewLink,size,owners(displayName))",
    });
    const res = await callGoogle(
      user.id,
      GOOGLE_DRIVE_CONNECTOR_ID,
      `/drive/v3/files?${params.toString()}`,
    );
    if (!res.ok) {
      return jsonResponse({
        connected: res.reason !== "not_connected",
        reason: res.reason,
        detail: res.detail,
        files: [],
      });
    }

    const files = (((res.body as { files?: unknown[] } | null)?.files) ?? []).map((f) => {
      const file = f as {
        id?: string;
        name?: string;
        mimeType?: string;
        modifiedTime?: string;
        webViewLink?: string;
      };
      return {
        id: String(file.id ?? ""),
        name: String(file.name ?? "Untitled"),
        kind: driveKindLabel(file.mimeType ?? ""),
        mimeType: String(file.mimeType ?? ""),
        modifiedAt: file.modifiedTime ?? null,
        link: file.webViewLink ?? null,
      };
    });

    return jsonResponse({ connected: true, files });
  } catch (e) {
    console.error("[drive-find]", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
