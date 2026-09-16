import { corsHeaders } from "../_shared/http.ts";
// email-inbound: public webhook that accepts forwarded email and creates a note.
// Address format: <slug>@inbound.vanta — the slug routes to a user. Body can be
// JSON ({to, from, subject, text, html, attachments?[]}) or multipart/form-data
// (SendGrid/Postmark/Mailgun-style). No JWT required (public endpoint), but the
// slug acts as a shared secret.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { linkEntities } from "../_shared/entityGraph.ts";
import { noticeFlights } from "../_shared/flightNotice.ts";


function extractSlug(toField: string | null | undefined): string | null {
  if (!toField) return null;
  const m = toField.match(/([A-Za-z0-9._-]+)@/);
  return m ? m[1].toLowerCase() : null;
}

type InboundAttachment = { filename: string; mime: string; bytes: Uint8Array };

const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const BODY_FIELDS = new Set([
  "to", "recipient", "from", "sender", "subject", "text", "html",
  "body-plain", "body-html", "headers", "envelope", "charsets",
  "attachment-info", "attachment-count", "spam_score", "dkim", "SPF",
]);

function safeName(name: string): string {
  const cleaned = (name || "attachment").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120);
  return cleaned || "attachment";
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
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
    const attachments: InboundAttachment[] = [];
    const ctype = req.headers.get("content-type") ?? "";

    if (ctype.includes("application/json")) {
      const j = await req.json();
      to = j.to ?? j.recipient ?? ""; from = j.from ?? j.sender ?? "";
      subject = j.subject ?? ""; text = j.text ?? j["body-plain"] ?? "";
      html = j.html ?? j["body-html"] ?? "";
      const list = Array.isArray(j.attachments) ? j.attachments : [];
      for (const a of list.slice(0, MAX_ATTACHMENTS)) {
        const content = a?.content ?? a?.data ?? a?.Content ?? null;
        if (typeof content !== "string" || !content) continue;
        try {
          const bytes = b64ToBytes(content);
          if (bytes.byteLength > MAX_ATTACHMENT_BYTES) continue;
          attachments.push({
            filename: safeName(a.filename ?? a.name ?? a.Name ?? "attachment"),
            mime: String(a.contentType ?? a.type ?? a.ContentType ?? "application/octet-stream"),
            bytes,
          });
        } catch { /* skip unreadable attachment */ }
      }
    } else if (ctype.includes("multipart/form-data") || ctype.includes("application/x-www-form-urlencoded")) {
      const form = await req.formData();
      to = String(form.get("to") ?? form.get("recipient") ?? "");
      from = String(form.get("from") ?? form.get("sender") ?? "");
      subject = String(form.get("subject") ?? "");
      text = String(form.get("text") ?? form.get("body-plain") ?? "");
      html = String(form.get("html") ?? form.get("body-html") ?? "");
      for (const [key, value] of form.entries()) {
        if (attachments.length >= MAX_ATTACHMENTS) break;
        if (BODY_FIELDS.has(key)) continue;
        if (!(value instanceof File)) continue;
        if (value.size > MAX_ATTACHMENT_BYTES) continue;
        attachments.push({
          filename: safeName(value.name || key),
          mime: value.type || "application/octet-stream",
          bytes: new Uint8Array(await value.arrayBuffer()),
        });
      }
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
        
        metadata: { from, to, subject, ingested_file_id: file?.id, scope: addr.default_scope ?? "personal" },
      })
      .select("id")
      .single();

    if (noteErr) {
      if (file) await supabase.from("ingested_files").update({ status: "error", error: noteErr.message }).eq("id", file.id);
      throw noteErr;
    }

    // Attachments land as files needing review. Nothing is routed or executed;
    // the file intake surface decides what happens next.
    const storedAttachments: { id: string; filename: string }[] = [];
    for (const att of attachments) {
      const path = `${addr.user_id}/email/${crypto.randomUUID()}-${att.filename}`;
      const { error: upErr } = await supabase.storage
        .from("memory-uploads")
        .upload(path, att.bytes, { contentType: att.mime || undefined, upsert: false });
      if (upErr) { console.error("email-inbound attachment upload", upErr.message); continue; }
      const { data: attRow, error: attErr } = await supabase
        .from("ingested_files")
        .insert({
          user_id: addr.user_id,
          filename: att.filename,
          mime_type: att.mime,
          size_bytes: att.bytes.byteLength,
          storage_path: path,
          source: "email",
          status: "pending",
          review_status: "new",
          note_id: note!.id,
          organization_id: addr.default_organization_id ?? null,
          metadata: { from, to, subject, via: "email_attachment", scope: addr.default_scope ?? "personal" },
        })
        .select("id")
        .single();
      if (attErr || !attRow) { console.error("email-inbound attachment row", attErr?.message); continue; }
      storedAttachments.push({ id: attRow.id, filename: att.filename });
      await supabase.from("audit_log").insert({
        user_id: addr.user_id, entity_type: "file", entity_id: attRow.id,
        event: "email.attachment_received",
        payload: { from, subject, filename: att.filename, note_id: note!.id, bytes: att.bytes.byteLength },
      });
    }

    if (storedAttachments.length) {
      await supabase.from("notes").update({
        metadata: {
          from, to, subject, ingested_file_id: file?.id,
          scope: addr.default_scope ?? "personal",
          attachment_count: storedAttachments.length,
          attachment_file_ids: storedAttachments.map((a) => a.id),
        },
      }).eq("id", note!.id);
    }

    /* The address can name a default project. Recording it on the audit line
       but never filing the note there meant the setting silently did nothing,
       so the link is written here — a note attached to a project, nothing more. */
    if (addr.default_project_id) {
      const { error: linkErr } = await supabase.from("project_items").insert({
        added_by: addr.user_id,
        project_id: addr.default_project_id,
        item_type: "note",
        item_id: note!.id,
      });
      if (linkErr) {
        console.error("email-inbound project link", linkErr.message);
      } else {
        await supabase.from("audit_log").insert({
          user_id: addr.user_id, entity_type: "note", entity_id: note!.id,
          event: "note.attached_to_project",
          payload: { project_id: addr.default_project_id, via: "email_inbound_default", slug },
        });
      }
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
    /* A booking that arrives by mail is read here — a pattern pass, no model, no
       cost. What it finds is a draft with the mail as its evidence, and one
       question when Echo cannot tell whose flight it is. Nothing is booked. */
    try {
      await noticeFlights(
        supabase,
        { userId: addr.user_id, orgId: addr.default_organization_id ?? null },
        {
          text: `${title}\n${body}`,
          source: "mail",
          sender: { name: null, email: from || null },
          origin_ref: { kind: "note", id: note!.id },
        },
      );
    } catch (e) {
      console.error("email-inbound flight notice", e instanceof Error ? e.message : e);
    }
    await supabase.from("audit_log").insert({
      user_id: addr.user_id, entity_type: "note", entity_id: note!.id,
      event: "email.ingest",
      payload: { from, subject, slug, attachments: storedAttachments.length, organization_id: addr.default_organization_id ?? null, project_id: addr.default_project_id ?? null },
    });

    return new Response(JSON.stringify({ ok: true, note_id: note!.id, attachments: storedAttachments.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("email-inbound", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
