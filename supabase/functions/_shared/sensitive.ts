// Edge-function mirror of src/lib/sherlock/sensitive.ts. Pure heuristics.
export type SensitiveCategory =
  | "financial" | "medical" | "legal" | "id" | "payment_proof" | "security_alert";

const PATTERNS: Array<{ category: SensitiveCategory; re: RegExp }> = [
  { category: "financial", re: /\b(iban|swift|bic|routing\s*number|account\s*number|sort\s*code|salary|payslip|invoice|tax\s*id|vat\s*id)\b/i },
  { category: "financial", re: /\b(bank\s*statement|wire\s*transfer|balance\s*\$|net\s*worth)\b/i },
  { category: "medical", re: /\b(diagnos[ie]s|prescription|prescribed|mg\/?day|dosage|hiv|cancer|biopsy|mri|x-?ray|lab\s*results?|patient|symptoms)\b/i },
  { category: "legal", re: /\b(nda|non-?disclosure|subpoena|settlement|plaintiff|defendant|court\s*order|legal\s*counsel|attorney[-\s]client)\b/i },
  { category: "id", re: /\b(passport|driver'?s?\s*licen[cs]e|national\s*id|ssn|social\s*security)\b/i },
  { category: "id", re: /\b\d{3}-\d{2}-\d{4}\b/ },
  { category: "payment_proof", re: /\b(receipt|paid\s*\$|amount\s*due|cvv|expir(y|es)\s*\d{2}\/\d{2})\b/i },
  { category: "payment_proof", re: /\b(?:\d[ -]*?){13,19}\b/ },
  { category: "security_alert", re: /\b(2fa|two[-\s]factor|otp|verification\s*code|password\s*reset|suspicious\s*login|unauthori[sz]ed\s*access)\b/i },
];

export function detectSensitive(text: string | null | undefined) {
  const t = (text ?? "").slice(0, 8000);
  if (!t.trim()) return { sensitive: false, categories: [] as SensitiveCategory[] };
  const cats = new Set<SensitiveCategory>();
  for (const { category, re } of PATTERNS) {
    if (re.test(t)) cats.add(category);
  }
  return { sensitive: cats.size > 0, categories: [...cats] };
}
