// Static integration registry. Source of truth for the Integrations settings page.
// No backend behavior; just metadata + per-platform doctrine.

import type { SystemControls } from "@/hooks/useSystemControls";

export type IntegrationStatus =
  | "live"
  | "partial"
  | "configured"
  | "needs_setup"
  | "planned"
  | "deferred"
  | "disabled"
  | "blocked";

export type Direction =
  | "inbound"
  | "outbound"
  | "inbound_approved_outbound"
  | "read_only"
  | "capture_only"
  | "deferred";

export type EventDef = {
  platform: string;
  name: string;
  direction: "inbound" | "outbound";
  status: IntegrationStatus;
  description: string;
  creates: string; // what it becomes in Vanta
  requiresApproval: boolean;
  sensitive: boolean;
};

export type CallbackDef = {
  platform: string;
  name: string;
  status: IntegrationStatus;
  description: string;
  requiresApproval: boolean;
  risk: "low" | "medium" | "high";
  apiKeyRequired: boolean;
};

export type IntegrationDef = {
  key: string;
  name: string;
  role: string;
  description: string;
  direction: Direction;
  // backing system_controls flag if any
  killSwitchKey?: keyof SystemControls;
  // edge function name if any
  webhookFunction?: string;
  // audit_log event prefix for diagnostics
  auditPrefix?: string;
  // human-readable bucket for layout grouping
  bucket: "connected" | "planned" | "deferred";
  // approval rule line
  approvalRule: string;
  inboundEvents: string[];
  outboundCallbacks: string[];
  setupChecklist: string[];
  expectedSecrets: string[];
  // role gates (display only)
  roles?: string[];
};

export const INTEGRATIONS: IntegrationDef[] = [
  {
    key: "vanta_core",
    name: "Vanta Core",
    role: "The inbox, the drafts, the approval surface.",
    description: "This is where signals land, become drafts, and wait for you.",
    direction: "inbound_approved_outbound",
    bucket: "connected",
    approvalRule: "Everything stops here until you tap approve.",
    inboundEvents: [],
    outboundCallbacks: [],
    setupChecklist: ["Already running."],
    expectedSecrets: [],
  },
  {
    key: "telegram",
    name: "Telegram",
    role: "Capture + approved delivery channel.",
    description: "Telegram sends messages, files, and voice notes into Vanta. Vanta sends approved reminders back.",
    direction: "inbound_approved_outbound",
    webhookFunction: "telegram-webhook",
    auditPrefix: "telegram.",
    bucket: "connected",
    approvalRule: "Captures land in the Inbox. Reminders only deliver if you approved them.",
    inboundEvents: [
      "message.received",
      "file.received",
      "voice_note.received",
      "reminder_callback.done",
      "reminder_callback.snooze",
      "reminder_callback.open",
    ],
    outboundCallbacks: ["reminder.send", "reminder.done_confirm", "reminder.snooze_confirm", "capture_confirm"],
    setupChecklist: [
      "Bot token configured.",
      "Webhook connected.",
      "Chat linked from Settings.",
      "Send a test capture.",
      "Confirm a reminder delivery.",
    ],
    expectedSecrets: ["TELEGRAM_API_KEY"],
  },
  {
    key: "email",
    name: "Email",
    role: "Inbound capture from your inbox.",
    description: "Forwarded email and attachments land as captures.",
    direction: "inbound",
    webhookFunction: "email-inbound",
    auditPrefix: "email.",
    bucket: "connected",
    approvalRule: "Email feeds the Inbox. Nothing replies without approval.",
    inboundEvents: [
      "email.received",
      "attachment.received",
      "receipt.detected",
      "booking_email.detected",
      "invoice.detected",
    ],
    outboundCallbacks: ["digest.send", "reply.draft"],
    setupChecklist: [
      "Inbound email address provisioned.",
      "Forward or alias set up at your mail provider.",
      "Send a test email.",
    ],
    expectedSecrets: [],
  },
  {
    key: "gth",
    name: "Ground Truth Hub",
    role: "Property and hotel operations.",
    description: "Bookings, guest requests, room notes, payments, accommodation files.",
    direction: "inbound_approved_outbound",
    killSwitchKey: "gth_enabled",
    webhookFunction: "gth-inbound",
    auditPrefix: "ecosystem.gth.",
    bucket: "planned",
    approvalRule: "Inbound signals become drafts. Outbound to GTH requires approval. No silent guest replies.",
    inboundEvents: [
      "booking.created",
      "booking.updated",
      "guest_request.created",
      "guest_message.received",
      "room_issue.created",
      "payment.received",
      "payment.failed",
      "room_note.created",
      "accommodation_file.added",
      "maintenance_request.created",
    ],
    outboundCallbacks: [
      "create_guest_reply",
      "update_booking_note",
      "mark_request_reviewed",
      "create_maintenance_ticket",
      "link_file_to_booking",
      "mark_payment_reviewed",
    ],
    setupChecklist: [
      "Copy the Vanta webhook URL.",
      "Add or generate GTH_WEBHOOK_SECRET here.",
      "Use the same secret in GTH's outbound webhook settings.",
      "Pick allowed event types on the GTH side.",
      "Enable GTH source here.",
      "Send a test event.",
      "Confirm it lands in the Inbox.",
    ],
    expectedSecrets: ["GTH_WEBHOOK_SECRET"],
    roles: ["Staff: view assigned drafts", "Manager (Nikki): approve guest/property ops", "Owner: configure + kill switch"],
  },
  {
    key: "campcore",
    name: "CampCore",
    role: "Gym operations.",
    description: "Members, coaches, schedules, waivers, payments. Role-gated by design.",
    direction: "inbound_approved_outbound",
    killSwitchKey: "campcore_enabled",
    auditPrefix: "ecosystem.campcore.",
    bucket: "planned",
    approvalRule: "Members can ask. Coaches read. Managers approve. Nothing books or charges from chat.",
    inboundEvents: [
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
    outboundCallbacks: [
      "approve_reschedule",
      "create_member_reply",
      "update_class_booking",
      "mark_waiver_reviewed",
      "link_file_to_member",
      "create_coach_note",
    ],
    setupChecklist: [
      "Copy the Vanta webhook URL (when adapter ships).",
      "Add or generate CAMPCORE_WEBHOOK_SECRET here.",
      "Use the same secret in CampCore's outbound webhook settings.",
      "Define the role map.",
      "Pick allowed events.",
      "Enable CampCore source here.",
      "Send a test event.",
    ],
    expectedSecrets: ["CAMPCORE_WEBHOOK_SECRET"],
    roles: [
      "Members: ask only",
      "Coaches: read assigned context",
      "Managers: approve schedule/payment/waiver changes",
      "Owner: configure + kill switch",
    ],
  },
  {
    key: "calendar",
    name: "Calendar",
    role: "Read-only schedule context.",
    description: "Calendar events become briefing context and drafts. No write-back until you approve.",
    direction: "read_only",
    killSwitchKey: "calendar_sync_enabled",
    auditPrefix: "calendar.",
    bucket: "planned",
    approvalRule: "Read-only first. Write-back only after explicit approval per event.",
    inboundEvents: [
      "event.detected",
      "event.updated",
      "event.cancelled",
      "event.reminder_needed",
      "calendar_conflict.detected",
    ],
    outboundCallbacks: ["create_calendar_event", "update_calendar_event"],
    setupChecklist: [
      "Pick a calendar provider.",
      "Sign in (read scope only).",
      "Write permission stays off by default.",
      "Confirm timezone is set on your profile.",
    ],
    expectedSecrets: [],
  },
  {
    key: "fenrir",
    name: "Fenrir Lock",
    role: "Security signals.",
    description: "Security alerts land as high-priority captures. Sensitive by default.",
    direction: "inbound",
    killSwitchKey: "fenrir_enabled",
    auditPrefix: "ecosystem.fenrir.",
    bucket: "planned",
    approvalRule: "Security signals never auto-respond. You review, you decide.",
    inboundEvents: [
      "security_event.detected",
      "login_anomaly.detected",
      "suspicious_activity.detected",
      "lock_event.created",
      "device_event.created",
    ],
    outboundCallbacks: ["create_review_task", "mark_event_reviewed", "notify_owner"],
    setupChecklist: [
      "Copy the Vanta webhook URL (when adapter ships).",
      "Add or generate FENRIR_WEBHOOK_SECRET here.",
      "Use the same secret in Fenrir's outbound webhook settings.",
      "Map severity levels.",
      "Enable source here.",
    ],
    expectedSecrets: ["FENRIR_WEBHOOK_SECRET"],
  },
  {
    key: "website_forms",
    name: "Website / Public Forms",
    role: "Public capture.",
    description: "Contact forms, intake, support requests, lead forms feed the Inbox.",
    direction: "inbound",
    auditPrefix: "website.",
    bucket: "planned",
    approvalRule: "Forms feed the Inbox. No auto-replies. You draft, you send.",
    inboundEvents: [
      "contact_form.submitted",
      "support_request.created",
      "lead.created",
      "file_uploaded",
      "feedback.received",
    ],
    outboundCallbacks: ["draft_reply", "mark_reviewed", "create_followup"],
    setupChecklist: [
      "Pick form endpoint (when adapter ships).",
      "Add or generate WEBSITE_FORMS_SECRET here.",
      "Use the same secret in the form sender.",
      "Pick allowed form types.",
    ],
    expectedSecrets: ["WEBSITE_FORMS_SECRET"],
  },
  {
    key: "whatsapp",
    name: "WhatsApp",
    role: "Future capture channel.",
    description: "Where real life happens. Comes after Telegram is rock solid on Vanta, GTH, and CampCore.",
    direction: "deferred",
    bucket: "deferred",
    approvalRule: "Deferred. When built, WhatsApp captures only. No booking, payment, or schedule changes from chat.",
    inboundEvents: ["message.received", "file.received", "voice_note.received"],
    outboundCallbacks: ["reminder.send"],
    setupChecklist: [
      "Do not connect yet.",
      "Telegram must prove out on all three platforms first.",
    ],
    expectedSecrets: ["WHATSAPP_PROVIDER_TOKEN", "WHATSAPP_WEBHOOK_VERIFY_TOKEN"],
  },
];

export const ALL_EVENTS: EventDef[] = INTEGRATIONS.flatMap((i) =>
  i.inboundEvents.map<EventDef>((name) => ({
    platform: i.name,
    name,
    direction: "inbound",
    status: i.bucket === "connected" ? "live" : i.bucket === "deferred" ? "deferred" : "planned",
    description: `${i.name} → ${name}`,
    creates: "Inbox draft",
    requiresApproval: true,
    sensitive: /payment|waiver|injury|security|anomaly|guest_message/.test(name),
  })),
);

export const ALL_CALLBACKS: CallbackDef[] = INTEGRATIONS.flatMap((i) =>
  i.outboundCallbacks.map<CallbackDef>((name) => ({
    platform: i.name,
    name,
    status: "planned",
    description: `${i.name} ← ${name}`,
    requiresApproval: true,
    risk: /payment|booking|calendar|guest_reply/.test(name) ? "high" : "medium",
    apiKeyRequired: true,
  })),
);
