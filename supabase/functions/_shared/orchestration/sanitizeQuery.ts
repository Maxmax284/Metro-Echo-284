// Query sanitizer — the privacy boundary in front of every external provider.
//
// Private context shapes what we look for. It is never shipped verbatim:
//   private context -> sanitized public query -> external research -> private synthesis
// Anything withheld is recorded as a reason, so the audit reads honestly
// without storing the private payload itself.

export interface SanitizeContext {
  /** Private project/workspace names that must not leave the system. */
  private_names?: string[];
  /** People names that carry no retrieval value. */
  people?: string[];
  /** Extra private terms (client names, internal codenames). */
  private_terms?: string[];
}

export interface SanitizeResult {
  /** The public query, safe to send to a provider. */
  query: string;
  /** Plain-English list of what was held back. */
  withheld: string[];
  /** True when nothing usable survived and no external call should happen. */
  blocked: boolean;
}

const SECRET_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}\b/g, reason: "an API key" },
  { re: /\bBearer\s+[A-Za-z0-9._\-]{12,}\b/gi, reason: "a bearer token" },
  { re: /\bey[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/g, reason: "a token" },
  { re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, reason: "an email address" },
  { re: /\b(?:\+?\d[\d\s().-]{8,}\d)\b/g, reason: "a phone number" },
  { re: /\b(?:\d[ -]?){13,19}\b/g, reason: "a card-like number" },
  { re: /\b(?:password|passwd|secret|api[_ -]?key|token)\s*[:=]\s*\S+/gi, reason: "a credential" },
];

const MAX_QUERY = 240;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Strip private identity and secrets, keep the public facts that retrieve results. */
export function sanitizeQuery(input: string, ctx: SanitizeContext = {}): SanitizeResult {
  let out = String(input ?? "");
  const withheld: string[] = [];

  for (const { re, reason } of SECRET_PATTERNS) {
    if (re.test(out)) {
      out = out.replace(re, " ");
      if (!withheld.includes(reason)) withheld.push(reason);
    }
    re.lastIndex = 0;
  }

  const drop: Array<{ terms: string[]; reason: string }> = [
    { terms: ctx.private_names ?? [], reason: "a private project name" },
    { terms: ctx.people ?? [], reason: "a person's name" },
    { terms: ctx.private_terms ?? [], reason: "a private detail" },
  ];
  for (const group of drop) {
    for (const term of group.terms) {
      const t = String(term ?? "").trim();
      if (t.length < 2) continue;
      const re = new RegExp(`\\b${escapeRe(t)}\\b`, "gi");
      if (re.test(out)) {
        out = out.replace(re, " ");
        if (!withheld.includes(group.reason)) withheld.push(group.reason);
      }
    }
  }

  // Long pasted private text is not a query. Keep the head, drop the body.
  const collapsed = out.replace(/\s+/g, " ").trim();
  let query = collapsed;
  if (collapsed.length > MAX_QUERY) {
    query = collapsed.slice(0, MAX_QUERY).replace(/\s+\S*$/, "");
    withheld.push("the rest of the pasted text");
  }

  const words = query.split(" ").filter((w) => w.length > 1);
  return { query, withheld, blocked: words.length < 2 };
}

/** Metadata safe to log for a research call. Never the private payload. */
export interface SafeResearchLog {
  query: string;
  withheld: string[];
  intent: string;
  depth: string;
  provider: string;
}

export function safeResearchLog(
  result: SanitizeResult,
  meta: { intent: string; depth: string; provider: string },
): SafeResearchLog {
  return { query: result.query, withheld: result.withheld, ...meta };
}
