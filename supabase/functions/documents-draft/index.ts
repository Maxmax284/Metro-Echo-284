import { corsHeaders } from "../_shared/http.ts";
// documents-draft: generate (or revise) the body text of a drafted business
// document. Writes a new document_versions row (source='draft' or 'revision'),
// flips documents.status to 'drafted', and emits an audit receipt.
//
// Doctrine: Plan → Approve → Execute. The user explicitly tapped Draft / Revise.
// We never send, sign, or share — we hand back a markdown body for review.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { VANTA_CORE_VOICE } from "../_shared/vantaVoice.ts";
import { streamAstraText } from "../_shared/aiResponses.ts";
import { chatIdForUser, sendTelegram } from "../_shared/telegramApi.ts";
import { claimDelivery, floorGate, hasPushDevice, reachPhone } from "../_shared/delivery/reach.ts";


const Body = z.object({
  document_id: z.string().uuid(),
  // free-form template prompt (built on the client from documentTemplates.ts)
  user_message: z.string().min(20).max(20_000),
  template_title: z.string().min(2).max(200),
  // optional follow-up. When present, we are revising the latest draft.
  revision_prompt: z.string().min(1).max(4_000).optional(),
  evidence: z.array(z.object({
    kind: z.enum(["note", "receipt"]),
    id: z.string().uuid(),
    label: z.string().min(1).max(240),
    recordedAt: z.string(),
  })).max(40).optional(),
  draft_format: z.enum(["meeting_brief", "follow_up_memo"]).optional(),
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
    const { data: claims } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    const user = claims?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
    const { document_id, user_message, template_title, revision_prompt, evidence = [], draft_format } = parsed.data;

    const { data: doc } = await supabase
      .from("documents").select("*").eq("id", document_id).maybeSingle();
    if (!doc) return json({ error: "not_found" }, 404);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Pull the most recent version (if any) for revision context.
    const { data: latestVer } = await supabase
      .from("document_versions")
      .select("*")
      .eq("document_id", document_id)
      .order("version_no", { ascending: false })
      .limit(1)
      .maybeSingle();

    const isRevision = !!revision_prompt && !!latestVer?.body_text;

    const evidenceBundle = isRevision
      ? { text: "", refs: [] as Array<Record<string, string>>, truncated: false }
      : await resolveEvidence(admin, user.id, doc.organization_id ?? null, evidence);
    if (draft_format && !evidenceBundle.refs.some((ref) => ref.kind === "note")) {
      return json({ ok: false, error: "Choose at least one accessible note." }, 400);
    }

    await supabase.from("documents").update({ status: "drafting", failure_reason: null }).eq("id", document_id);

    const sys = `${VANTA_CORE_VOICE}
You draft business documents in plain English for an operator who is not a lawyer.
- Tight, useful, calm. Warm but not chummy. No exclamation marks.
- No legal cosplay. No jurisdiction-specific guarantees. No "as an AI".
- Output Markdown only. Use real headings (##) and short paragraphs.
- Where information is missing, write "[to be supplied]" instead of inventing facts.
- Never invent attendees, decisions, owners, dates, promises, or outcomes.
- When evidence is supplied, use only that evidence for factual claims.
- Preserve source markers such as [N1] and [R1] beside the claims they support.
- End with a short closing line: "This draft is for review. It is not legal advice."
Template: ${template_title}.`;

    const messages = isRevision
      ? [
          { role: "system", content: sys },
          {
            role: "user",
            content: `Current draft (Markdown):\n\n${(latestVer!.body_text as string).slice(0, 60_000)}`,
          },
          {
            role: "user",
            content: `Revision request:\n${revision_prompt}\n\nReturn the FULL revised document in Markdown. Preserve sections that weren't asked to change.`,
          },
        ]
      : [
          { role: "system", content: sys },
          {
            role: "user",
            content: `${user_message}\n\n${draftInstructions(draft_format)}\n\nEVIDENCE:\n${evidenceBundle.text || "No evidence was supplied."}`,
          },
        ];

    const model = "openai/gpt-6-astra";
    let generated: { text: string; runId?: string };
    try {
      generated = await streamAstraText({
        apiKey: LOVABLE_API_KEY,
        messages: messages as Array<{ role: "system" | "user" | "assistant"; content: string }>,
        incomingRunId: req.headers.get("X-Lovable-AIG-Run-ID") ?? undefined,
      });
    } catch (error) {
      const status = Number((error as { status?: number }).status ?? 500);
      const message = error instanceof Error ? error.message : "Echo couldn't finish this draft.";
      await failDoc(supabase, document_id, user.id, message);
      return json({ ok: false, error: message }, status);
    }
    const body = generated.text;
    if (!body.trim()) {
      await failDoc(supabase, document_id, user.id, "Echo's draft came back empty. Try again.");
      return json({ ok: false, error: "empty_output" }, 500);
    }

    const nextVersionNo = (latestVer?.version_no ?? 0) + 1;
    const { data: version, error: verErr } = await supabase
      .from("document_versions")
      .insert({
        document_id,
        user_id: user.id,
        version_no: nextVersionNo,
        body_text: body,
        source: isRevision ? "revision" : "draft",
      })
      .select()
      .single();
    if (verErr) throw verErr;

    await supabase.from("documents")
      .update({
        status: "drafted",
        failure_reason: null,
        ...(evidenceBundle.refs.length ? {
          draft_inputs: {
            ...(typeof doc.draft_inputs === "object" && doc.draft_inputs ? doc.draft_inputs : {}),
            evidence: evidenceBundle.refs,
            draft_format: draft_format ?? null,
            evidence_truncated: evidenceBundle.truncated,
          },
        } : {}),
      })
      .eq("id", document_id);

    await supabase.from("audit_log").insert({
      user_id: user.id,
      entity_type: "document",
      entity_id: document_id,
      event: isRevision ? "document.draft_revised" : "document.draft_created",
      payload: {
        version_id: version.id,
        version_no: nextVersionNo,
        model,
        evidence: evidenceBundle.refs,
        evidence_truncated: evidenceBundle.truncated,
        draft_format: draft_format ?? null,
        run_id: generated.runId ?? null,
      },
    });

    if (!isRevision && draft_format) await publishDraftReady(admin, {
      userId: user.id,
      organizationId: doc.organization_id ?? null,
      documentId: document_id,
      title: doc.title || template_title,
      versionNo: nextVersionNo,
    });

    return json({ ok: true, version_id: version.id, version_no: nextVersionNo }, 200, generated.runId);
  } catch (e) {
    console.error("[documents-draft] error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

async function failDoc(supabase: any, document_id: string, user_id: string, reason: string) {
  await supabase.from("documents")
    .update({ status: "failed", failure_reason: reason })
    .eq("id", document_id);
  await supabase.from("audit_log").insert({
    user_id, entity_type: "document", entity_id: document_id,
    event: "document.draft_failed", payload: { reason },
  });
}

function json(body: unknown, status = 200, runId?: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...(runId ? { "X-Lovable-AIG-Run-ID": runId, "Access-Control-Expose-Headers": "X-Lovable-AIG-Run-ID" } : {}),
    },
  });
}

function draftInstructions(kind?: "meeting_brief" | "follow_up_memo"): string {
  if (kind === "meeting_brief") {
    return "Write a meeting brief with: What was discussed, Decisions, Owners and dates, Open questions, and Sources used. Omit an empty section except Sources used.";
  }
  if (kind === "follow_up_memo") {
    return "Write a polished follow-up memo with: Subject, concise recap, confirmed decisions, next steps with owners/dates, open questions, and Sources used. It must remain a draft and must not claim it was sent.";
  }
  return "Follow the selected business-document template.";
}

async function resolveEvidence(
  admin: any,
  userId: string,
  organizationId: string | null,
  refs: Array<{ kind: "note" | "receipt"; id: string }>,
): Promise<{ text: string; refs: Array<Record<string, string>>; truncated: boolean }> {
  if (!refs.length) return { text: "", refs: [], truncated: false };
  const noteIds = refs.filter((ref) => ref.kind === "note").map((ref) => ref.id);
  const receiptIds = refs.filter((ref) => ref.kind === "receipt").map((ref) => ref.id);
  const noteQuery = admin.from("notes").select("id,title,body,created_at,organization_id").eq("user_id", userId).in("id", noteIds.length ? noteIds : [crypto.randomUUID()]);
  const receiptQuery = admin.from("audit_log").select("id,event,entity_type,entity_id,payload,created_at,organization_id").eq("user_id", userId).in("id", receiptIds.length ? receiptIds : [crypto.randomUUID()]);
  if (organizationId) {
    noteQuery.eq("organization_id", organizationId);
    receiptQuery.eq("organization_id", organizationId);
  } else {
    noteQuery.is("organization_id", null);
    receiptQuery.is("organization_id", null);
  }
  const [{ data: notes }, { data: receipts }] = await Promise.all([noteQuery, receiptQuery]);
  if ((notes ?? []).length !== noteIds.length || (receipts ?? []).length !== receiptIds.length) {
    throw Object.assign(new Error("One or more evidence sources are unavailable in this room."), { status: 403 });
  }
  const byNote = new Map((notes ?? []).map((row: any) => [row.id, row]));
  const byReceipt = new Map((receipts ?? []).map((row: any) => [row.id, row]));
  const blocks: string[] = [];
  const validated: Array<Record<string, string>> = [];
  let chars = 0;
  let truncated = false;
  let noteNo = 0;
  let receiptNo = 0;
  for (const ref of refs) {
    const row = ref.kind === "note" ? byNote.get(ref.id) : byReceipt.get(ref.id);
    if (!row) continue;
    const marker = ref.kind === "note" ? `N${++noteNo}` : `R${++receiptNo}`;
    const label = ref.kind === "note" ? String(row.title || "Untitled note") : String(row.event).replace(/[._]/g, " ");
    const raw = ref.kind === "note"
      ? String(row.body ?? "")
      : JSON.stringify({ event: row.event, entity_type: row.entity_type, entity_id: row.entity_id, created_at: row.created_at, payload: row.payload ?? {} });
    const remaining = Math.max(0, 48_000 - chars);
    const excerpt = raw.slice(0, Math.min(remaining, ref.kind === "note" ? 14_000 : 4_000));
    if (excerpt.length < raw.length) truncated = true;
    chars += excerpt.length;
    blocks.push(`[${marker}] ${label}\nRecorded: ${row.created_at}\n${excerpt || "[no readable text]"}`);
    validated.push({ kind: ref.kind, id: ref.id, label, recordedAt: row.created_at, marker });
    if (chars >= 48_000) { truncated = true; break; }
  }
  if (truncated) blocks.push("[SOURCE LIMIT] Some selected source text was truncated. Do not infer what was omitted.");
  return { text: blocks.join("\n\n---\n\n"), refs: validated, truncated };
}

async function publishDraftReady(admin: any, input: {
  userId: string; organizationId: string | null; documentId: string; title: string; versionNo: number;
}): Promise<void> {
  const dedupe = `document_draft_ready:${input.documentId}:v${input.versionNo}`;
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: nudge, error } = await admin.from("nudges").upsert({
    user_id: input.userId,
    organization_id: input.organizationId,
    kind: "document_draft_ready",
    title: `${input.title} is ready to review`,
    body: "Open the grounded draft. Nothing has been approved, sent, or shared.",
    related_entity_type: "document",
    related_entity_id: input.documentId,
    priority: 72,
    status: "pending",
    dedupe_key: dedupe,
    expires_at: expiresAt,
  }, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true }).select("id").maybeSingle();
  if (error) throw error;

  const base = (Deno.env.get("VANTA_PUBLIC_URL") ?? "https://metroecho.lovable.app").replace(/\/$/, "");
  const url = `${base}/documents?document=${input.documentId}&ack=telegram`;
  const deliveryKey = `nudge:${dedupe}`;

  /* The ladder decides whether a ready draft may interrupt. It is important —
     the person asked for it — so it buzzes unless their documents floor says
     Today or digest. A hold is never silence: Today already carries the nudge. */
  const gate = await floorGate(admin, {
    userId: input.userId,
    organizationId: input.organizationId,
    urgency: "time_sensitive",
    entityType: "document",
    entityId: input.documentId,
    source: "documents_draft",
  });
  if (gate.channel !== "push") return;

  const claim = (surface: "phone" | "messaging", because: string) => claimDelivery(admin, {
    userId: input.userId,
    organizationId: input.organizationId,
    situationKind: "nudge.document_draft_ready",
    situationId: input.documentId,
    dedupeKey: deliveryKey,
    surface,
    urgency: "time_sensitive",
    headline: `${input.title} is ready to review`,
    because,
  });

  /* Phone first when a device is registered. The deep link carries the ack, so
     opening the draft from the notification settles the same nudge Today reads.
     Telegram is the fallback, never a second buzz for the same draft. */
  if (await hasPushDevice(admin, input.userId)) {
    const claimId = await claim("phone", "a draft the person asked for is ready and a device is registered");
    if (!claimId) return;
    const pushed = await reachPhone(admin, {
      userId: input.userId,
      organizationId: input.organizationId,
      title: `${input.title} is ready to review`,
      detail: "Drafted from the notes and receipts you selected. Nothing was approved or sent.",
      url: `${url}&mode=review`,
      changeKey: dedupe,
      urgency: "time_sensitive",
      entityType: "document",
      entityId: input.documentId,
      source: "documents_draft",
      gateApplied: true,
    });
    if (pushed) return;
    await admin.from("deliveries")
      .update({ status: "failed", failure: "No device accepted the notification." })
      .eq("id", claimId);
  }

  const claimedId = await claim("messaging", "the person asked for draft-ready Telegram links");
  if (!claimedId) return; // Existing claim means this version already spoke.
  const claimedDelivery = { id: claimedId };
  const chatId = await chatIdForUser(admin, input.userId);
  if (!chatId) {
    await admin.from("deliveries").update({ status: "failed", failure: "Telegram is not linked." }).eq("id", claimedDelivery.id);
    return;
  }
  const result = await sendTelegram({
    admin,
    userId: input.userId,
    organizationId: input.organizationId,
    chatId,
    text: `${input.title} is ready to review.\n\nIt was drafted from the notes and receipts you selected. Nothing was approved, sent, or shared.`,
    replyMarkup: { inline_keyboard: [[
      { text: "Review", url: `${url}&mode=review` },
      { text: "Open in Work", url },
    ]] },
    kind: "notice",
    entityType: "document",
    entityId: input.documentId,
    auditEvent: "document.draft_reached_telegram",
    auditFailedEvent: "document.draft_telegram_failed",
    auditPayload: { nudge_id: nudge?.id ?? null, dedupe_key: dedupe },
  });
  if (!result.ok) await admin.from("deliveries").update({ status: "failed", failure: result.reason }).eq("id", claimedDelivery.id);
}
