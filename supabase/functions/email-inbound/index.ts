import { corsHeaders } from "../_shared/http.ts";
// email-inbound: public webhook that accepts forwarded email and creates a note.
// Address format: <slug>@inbound.vanta — the slug routes to a user. Body can be
// JSON ({to, from, subject, text, html, attachments?[]}) or multipart/form-data
// (SendGrid/Postmark/Mailgun-style). No JWT required (public endpoint), but the
// slug acts as a shared secret.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { linkEntities } from "../_shared/entityGraph.ts";


function extractSlug(toField: string | null | undefined): string | null {
  if (!toField) return null;
  const m = toField.match(/([A-Za-z0-9._-]+)@/);
  return m ? m[1].toLowerCase() : null;
}

function htmlToText(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|h[1-6]|li|br)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let to = ""; let from = ""; let subject = ""; let text = ""; let html = "";
    const ctype = req.headers.get("content-type") ?? "";

    if (ctype.includes("application/json")) {
      const j = await req.json();
      to = j.to ?? j.recipient ?? ""; from = j.from ?? j.sender ?? "";
      subject = j.subject ?? ""; text = j.text ?? j["body-plain"] ?? "";
      html = j.html ?? j["body-html"] ?? "";
    } else if (ctype.includes("multipart/form-data") || ctype.includes("application/x-www-form-urlencoded")) {
      const form = await req.formData();
      to = String(form.get("to") ?? form.get("recipient") ?? "");
      from = String(form.get("from") ?? form.get("sender") ?? "");
      subject = String(form.get("subject") ?? "");
      text = String(form.get("text") ?? form.get("body-plain") ?? "");
      html = String(form.get("html") ?? form.get("body-html") ?? "");
    } else {
      text = await req.text();
      to = req.headers.get("x-to") ?? ""; from = req.headers.get("x-from") ?? "";
      subject = req.headers.get("x-subject") ?? "";
    }

    const slug = extractSlug(to) ?? new URL(req.url).searchParams.get("slug");
    if (!slug) return new Response(JSON.stringify({ error: "no slug" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: addr } = await supabase
      .from("email_inbound_addresses")
      .select("user_id, active, default_organization_id, default_scope, default_project_id")
      .eq("slug", slug)
      .maybeSingle();
    if (!addr || !addr.active) {
      return new Response(JSON.stringify({ error: "unknown address" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Per-recipient rate limit: 30 emails / 60s
    const { data: allowed } = await supabase.rpc("rate_limit_hit", { _user_id: addr.user_id, _bucket: "email-inbound", _limit: 30, _window_seconds: 60 });
    if (allowed === false) {
      return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = (text && text.trim()) ? text : (html ? htmlToText(html) : "");
    const title = subject || `Email from ${from || "unknown"}`;

    const { data: file } = await supabase
      .from("ingested_files")
      .insert({
        user_id: addr.user_id,
        filename: title.slice(0, 180),
        mime_type: "message/rfc822",
        size_bytes: body.length,
        source: "email",
        status: "processing",
        organization_id: addr.default_organization_id ?? null,
        metadata: { from, to, subject, scope: addr.default_scope ?? "personal" },
      })
      .select("id")
      .single();

    const { data: note, error: noteErr } = await supabase
      .from("notes")
      .insert({
        user_id: addr.user_id,
        title,
        body: body || `(empty email from ${from})`,
        tags: ["imported", "email"],
        organization_id: addr.default_organization_id ?? null,
        project_id: addr.default_project_id ?? null,
        metadata: { from, to, subject, ingested_file_id: file?.id, scope: addr.default_scope ?? "personal" },
      })
      .select("id")
      .single();

    if (noteErr) {
      if (file) await supabase.from("ingested_files").update({ status: "error", error: noteErr.message }).eq("id", file.id);
      throw noteErr;
    }

    if (file) await supabase.from("ingested_files").update({ status: "done", note_id: note!.id }).eq("id", file.id);
    await supabase.from("email_inbound_addresses").update({ last_received_at: new Date().toISOString() }).eq("slug", slug);

    try {
      await supabase.functions.invoke("embeddings-generate", { body: { kind: "note", id: note!.id } });
    } catch {/* ignore */}
    try {
      await supabase.functions.invoke("memory-autolink", { body: { note_id: note!.id } });
    } catch {/* ignore */}
    try {
      await linkEntities({ sb: supabase, userId: addr.user_id, source_kind: "note", source_id: note!.id, text: `${title}\n${body}` });
    } catch {/* ignore */}
    await supabase.from("audit_log").insert({
      user_id: addr.user_id, entity_type: "note", entity_id: note!.id,
      event: "email.ingest",
      payload: { from, subject, slug, organization_id: addr.default_organization_id ?? null, project_id: addr.default_project_id ?? null },
    });

    return new Response(JSON.stringify({ ok: true, note_id: note!.id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("email-inbound", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
