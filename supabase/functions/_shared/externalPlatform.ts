import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type PlatformConfig = {
  sourcePlatform: string;
  displayName: string;
  aliases: string[];
  secretName: string;
  allowedEvents: string[];
  killSwitchKey?: string;
  auditPrefix: string;
  signatureHeaders: string[];
};

export const EXTERNAL_PLATFORMS: PlatformConfig[] = [
  {
    sourcePlatform: "ground_truth_hub",
    displayName: "Ground Truth Hub",
    aliases: ["ground_truth_hub", "gth", "ground_truth", "ground-truth-hub", "GroundTruthHub"],
    secretName: "GTH_WEBHOOK_SECRET",
    allowedEvents: [
      "booking.created",
      "booking.updated",
      "booking.state_changed",
      "guest_message.received",
      "guest_request.created",
      "payment.received",
      "payment.failed",
    ],
    killSwitchKey: "gth_enabled",
    auditPrefix: "ecosystem.gth.",
    signatureHeaders: ["x-vanta-signature", "x-gth-signature", "x-webhook-signature", "x-signature"],
  },
  {
    sourcePlatform: "campcore",
    displayName: "CampCore",
    aliases: ["campcore", "camp_core", "camp-core", "CampCore"],
    secretName: "CAMPCORE_WEBHOOK_SECRET",
    allowedEvents: [
      "member_request.created",
      "schedule_change.requested",
      "class_booking.created",
      "class_booking.cancelled",
      "waiver.submitted",
      "waiver.missing",
      "payment.received",
      "payment.failed",
      "coach_note.created",
      "attendance.updated",
      "injury_note.created",
    ],
    killSwitchKey: "campcore_enabled",
    auditPrefix: "ecosystem.campcore.",
    signatureHeaders: ["x-vanta-signature", "x-campcore-signature", "x-webhook-signature", "x-signature"],
  },
  {
    sourcePlatform: "fenrir_lock",
    displayName: "Fenrir Lock",
    aliases: ["fenrir_lock", "fenrir", "fenrir-lock", "FenrirLock"],
    secretName: "FENRIR_WEBHOOK_SECRET",
    allowedEvents: [
      "security_event.detected",
      "login_anomaly.detected",
      "suspicious_activity.detected",
      "lock_event.created",
      "device_event.created",
    ],
    killSwitchKey: "fenrir_enabled",
    auditPrefix: "ecosystem.fenrir.",
    signatureHeaders: ["x-vanta-signature", "x-fenrir-signature", "x-webhook-signature", "x-signature"],
  },
  {
    sourcePlatform: "website_forms",
    displayName: "Website / Public Forms",
    aliases: ["website_forms", "website", "public_forms", "website-forms"],
    secretName: "WEBSITE_FORMS_SECRET",
    allowedEvents: [
      "contact_form.submitted",
      "support_request.created",
      "lead.created",
      "file_uploaded",
      "feedback.received",
    ],
    auditPrefix: "website.",
    signatureHeaders: ["x-vanta-signature", "x-website-forms-signature", "x-webhook-signature", "x-signature"],
  },
];

export const PLATFORM_BY_SECRET = new Map(EXTERNAL_PLATFORMS.map((p) => [p.secretName, p]));

const SOURCE_LOOKUP = new Map<string, PlatformConfig>();
for (const p of EXTERNAL_PLATFORMS) {
  SOURCE_LOOKUP.set(normalizeSourceKey(p.sourcePlatform), p);
  for (const alias of p.aliases) SOURCE_LOOKUP.set(normalizeSourceKey(alias), p);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeSourceKey(value: string): string {
  return value.trim().replace(/[\s-]+/g, "_").toLowerCase();
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256Hex(secret: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  return hex(sig);
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function fingerprintSecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return `sha256:${hex(digest).slice(0, 12)}`;
}

function getSignature(req: Request, config: PlatformConfig): { value: string; header: string } | null {
  for (const header of config.signatureHeaders) {
    const raw = req.headers.get(header);
    if (raw) return { value: raw.trim(), header };
  }
  return null;
}

function parseSignature(raw: string): string {
  return raw.replace(/^sha256=/i, "").replace(/^hmac-sha256=/i, "").replace(/^v1=/i, "").trim();
}

async function recordDiagnostic(admin: any, input: {
  ownerId: string;
  config: PlatformConfig;
  webhookConfigured: boolean;
  secretFingerprint: string | null;
  eventType?: string | null;
  idempotencyKey?: string | null;
  signatureStatus: "unknown" | "missing" | "valid" | "invalid" | "not_required";
  accepted: boolean;
  rejectionReason?: string | null;
  enabled: boolean;
}) {
  const now = new Date().toISOString();
  const { data: existing } = await admin
    .from("external_platform_webhook_diagnostics")
    .select("last_accepted_at,last_rejected_at,last_rejection_reason")
    .eq("owner_id", input.ownerId)
    .eq("source_platform", input.config.sourcePlatform)
    .maybeSingle();

  await admin.from("external_platform_webhook_diagnostics").upsert({
    owner_id: input.ownerId,
    source_platform: input.config.sourcePlatform,
    display_name: input.config.displayName,
    webhook_configured: input.webhookConfigured,
    secret_fingerprint: input.secretFingerprint,
    last_received_at: now,
    last_accepted_at: input.accepted ? now : existing?.last_accepted_at ?? null,
    last_rejected_at: input.accepted ? existing?.last_rejected_at ?? null : now,
    last_rejection_reason: input.accepted ? existing?.last_rejection_reason ?? null : input.rejectionReason ?? "unknown rejection",
    last_event_type: input.eventType ?? null,
    last_idempotency_key: input.idempotencyKey ?? null,
    signature_status: input.signatureStatus,
    enabled: input.enabled,
    last_health_status: input.accepted ? "healthy" : input.enabled ? "error" : "disabled",
    updated_at: now,
  }, { onConflict: "owner_id,source_platform" });
}

async function rejectWithDiagnostic(admin: any, input: Parameters<typeof recordDiagnostic>[1], error: string, status: number) {
  await recordDiagnostic(admin, { ...input, accepted: false, rejectionReason: error });
  return json({ ok: false, error }, status);
}

async function loadSecret(admin: any, ownerId: string, config: PlatformConfig) {
  const { data: canonical } = await admin
    .from("integration_webhook_secrets")
    .select("secret_value,integration_key")
    .eq("owner_id", ownerId)
    .eq("integration_key", config.sourcePlatform)
    .eq("secret_name", config.secretName)
    .maybeSingle();

  if (canonical?.secret_value) {
    return { value: canonical.secret_value as string, wrongSource: null as string | null };
  }

  const { data: wrongSource } = await admin
    .from("integration_webhook_secrets")
    .select("integration_key")
    .eq("owner_id", ownerId)
    .eq("secret_name", config.secretName)
    .maybeSingle();

  const envSecret = Deno.env.get(config.secretName);
  if (envSecret) return { value: envSecret, wrongSource: wrongSource?.integration_key ?? null };
  return { value: null as string | null, wrongSource: wrongSource?.integration_key ?? null };
}

function summarize(config: PlatformConfig, eventType: string, payload: Record<string, unknown>): string {
  if (config.sourcePlatform === "ground_truth_hub") {
    const guest = String(payload.guest_name ?? payload.guest ?? "guest");
    const room = payload.room ? ` · room ${String(payload.room)}` : "";
    const message = String(payload.message ?? payload.summary ?? payload.note ?? "signal received");
    if (eventType.startsWith("booking.")) return `GTH ${eventType.replace(".", " ")}: ${guest}${room}`;
    if (eventType === "guest_message.received") return `GTH guest message${room}: ${message}`;
    if (eventType === "guest_request.created") return `GTH guest request${room}: ${message}`;
    if (eventType.startsWith("payment.")) return `GTH ${eventType.replace(".", " ")}: ${String(payload.amount ?? "?")} ${String(payload.currency ?? "")}${payload.guest_name ? ` · ${guest}` : ""}`;
  }
  return `${config.displayName} ${eventType}: signal received`;
}

export async function handleExternalPlatformWebhook(req: Request, forcedSource?: string): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed; expected POST" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const raw = await req.text();
  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "malformed payload; request body must be valid JSON" }, 400);
  }

  // 1. Canonical source resolution. Reject anything that isn't a known canonical key or registered alias.
  const sourceValue = typeof body?.source_platform === "string" ? body.source_platform : forcedSource;
  if (!sourceValue) return json({ ok: false, error: "source_unknown", detail: "missing source_platform" }, 400);

  const config = SOURCE_LOOKUP.get(normalizeSourceKey(sourceValue));
  if (!config) return json({ ok: false, error: "source_unknown", detail: `unrecognized source_platform: ${sourceValue}` }, 400);
  if (forcedSource && config.sourcePlatform !== forcedSource) {
    return json({ ok: false, error: "source_unknown", detail: `source_platform mismatch; endpoint expects ${forcedSource}` }, 400);
  }

  // 2. Owner identity. Authorize against the root user_id / X-Vanta-Owner header — NEVER payload.user_id.
  const headerOwner = (req.headers.get("x-vanta-owner") ?? "").trim();
  const rootUserId = typeof body?.user_id === "string" ? body.user_id.trim() : "";
  const ownerCandidate = headerOwner || rootUserId;
  if (!ownerCandidate) {
    return json({ ok: false, error: "owner_identifier_unknown", detail: "missing X-Vanta-Owner header or root user_id" }, 400);
  }
  if (!isUuid(ownerCandidate)) {
    return json({ ok: false, error: "owner_identifier_unknown", detail: "owner identifier must be a uuid" }, 400);
  }
  if (headerOwner && rootUserId && headerOwner.toLowerCase() !== rootUserId.toLowerCase()) {
    return json({ ok: false, error: "source_owner_mismatch", detail: "X-Vanta-Owner does not match root user_id" }, 403);
  }
  const ownerId = ownerCandidate;

  const eventType = typeof body?.event_type === "string" ? body.event_type : typeof body?.event === "string" ? body.event : null;
  const idempotencyKey = String(
    body?.event_id ?? body?.idempotency_key ?? req.headers.get("x-idempotency-key") ?? req.headers.get("x-event-id") ?? "",
  ).trim();
  const payload = body?.payload;

  // Owner identifier must map to a Vanta workspace owner.
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", ownerId)
    .eq("role", "owner")
    .maybeSingle();
  if (!roleRow) {
    return json({ ok: false, error: "owner_identifier_unknown", detail: "owner identifier does not map to a Vanta workspace owner" }, 403);
  }

  const { data: controls } = await admin
    .from("system_controls")
    .select("gth_enabled,campcore_enabled,fenrir_enabled")
    .eq("owner_id", ownerId)
    .maybeSingle();
  const enabled = config.killSwitchKey ? !!controls?.[config.killSwitchKey] : true;

  // 3. Secret load. Source must be configured for THIS owner under THIS canonical key.
  const secret = await loadSecret(admin, ownerId, config);
  const secretFingerprint = secret.value ? await fingerprintSecret(secret.value) : null;
  const baseDiagnostic = {
    ownerId,
    config,
    webhookConfigured: !!secret.value,
    secretFingerprint,
    eventType,
    idempotencyKey: idempotencyKey || null,
    signatureStatus: "unknown" as const,
    accepted: false,
    enabled,
  };

  if (!eventType) return rejectWithDiagnostic(admin, baseDiagnostic, "missing required field: event_type", 400);
  if (!idempotencyKey) return rejectWithDiagnostic(admin, baseDiagnostic, "missing required field: event_id or idempotency key", 400);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return rejectWithDiagnostic(admin, baseDiagnostic, "malformed payload; payload must be an object", 400);
  }
  if (!config.allowedEvents.includes(eventType)) {
    return rejectWithDiagnostic(admin, baseDiagnostic, `unsupported event type: ${eventType}`, 400);
  }
  if (!enabled) return rejectWithDiagnostic(admin, baseDiagnostic, "source platform disabled", 403);
  if (secret.wrongSource && !secret.value) {
    return rejectWithDiagnostic(admin, baseDiagnostic, "source_owner_mismatch", 403);
  }
  if (!secret.value) {
    return rejectWithDiagnostic(admin, baseDiagnostic, "webhook_secret_missing", 401);
  }

  const timestamp = body?.timestamp ?? body?.created_at ?? req.headers.get("x-webhook-timestamp");
  if (timestamp) {
    const parsed = Date.parse(String(timestamp));
    if (Number.isNaN(parsed)) return rejectWithDiagnostic(admin, baseDiagnostic, "malformed timestamp", 400);
    if (Math.abs(Date.now() - parsed) > 24 * 60 * 60 * 1000) {
      return rejectWithDiagnostic(admin, baseDiagnostic, "stale timestamp", 400);
    }
  }

  const signature = getSignature(req, config);
  if (!signature) {
    return rejectWithDiagnostic(
      admin,
      { ...baseDiagnostic, signatureStatus: "missing" },
      `missing signature header; expected one of: ${config.signatureHeaders.join(", ")}`,
      401,
    );
  }

  const provided = parseSignature(signature.value);
  const expected = await hmacSha256Hex(secret.value, raw);
  if (!/^[a-f0-9]{64}$/i.test(provided) || !safeEqual(provided.toLowerCase(), expected.toLowerCase())) {
    return rejectWithDiagnostic(
      admin,
      { ...baseDiagnostic, signatureStatus: "invalid" },
      "signature_invalid",
      401,
    );
  }

  const { error: eventInsertErr } = await admin.from("external_platform_webhook_events").insert({
    owner_id: userId,
    source_platform: config.sourcePlatform,
    event_type: eventType,
    idempotency_key: idempotencyKey,
    signature_status: "valid",
    accepted: true,
    payload: { received_source_platform: body.source_platform ?? null },
  });
  if (eventInsertErr?.code === "23505") {
    return rejectWithDiagnostic(admin, { ...baseDiagnostic, signatureStatus: "valid" }, "duplicate idempotency key", 409);
  }
  if (eventInsertErr) {
    return rejectWithDiagnostic(admin, { ...baseDiagnostic, signatureStatus: "valid" }, `event receipt write failed: ${eventInsertErr.message}`, 500);
  }

  let convId: string | null = null;
  const { data: conv } = await admin
    .from("conversations")
    .select("id")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  convId = conv?.id ?? null;
  if (!convId) {
    const { data: newConv } = await admin
      .from("conversations")
      .insert({ user_id: userId, title: "Captures" })
      .select("id")
      .maybeSingle();
    convId = newConv?.id ?? null;
  }
  if (!convId) return rejectWithDiagnostic(admin, { ...baseDiagnostic, signatureStatus: "valid" }, "could not establish conversation", 500);

  const content = summarize(config, eventType, payload as Record<string, unknown>);
  const { data: ins, error: insErr } = await admin
    .from("messages")
    .insert({
      user_id: userId,
      conversation_id: convId,
      role: "user",
      content,
      metadata: {
        source: config.sourcePlatform,
        source_platform: config.sourcePlatform,
        event_type: eventType,
        idempotency_key: idempotencyKey,
        external_payload: payload,
        signal_only: true,
        needs_review: true,
        confidence: "low",
      },
    })
    .select("id")
    .maybeSingle();
  if (insErr || !ins?.id) {
    return rejectWithDiagnostic(admin, { ...baseDiagnostic, signatureStatus: "valid" }, `capture write failed: ${insErr?.message ?? "unknown"}`, 500);
  }

  await admin.from("capture_routes").insert({
    user_id: userId,
    capture_kind: "message",
    capture_id: ins.id,
    source: config.sourcePlatform,
    user_action: "routed",
    new_status: "inbox",
    payload: { event_type: eventType, idempotency_key: idempotencyKey, signal_only: true },
  });

  await admin.from("audit_log").insert({
    user_id: userId,
    entity_type: "capture",
    entity_id: ins.id,
    event: `${config.auditPrefix}captured`,
    payload: { source_platform: config.sourcePlatform, event_type: eventType, idempotency_key: idempotencyKey, summary: content.slice(0, 200) },
  });

  await recordDiagnostic(admin, { ...baseDiagnostic, signatureStatus: "valid", accepted: true });

  return json({ ok: true, source_platform: config.sourcePlatform, event_type: eventType, capture_id: ins.id });
}