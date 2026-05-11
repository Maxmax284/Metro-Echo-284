// email-inbound: public webhook that accepts forwarded email and creates a note.
// Address format: <slug>@inbound.vanta — the slug routes to a user. Body can be
// JSON ({to, from, subject, text, html, attachments?[]}) or multipart/form-data
// (SendGrid/Postmark/Mailgun-style). No JWT required (public endpoint), but the
// slug acts as a shared secret.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
      .select("user_id, active")
      .eq("slug", slug)
      .maybeSingle();
    if (!addr || !addr.active) {
      return new Response(JSON.stringify({ error: "unknown address" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
        metadata: { from, to, subject },
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
        metadata: { from, to, subject, ingested_file_id: file?.id },
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

    return new Response(JSON.stringify({ ok: true, note_id: note!.id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("email-inbound", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
