// perception-look — one deliberate look at one picture.
//
// Doctrine:
//   - only on request. There is no sweep, no cron, no upload trigger calling
//     this. A person opened the camera and pressed a question.
//   - one look, one receipt. Every call writes `image.looked` or
//     `image.look_failed` to the audit log.
//   - nothing is routed, filed, staged or executed. The answer comes back as
//     words; what happens next is the person's move.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveUser } from "../_shared/authContext.ts";
import { unauthorized } from "../_shared/errors.ts";
import { corsHeaders } from "../_shared/http.ts";
import { isLookable, lookAtImage, lookIntent, LookError } from "../_shared/lookAt.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const user = await resolveUser(req, supabase as any);
    if (!user) return unauthorized();

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: allowed } = await admin.rpc("rate_limit_hit", {
      _user_id: user.id,
      _bucket: "perception-look",
      _limit: 20,
      _window_seconds: 60,
    });
    if (allowed === false) return json({ error: "rate_limited" }, 429);

    const { ingested_file_id, intent, question } = await req.json().catch(() => ({}));
    if (!ingested_file_id) return json({ error: "ingested_file_id required" }, 400);

    const { data: rec } = await supabase
      .from("ingested_files")
      .select("id, user_id, organization_id, filename, mime_type, storage_path, metadata")
      .eq("id", ingested_file_id)
      .maybeSingle();
    if (!rec) return json({ error: "not_found" }, 404);
    if (!isLookable({ mime_type: rec.mime_type, filename: rec.filename })) {
      return json({ error: "not_a_picture", message: "That one is not a picture. Files go through the file lane." }, 400);
    }
    if (!rec.storage_path) return json({ error: "no_file", message: "That picture never finished uploading." }, 400);

    const { data: blob, error: dlErr } = await admin.storage
      .from("memory-uploads")
      .download(rec.storage_path);
    if (dlErr || !blob) return json({ error: "download_failed", message: "The picture could not be opened." }, 500);

    const chosen = lookIntent(typeof intent === "string" ? intent : null);
    const meta = (rec.metadata ?? {}) as Record<string, unknown>;

    let answer = "";
    let uncertain = false;
    try {
      const out = await lookAtImage(
        blob,
        (rec.mime_type ?? "image/png").toLowerCase(),
        chosen.id,
        typeof question === "string" ? question : null,
      );
      answer = out.answer;
      uncertain = out.uncertain;
    } catch (e) {
      const status = e instanceof LookError ? e.status : 500;
      const message = e instanceof Error ? e.message : "look failed";
      await admin.from("audit_log").insert({
        user_id: rec.user_id,
        organization_id: rec.organization_id ?? null,
        entity_type: "ingested_file",
        entity_id: rec.id,
        event: "image.look_failed",
        payload: { intent: chosen.id, filename: rec.filename, reason: message.slice(0, 200), status },
      });
      return json(
        {
          error: "look_failed",
          status,
          message:
            status === 402 || status === 403
              ? "Didn't run. Echo can't look right now."
              : "Didn't run. The picture came back unreadable.",
        },
        status >= 400 && status < 600 ? status : 500,
      );
    }

    // The look lives on the picture's own record, so history stays with the object.
    const looks = Array.isArray(meta.looks) ? (meta.looks as unknown[]).slice(-4) : [];
    await admin
      .from("ingested_files")
      .update({
        metadata: {
          ...meta,
          looks: [...looks, { intent: chosen.id, at: new Date().toISOString(), answer: answer.slice(0, 2000) }],
        },
      })
      .eq("id", rec.id);

    await admin.from("audit_log").insert({
      user_id: rec.user_id,
      organization_id: rec.organization_id ?? null,
      entity_type: "ingested_file",
      entity_id: rec.id,
      event: "image.looked",
      payload: {
        intent: chosen.id,
        filename: rec.filename,
        chars: answer.length,
        uncertain,
        readable: answer.length > 0,
      },
    });

    return json({ intent: chosen.id, answer, uncertain, ingested_file_id: rec.id, filename: rec.filename });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unexpected";
    return json({ error: "unexpected", message }, 500);
  }
});
