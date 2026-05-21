// Sherlock 3F — sensitive content heuristics.
// Pure functions only. Used both client-side (mark/preview) and mirrored in
// edge functions via supabase/functions/_shared/sensitive.ts.
// Doctrine: false positives are fine. We err on caution.

export type SensitiveCategory =
  | "financial"
  | "medical"
  | "legal"
  | "id"
  | "payment_proof"
  | "security_alert";

const PATTERNS: Array<{ category: SensitiveCategory; re: RegExp }> = [
  // financial
  { category: "financial", re: /\b(iban|swift|bic|routing\s*number|account\s*number|sort\s*code|salary|payslip|invoice|tax\s*id|vat\s*id)\b/i },
  { category: "financial", re: /\b(bank\s*statement|wire\s*transfer|balance\s*\$|net\s*worth)\b/i },
  // medical
  { category: "medical", re: /\b(diagnos[ie]s|prescription|prescribed|mg\/?day|dosage|hiv|cancer|biopsy|mri|x-?ray|lab\s*results?|patient|symptoms)\b/i },
  // legal
  { category: "legal", re: /\b(nda|non-?disclosure|subpoena|settlement|plaintiff|defendant|court\s*order|legal\s*counsel|attorney[-\s]client)\b/i },
  // ID-like
  { category: "id", re: /\b(passport|driver'?s?\s*licen[cs]e|national\s*id|ssn|social\s*security)\b/i },
  { category: "id", re: /\b\d{3}-\d{2}-\d{4}\b/ }, // SSN-ish
  // payment proof
  { category: "payment_proof", re: /\b(receipt|paid\s*\$|amount\s*due|cvv|expir(y|es)\s*\d{2}\/\d{2})\b/i },
  { category: "payment_proof", re: /\b(?:\d[ -]*?){13,19}\b/ }, // card-number-ish
  // security alerts
  { category: "security_alert", re: /\b(2fa|two[-\s]factor|otp|verification\s*code|password\s*reset|suspicious\s*login|unauthori[sz]ed\s*access)\b/i },
];

export interface SensitiveResult {
  sensitive: boolean;
  categories: SensitiveCategory[];
  matches: string[];
}

export function detectSensitive(text: string | null | undefined): SensitiveResult {
  const t = (text ?? "").slice(0, 8000);
  if (!t.trim()) return { sensitive: false, categories: [], matches: [] };
  const cats = new Set<SensitiveCategory>();
  const matches: string[] = [];
  for (const { category, re } of PATTERNS) {
    const m = t.match(re);
    if (m) {
      cats.add(category);
      matches.push(m[0]);
    }
  }
  return { sensitive: cats.size > 0, categories: [...cats], matches };
}

export const SENSITIVE_LABEL: Record<SensitiveCategory, string> = {
  financial: "Financial",
  medical: "Medical",
  legal: "Legal",
  id: "Identity",
  payment_proof: "Payment",
  security_alert: "Security",
};
