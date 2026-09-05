// Document templates — Phase 2 drafting catalog.
// Each template defines the kind, a human-friendly label, the operator-style
// short description, and the guided field schema the New Document dialog will
// render. The fields are passed into `documents-draft`, which uses them inside
// a template-specific system prompt to produce a markdown body. Plain-English
// only — no jurisdiction guarantees, no legal cosplay.
import type { DocumentKind } from "./documents";

export type TemplateFieldKind = "text" | "textarea" | "date" | "money" | "select";

export interface TemplateField {
  key: string;
  label: string;
  kind: TemplateFieldKind;
  placeholder?: string;
  required?: boolean;
  helper?: string;
  options?: Array<{ value: string; label: string }>;
}

export interface DocumentTemplate {
  key: string;
  documentKind: DocumentKind;
  label: string;
  shortDescription: string;
  /** Renders inside the New Document dialog above the fields. */
  longDescription: string;
  fields: TemplateField[];
  /** Used by the edge function to title the prompt and the draft. */
  promptTitle: string;
  /** Compose the body of the user message sent to the model. */
  buildUserMessage: (inputs: Record<string, string>, tone: DraftTone) => string;
}

export const DRAFT_TONES = [
  { value: "warm", label: "Warm and human" },
  { value: "formal", label: "Boardroom-formal" },
  { value: "concise", label: "Short and to the point" },
] as const;
export type DraftTone = (typeof DRAFT_TONES)[number]["value"];

function val(inputs: Record<string, string>, key: string, fallback = "[to be supplied]"): string {
  const v = inputs?.[key];
  return v && v.trim().length ? v.trim() : fallback;
}

export const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  {
    key: "nda_mutual",
    documentKind: "nda",
    label: "Mutual NDA",
    shortDescription: "Both sides protect each other's information.",
    longDescription:
      "A short, plain-English mutual NDA. Echo drafts it; you review it and decide what to do with it. It is not legal advice.",
    promptTitle: "Mutual non-disclosure agreement",
    fields: [
      { key: "party_a", label: "Your side (party A)", kind: "text", required: true, placeholder: "Acme Holdings LLC" },
      { key: "party_b", label: "Other side (party B)", kind: "text", required: true, placeholder: "Jane Doe / Other Co." },
      { key: "effective_date", label: "Effective date", kind: "date" },
      { key: "purpose", label: "Purpose of sharing", kind: "textarea", required: true, placeholder: "Exploring a partnership around X." },
      { key: "term_months", label: "Term (in months)", kind: "text", placeholder: "24" },
      { key: "governing_state", label: "Governing region", kind: "text", placeholder: "Florida, USA", helper: "Used as a label only — not a legal claim." },
    ],
    buildUserMessage: (i, tone) => `
DRAFT: Mutual NDA
Tone: ${tone}
Party A: ${val(i, "party_a")}
Party B: ${val(i, "party_b")}
Effective date: ${val(i, "effective_date", "on signature")}
Purpose: ${val(i, "purpose")}
Term: ${val(i, "term_months", "24")} months
Governing region (label only): ${val(i, "governing_state", "to be supplied")}
Produce a plain-English mutual NDA with sections: Parties, Effective Date, Purpose, Confidential Information, Permitted Use, Exclusions, Term, Return of Materials, No Warranty, Signature block. Add a short closing note that this draft is for review and is not legal advice.`,
  },
  {
    key: "sow_simple",
    documentKind: "sow",
    label: "Simple Statement of Work",
    shortDescription: "Scope, deliverables, fee, timeline.",
    longDescription:
      "A short SOW between you and a client (or vendor). Plain English, tight scope, money terms, and timelines.",
    promptTitle: "Statement of work",
    fields: [
      { key: "client", label: "Client", kind: "text", required: true },
      { key: "provider", label: "Provider (your side)", kind: "text", required: true },
      { key: "project_name", label: "Project name", kind: "text", required: true },
      { key: "scope", label: "Scope summary", kind: "textarea", required: true, placeholder: "What you're delivering. One short paragraph." },
      { key: "deliverables", label: "Deliverables (one per line)", kind: "textarea", required: true },
      { key: "start_date", label: "Start date", kind: "date" },
      { key: "end_date", label: "Target completion", kind: "date" },
      { key: "fee", label: "Total fee", kind: "money", placeholder: "$10,000" },
      { key: "payment_terms", label: "Payment terms", kind: "textarea", placeholder: "50% on signature, 50% on delivery." },
    ],
    buildUserMessage: (i, tone) => `
DRAFT: Statement of Work
Tone: ${tone}
Client: ${val(i, "client")}
Provider: ${val(i, "provider")}
Project: ${val(i, "project_name")}
Scope: ${val(i, "scope")}
Deliverables:
${val(i, "deliverables")}
Start: ${val(i, "start_date", "on signature")}
End: ${val(i, "end_date", "to be confirmed")}
Fee: ${val(i, "fee", "to be confirmed")}
Payment terms: ${val(i, "payment_terms", "to be agreed")}
Produce a plain-English SOW with sections: Parties, Project Overview, Scope of Work, Deliverables (bulleted), Timeline, Fee, Payment Terms, Acceptance, Change Requests, Signatures. Keep it tight and concrete.`,
  },
  {
    key: "service_agreement",
    documentKind: "service",
    label: "Service agreement",
    shortDescription: "Ongoing services, retainer or hourly.",
    longDescription:
      "A short ongoing services agreement — scope, fees, term, termination, and confidentiality. Plain English.",
    promptTitle: "Service agreement",
    fields: [
      { key: "client", label: "Client", kind: "text", required: true },
      { key: "provider", label: "Provider", kind: "text", required: true },
      { key: "services", label: "Services provided", kind: "textarea", required: true },
      { key: "fee_model", label: "Fee model", kind: "select", required: true,
        options: [
          { value: "retainer", label: "Monthly retainer" },
          { value: "hourly", label: "Hourly" },
          { value: "project", label: "Per project" },
        ] },
      { key: "fee_amount", label: "Fee amount", kind: "money", placeholder: "$2,500 / month" },
      { key: "term_months", label: "Initial term (months)", kind: "text", placeholder: "6" },
      { key: "notice_days", label: "Termination notice (days)", kind: "text", placeholder: "30" },
    ],
    buildUserMessage: (i, tone) => `
DRAFT: Service Agreement
Tone: ${tone}
Client: ${val(i, "client")}
Provider: ${val(i, "provider")}
Services: ${val(i, "services")}
Fee model: ${val(i, "fee_model", "retainer")}
Fee amount: ${val(i, "fee_amount", "to be confirmed")}
Initial term: ${val(i, "term_months", "6")} months
Termination notice: ${val(i, "notice_days", "30")} days
Produce a plain-English service agreement: Parties, Services, Fees & Payment, Term & Renewal, Termination, Confidentiality, Ownership, Limitation of Liability, Signatures. Keep it short and operator-friendly.`,
  },
  {
    key: "payment_agreement",
    documentKind: "other",
    label: "Payment agreement",
    shortDescription: "Who pays whom, how much, when.",
    longDescription:
      "A short payment agreement: party, amount, schedule, late terms, and signature.",
    promptTitle: "Payment agreement",
    fields: [
      { key: "payer", label: "Payer", kind: "text", required: true },
      { key: "payee", label: "Payee", kind: "text", required: true },
      { key: "total", label: "Total amount", kind: "money", required: true, placeholder: "$5,000" },
      { key: "schedule", label: "Schedule", kind: "textarea", required: true, placeholder: "$1,000 on the 1st of each month, starting Jan 1." },
      { key: "late_terms", label: "Late terms", kind: "textarea", placeholder: "1.5% per month after 10 days." },
    ],
    buildUserMessage: (i, tone) => `
DRAFT: Payment Agreement
Tone: ${tone}
Payer: ${val(i, "payer")}
Payee: ${val(i, "payee")}
Total: ${val(i, "total")}
Schedule: ${val(i, "schedule")}
Late terms: ${val(i, "late_terms", "none specified")}
Produce a plain-English payment agreement: Parties, Total Owed, Payment Schedule, Late Fees, Default, Right to Set Off, Signatures.`,
  },
  {
    key: "letter_general",
    documentKind: "letter",
    label: "Business letter",
    shortDescription: "Short, professional letter.",
    longDescription:
      "A short business letter — intro, body, ask, sign-off. Drafted in your chosen voice.",
    promptTitle: "Business letter",
    fields: [
      { key: "sender", label: "From", kind: "text", required: true },
      { key: "recipient", label: "To", kind: "text", required: true },
      { key: "subject", label: "Subject", kind: "text", required: true },
      { key: "intent", label: "What you're trying to say", kind: "textarea", required: true, placeholder: "We're proposing X because Y…" },
      { key: "ask", label: "What you're asking for", kind: "textarea", placeholder: "A reply by next Friday." },
    ],
    buildUserMessage: (i, tone) => `
DRAFT: Business letter
Tone: ${tone}
From: ${val(i, "sender")}
To: ${val(i, "recipient")}
Subject: ${val(i, "subject")}
Intent: ${val(i, "intent")}
Ask: ${val(i, "ask", "none specified")}
Produce a short, well-formatted business letter (Markdown). Greeting, 2–4 short paragraphs, clear ask, sign-off block. No legalese.`,
  },
];

export function getTemplate(key: string | null | undefined): DocumentTemplate | undefined {
  if (!key) return undefined;
  return DOCUMENT_TEMPLATES.find((t) => t.key === key);
}
