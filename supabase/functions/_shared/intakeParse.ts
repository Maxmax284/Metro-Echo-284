// intakeParse — one-breath document intake, the trustworthy half.
//
// The model's only job here is sorting: pick the right template and pour a
// spoken or typed brief into its fields. This module is the sieve that keeps
// the model honest — unknown templates, invented field keys, and select
// values that were never offered never reach the form. The person still
// reads everything back and taps Draft; nothing in this path executes.
//
// Pure module: no IO, no Deno globals. Tested from src/test.

export type IntakeCatalogOption = { value: string; label: string };

export type IntakeCatalogField = {
  key: string;
  label: string;
  kind: "text" | "textarea" | "date" | "money" | "select";
  required?: boolean;
  options?: IntakeCatalogOption[];
};

export type IntakeCatalogTemplate = {
  key: string;
  label: string;
  fields: IntakeCatalogField[];
};

export type IntakeParse = {
  template_key: string;
  title: string;
  tone?: "warm" | "formal" | "concise";
  inputs: Record<string, string>;
};

const TONES = new Set(["warm", "formal", "concise"]);
const TITLE_MAX = 120;
const INPUT_MAX = 2_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The tool schema the model is forced to answer with. `inputs` is a free
    string map on purpose — the field set depends on which template the model
    picks, and sanitizeIntake is what actually enforces the catalog. */
export const INTAKE_TOOL = {
  type: "function",
  function: {
    name: "sort_intake",
    description:
      "Sort one spoken or typed brief into a document template: pick the template and extract the field values that were actually stated.",
    parameters: {
      type: "object",
      properties: {
        template_key: { type: "string", description: "The key of the single best-fitting template from the catalog." },
        title: { type: "string", description: "Short internal title for the draft, from the brief." },
        tone: { type: "string", enum: ["warm", "formal", "concise"] },
        inputs: {
          type: "object",
          description: "Field key → stated value. Only keys from the chosen template's catalog. Omit anything not stated.",
          additionalProperties: { type: "string" },
        },
      },
      required: ["template_key", "inputs"],
      additionalProperties: false,
    },
  },
} as const;

/** The compact catalog handed to the model and to the sieve. Derived on the
    client from DOCUMENT_TEMPLATES so there is one source of truth. */
export function compactCatalog(
  templates: Array<{ key: string; label: string; fields: IntakeCatalogField[] }>,
): IntakeCatalogTemplate[] {
  return templates.map((t) => ({
    key: t.key,
    label: t.label,
    fields: t.fields.map((f) => ({
      key: f.key,
      label: f.label,
      kind: f.kind,
      ...(f.required ? { required: true } : {}),
      ...(f.options?.length ? { options: f.options.map((o) => ({ value: o.value, label: o.label })) } : {}),
    })),
  }));
}

function cleanText(v: unknown, max: number): string | undefined {
  if (typeof v === "number" && Number.isFinite(v)) v = String(v);
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!s) return undefined;
  return s.slice(0, max);
}

function matchSelect(raw: string, options: IntakeCatalogOption[]): string | undefined {
  const needle = raw.trim().toLowerCase();
  for (const o of options) {
    if (o.value.toLowerCase() === needle || o.label.toLowerCase() === needle) return o.value;
  }
  return undefined;
}

/**
 * Force the model's answer through the catalog. Returns null when the model
 * picked a template that does not exist — the caller then asks the person to
 * pick one themselves. Everything else is best-effort: unknown keys, bad
 * dates and unmatched select values are dropped, never guessed back in.
 */
export function sanitizeIntake(raw: unknown, catalog: IntakeCatalogTemplate[]): IntakeParse | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const templateKey = typeof obj.template_key === "string" ? obj.template_key : "";
  const template = catalog.find((t) => t.key === templateKey);
  if (!template) return null;

  const rawInputs = (obj.inputs && typeof obj.inputs === "object" ? obj.inputs : {}) as Record<string, unknown>;
  const inputs: Record<string, string> = {};
  for (const field of template.fields) {
    const text = cleanText(rawInputs[field.key], INPUT_MAX);
    if (!text) continue;
    if (field.kind === "select") {
      const matched = matchSelect(text, field.options ?? []);
      if (matched) inputs[field.key] = matched;
      continue;
    }
    if (field.kind === "date") {
      // The form renders a native date control — anything that is not a real
      // ISO date would silently blank it out, so prose dates stay out.
      if (DATE_RE.test(text)) inputs[field.key] = text;
      continue;
    }
    inputs[field.key] = text;
  }

  const title = cleanText(obj.title, TITLE_MAX) ?? "";
  const tone = typeof obj.tone === "string" && TONES.has(obj.tone)
    ? (obj.tone as IntakeParse["tone"])
    : undefined;

  return { template_key: template.key, title, ...(tone ? { tone } : {}), inputs };
}
