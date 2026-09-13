// drive-read — the inside of ONE file, because a person said so.
//
// Doctrine:
//   - `confirmed: true` or nothing happens. A search result cannot become a read
//     by accident, and no loop may read a folder's worth of files.
//   - Every read leaves a receipt naming the file. If Echo read it, you can see
//     that it read it.
//   - A file type Echo cannot turn into words is not guessed at: it says open it
//     in Google instead.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, jsonResponse, preflight, readJson } from "../_shared/http.ts";
import { resolveUser } from "../_shared/authContext.ts";
import { callGoogle } from "../_shared/googleService.ts";
import { adminClient } from "../_shared/appUserConnections.ts";
import { GOOGLE_DRIVE_CONNECTOR_ID } from "../_shared/appUserScopes.ts";
import { driveKindLabel, readPathFor } from "../_shared/driveRead.ts";
import { writeAuditEvent } from "../_shared/auditEvent.ts";

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

    const body = (await readJson(req)) as {
      file_id?: string;
      confirmed?: boolean;
      organization_id?: string | null;
    } | null;

    const fileId = String(body?.file_id ?? "").trim();
    if (!/^[A-Za-z0-9_-]{5,128}$/.test(fileId)) return jsonResponse({ error: "which file?" }, 400);
    if (body?.confirmed !== true) {
      return jsonResponse({ error: "Reading inside a file needs your yes for that file." }, 400);
    }

    const meta = await callGoogle(
      user.id,
      GOOGLE_DRIVE_CONNECTOR_ID,
      `/drive/v3/files/${fileId}?fields=id,name,mimeType,webViewLink`,
    );
    if (!meta.ok) {
      return jsonResponse(
        {
          error: meta.reason === "not_connected"
            ? "Drive is not switched on."
            : "Google would not hand that file over.",
        },
        meta.reason === "not_connected" ? 403 : 502,
      );
    }
    const file = meta.body as { name?: string; mimeType?: string; webViewLink?: string };
    const mimeType = String(file.mimeType ?? "");
    const path = readPathFor(fileId, mimeType);
    const admin = adminClient();
    const orgId = typeof body?.organization_id === "string" ? body.organization_id : null;

    if (!path) {
      return jsonResponse({
        readable: false,
        name: file.name ?? "That file",
        kind: driveKindLabel(mimeType),
        link: file.webViewLink ?? null,
        detail: "Echo cannot turn that kind of file into words. Open it in Google instead.",
      });
    }

    const content = await callGoogle(user.id, GOOGLE_DRIVE_CONNECTOR_ID, path);
    if (!content.ok) {
      await writeAuditEvent(admin as never, {
        actor: user.id,
        organizationId: orgId,
        entityType: "document",
        entityId: null,
        event: "google.drive.read.failed",
        source: "app",
        success: false,
        metadata: { file_id: fileId, name: file.name ?? null, detail: content.detail },
      });
      return jsonResponse({ error: "That file would not open." }, 502);
    }

    const text = typeof content.body === "string"
      ? content.body
      : JSON.stringify(content.body ?? "");

    await writeAuditEvent(admin as never, {
      actor: user.id,
      organizationId: orgId,
      entityType: "document",
      entityId: null,
      event: "google.drive.read",
      source: "app",
      success: true,
      metadata: { file_id: fileId, name: file.name ?? null, kind: driveKindLabel(mimeType) },
    });

    return jsonResponse({
      readable: true,
      name: file.name ?? "That file",
      kind: driveKindLabel(mimeType),
      link: file.webViewLink ?? null,
      text: text.slice(0, 40_000),
    });
  } catch (e) {
    console.error("[drive-read]", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
