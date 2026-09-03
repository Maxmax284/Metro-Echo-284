// crossref-run — reads several sources once, pulls claims with provenance,
// resolves records, and builds the cross-reference matrix.
//
// The model only reads paper and names fields. Matching, arithmetic and
// authority all run in _shared/crossref.ts. Nothing here executes anything.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, jsonResponse, preflight, readJson } from "../_shared/http.ts";
import { resolveScopeContext, serverScopeFields } from "../_shared/authContext.ts";
import { chatText, MODELS, parseJsonBlock } from "../_shared/aiGateway.ts";
import { ocrImage } from "../_shared/pageRead.ts";
import { writeAuditEvent } from "../_shared/auditEvent.ts";
import {
  buildMatrix, differencesFor, inferOutputShape, inferSourceRole, isSensitiveField,
  normalizeField, resolveRecords, type Certainty, type ClaimLike,
} from "../_shared/crossref.ts";

const EXTRACT_SYSTEM = `You read one source document and report what is written on it. Nothing else.

Rules that cannot be broken:
- Never invent a value. If a value is smudged, cut off, or you are not sure, set certainty "uncertain" and put what you can make out in value, or null.
- Keep the wording as written. Do not tidy names, do not convert units.
- One record per person, item, line or entry on the page. Give each a label as written.
- Field names: short snake_case, e.g. name, age, height, weight, gym, corner, date, amount, reference, status.
- Do not calculate anything. No totals, no differences.

Return strict JSON only:
{"doc_label":"short human label for this source",
 "records":[{"label":"as written","fields":[{"field":"weight","value":"62 kg","certainty":"verified"}]}]}`;

type Extracted = {
  doc_label?: string;
  records?: Array<{ label?: string; fields?: Array<{ field?: string; value?: string | null; certainty?: string }> }>;
};

function certaintyOf(raw: unknown): Certainty {
  return raw === "uncertain" ? "uncertain" : raw === "inferred" ? "inferred" : "verified";
}

async function textForSource(admin: any, file: any): Promise<{ text: string; ok: boolean; error?: string }> {
  if (file.extracted_text && String(file.extracted_text).trim().length > 20) {
    return { text: String(file.extracted_text), ok: true };
  }
  if (!file.storage_path) return { text: "", ok: false, error: "The file never finished uploading." };
  const { data: blob, error } = await admin.storage.from("memory-uploads").download(file.storage_path);
  if (error || !blob) return { text: "", ok: false, error: error?.message ?? "The file could not be opened." };
  const mime = String(file.mime_type ?? "").toLowerCase();
  if (mime.startsWith("image/") || /\.(png|jpe?g|webp|heic|heif)$/i.test(file.filename ?? "")) {
    try {
      const text = await ocrImage(blob, mime || "image/png");
      if (text) await admin.from("ingested_files").update({ extracted_text: text }).eq("id", file.id);
      return { text, ok: Boolean(text), error: text ? undefined : "Vanta could not make out any text on this page." };
    } catch (e) {
      return { text: "", ok: false, error: e instanceof Error ? e.message : "reading failed" };
    }
  }
  if (mime.startsWith("text/") || /\.(txt|md|csv)$/i.test(file.filename ?? "")) {
    const text = await blob.text();
    if (text) await admin.from("ingested_files").update({ extracted_text: text.slice(0, 200_000) }).eq("id", file.id);
    return { text: text.slice(0, 200_000), ok: Boolean(text.trim()) };
  }
  return { text: "", ok: false, error: "Vanta cannot read this file type yet." };
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authed = createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const admin = createClient(url, service);

  try {
    const body = (await readJson(req)) as Record<string, any> | null;
    if (!body) return jsonResponse({ error: "bad request" }, 400);

    const ctx = await resolveScopeContext(req, authed as any, body.organization_id ?? null);
    if (!ctx) return jsonResponse({ error: "unauthorized" }, 401);

    const fileIds: string[] = Array.isArray(body.ingested_file_ids)
      ? body.ingested_file_ids.filter((x: unknown) => typeof x === "string").slice(0, 12)
      : [];
    const request = String(body.request ?? "").slice(0, 2000);

    let caseId: string | null = typeof body.case_id === "string" ? body.case_id : null;

    if (!caseId) {
      if (fileIds.length < 2) return jsonResponse({ error: "Cross-reference needs at least two sources." }, 400);
      const { data: created, error } = await admin.from("cross_ref_cases").insert({
        user_id: ctx.userId,
        ...serverScopeFields(ctx.scope),
        title: String(body.title ?? "Cross-reference").slice(0, 120),
        purpose: request || null,
        thread_id: typeof body.thread_id === "string" ? body.thread_id : null,
        output_shape: inferOutputShape(request),
        status: "reading",
      }).select("id").single();
      if (error || !created) return jsonResponse({ error: error?.message ?? "case insert failed" }, 500);
      caseId = created.id;
    } else {
      await admin.from("cross_ref_cases").update({ status: "reading" }).eq("id", caseId).eq("user_id", ctx.userId);
    }

    // Register any newly supplied sources. Files already on the case are reused.
    if (fileIds.length) {
      const { data: files } = await admin
        .from("ingested_files").select("*").in("id", fileIds).eq("user_id", ctx.userId);
      const { data: existing } = await admin
        .from("case_sources").select("ingested_file_id").eq("case_id", caseId);
      const have = new Set((existing ?? []).map((r: any) => r.ingested_file_id));
      const rows = (files ?? []).filter((f: any) => !have.has(f.id)).map((f: any) => {
        const guess = inferSourceRole(f);
        return {
          case_id: caseId,
          user_id: ctx.userId,
          ingested_file_id: f.id,
          filename: f.filename,
          mime_type: f.mime_type,
          role: guess.role,
          authority_rank: guess.rank,
          page_count: 1,
        };
      });
      if (rows.length) await admin.from("case_sources").insert(rows);
    }

    const { data: sources } = await admin
      .from("case_sources").select("*").eq("case_id", caseId).order("created_at", { ascending: true });
    if (!sources || sources.length < 2) {
      return jsonResponse({ error: "Cross-reference needs at least two sources." }, 400);
    }

    // Read each source once, then claim-extract only the ones not read yet.
    const rawLabels: Array<{ label: string; source_id: string | null }> = [];
    const perSource: Array<{ source_id: string; records: Extracted["records"] }> = [];

    for (const src of sources) {
      let text = src.extracted_text as string | null;
      if (src.extraction_status !== "read" || !text) {
        const { data: file } = await admin
          .from("ingested_files").select("*").eq("id", src.ingested_file_id).maybeSingle();
        if (!file) {
          await admin.from("case_sources").update({ extraction_status: "unreadable", error: "The source file is gone." }).eq("id", src.id);
          continue;
        }
        const read = await textForSource(admin, file);
        if (!read.ok) {
          await admin.from("case_sources").update({ extraction_status: "unreadable", error: read.error ?? null }).eq("id", src.id);
          continue;
        }
        text = read.text;
        await admin.from("case_sources").update({ extraction_status: "read", extracted_text: text.slice(0, 200_000) }).eq("id", src.id);
      }

      const res = await chatText(
        [
          { role: "system", content: EXTRACT_SYSTEM },
          { role: "user", content: `SOURCE FILE: ${src.filename}\n\nCONTENT:\n${String(text).slice(0, 20_000)}` },
        ],
        { model: MODELS.fast, temperature: 0 },
      );
      if (!res.ok) {
        await admin.from("case_sources").update({ error: `reading failed (${res.status})` }).eq("id", src.id);
        continue;
      }
      const parsed = parseJsonBlock<Extracted>(res.data) ?? {};
      const records = (parsed.records ?? []).slice(0, 60);
      perSource.push({ source_id: src.id, records });
      for (const rec of records) {
        if (rec?.label) rawLabels.push({ label: String(rec.label), source_id: src.id });
      }
    }

    const records = resolveRecords(rawLabels);
    const keyForLabel = (label: string) =>
      records.find((r) => r.labels.some((l) => l === label))?.record_key ?? null;

    // Claims — every value keeps the source it came from.
    const claims: ClaimLike[] = [];
    for (const bucket of perSource) {
      for (const rec of bucket.records ?? []) {
        const key = rec?.label ? keyForLabel(String(rec.label)) : null;
        if (!key) continue;
        for (const f of rec.fields ?? []) {
          const field = normalizeField(String(f?.field ?? ""));
          if (!field) continue;
          claims.push({
            source_id: bucket.source_id,
            record_key: key,
            field,
            value_text: f?.value == null ? null : String(f.value).slice(0, 500),
            certainty: certaintyOf(f?.certainty),
            sensitive: isSensitiveField(field),
            excerpt: f?.value == null ? null : String(f.value).slice(0, 200),
          });
        }
      }
    }

    // Deterministic derived values on paired numeric fields (weight, amount…).
    for (const field of ["weight", "amount", "total"]) {
      const ordered = records
        .map((r) => ({
          record_key: r.record_key,
          value: claims.find((c) => c.record_key === r.record_key && c.field === field && c.certainty !== "uncertain")?.value_text ?? null,
        }))
        .filter((r) => r.value !== null);
      if (ordered.length >= 2) claims.push(...differencesFor(field, ordered));
    }

    // Persist: records + claims replace the previous pass for this case.
    await admin.from("case_claims").delete().eq("case_id", caseId);
    await admin.from("case_records").delete().eq("case_id", caseId);
    await admin.from("case_conflicts").delete().eq("case_id", caseId);

    if (records.length) {
      await admin.from("case_records").insert(records.map((r, i) => ({
        case_id: caseId,
        user_id: ctx.userId,
        record_key: r.record_key,
        display_label: r.display_label,
        match_confidence: r.match_confidence,
        source_ids: r.source_ids,
        position: i,
      })));
    }

    let stored: any[] = [];
    if (claims.length) {
      const { data } = await admin.from("case_claims").insert(claims.map((c) => ({
        case_id: caseId,
        user_id: ctx.userId,
        source_id: c.source_id,
        record_key: c.record_key,
        field: c.field,
        value_text: c.value_text,
        value_number: c.value_number ?? null,
        unit: c.unit ?? null,
        certainty: c.certainty,
        excerpt: c.excerpt ?? null,
        sensitive: c.sensitive ?? false,
        derived: c.derived ?? false,
      }))).select("*");
      stored = data ?? [];
    }

    const matrix = buildMatrix(
      records,
      stored.map((c) => ({ ...c, value_number: c.value_number == null ? null : Number(c.value_number) })),
      sources as any,
    );

    if (matrix.conflicts.length) {
      await admin.from("case_conflicts").insert(matrix.conflicts.slice(0, 400).map((c) => ({
        case_id: caseId,
        user_id: ctx.userId,
        record_key: c.record_key,
        field: c.field,
        kind: c.kind,
        claim_ids: c.claim_ids,
      })));
    }

    const summary =
      `${matrix.counts.records} record${matrix.counts.records === 1 ? "" : "s"} across ${sources.length} sources. ` +
      `${matrix.counts.agrees} agree, ${matrix.counts.conflicts} disagree, ` +
      `${matrix.counts.missing} missing, ${matrix.counts.unreadable} unreadable.`;

    await admin.from("cross_ref_cases").update({ status: "matrix_ready", summary }).eq("id", caseId);
    await writeAuditEvent(admin, {
      userId: ctx.userId,
      organizationId: ctx.scope.organizationId,
      entityType: "cross_ref_case",
      entityId: caseId!,
      event: "crossref.matrix_built",
      payload: { sources: sources.length, ...matrix.counts },
    });

    return jsonResponse({ ok: true, case_id: caseId, summary, counts: matrix.counts, matrix, records, sources });
  } catch (e) {
    console.error("[crossref-run]", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
