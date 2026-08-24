// Research seam — external knowledge as a graded investigation, not a search box.
//
// One normalized source shape across every depth, so Ask never learns about
// providers. Source quality is explicit and disagreement is sayable.

import type { Confidence } from "./perception.ts";

/** What the user is actually trying to do with the outside world. */
export type ResearchIntent = "lookup" | "compare" | "verify" | "investigate" | "monitor" | "explain";

/** How much work the intent justifies. */
export type ResearchDepth = "quick" | "standard" | "deep";

/** Source families, ordered from authoritative to unknown. */
export type SourceCategory =
  | "official_docs"
  | "primary"
  | "government"
  | "academic"
  | "reporting"
  | "industry_reference"
  | "community"
  | "forum_social"
  | "unknown";

export type Authority = "authoritative" | "credible" | "anecdotal" | "unknown";
export type Freshness = "current" | "recent" | "dated" | "unknown";
export type VerificationState = "unverified" | "corroborated" | "contradicted" | "unverifiable";

/** One external result, provider-agnostic. */
export interface SourceResult {
  title: string;
  /** Display source, usually the host ("stripe.com"). */
  source: string;
  url: string;
  published_at?: string | null;
  category: SourceCategory;
  authority: Authority;
  freshness: Freshness;
  excerpt?: string | null;
  retrieved_at: string;
  query_id?: string | null;
  verification_state: VerificationState;
}

export interface RawProviderResult {
  title?: string | null;
  url?: string | null;
  snippet?: string | null;
  published_at?: string | null;
  provider?: string | null;
}

const AUTHORITY_BY_CATEGORY: Record<SourceCategory, Authority> = {
  official_docs: "authoritative",
  primary: "authoritative",
  government: "authoritative",
  academic: "credible",
  reporting: "credible",
  industry_reference: "credible",
  community: "anecdotal",
  forum_social: "anecdotal",
  unknown: "unknown",
};

const FORUM_HOSTS = ["reddit.com", "x.com", "twitter.com", "facebook.com", "quora.com", "news.ycombinator.com"];
const COMMUNITY_HOSTS = ["stackoverflow.com", "stackexchange.com", "github.com", "medium.com", "dev.to"];
const REPORTING_HOSTS = ["reuters.com", "apnews.com", "bbc.co.uk", "bbc.com", "ft.com", "nytimes.com", "theverge.com", "arstechnica.com"];
const REFERENCE_HOSTS = ["wikipedia.org", "mdn.mozilla.org", "developer.mozilla.org"];

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/** Not every URL is equal. Classify before reasoning. */
export function classifySource(url: string): SourceCategory {
  const host = hostOf(url);
  if (!host) return "unknown";
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return "";
    }
  })();
  if (host.endsWith(".gov") || host.endsWith(".gov.uk") || host.endsWith(".europa.eu")) return "government";
  if (host.endsWith(".edu") || host.includes("arxiv.org") || host.includes("doi.org")) return "academic";
  if (FORUM_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return "forum_social";
  if (host.startsWith("docs.") || host.startsWith("developer.") || /^\/(docs|documentation|reference|api)(\/|$)/.test(path)) {
    return "official_docs";
  }
  if (REFERENCE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return "industry_reference";
  if (REPORTING_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return "reporting";
  if (COMMUNITY_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return "community";
  return "unknown";
}

export function authorityOf(category: SourceCategory): Authority {
  return AUTHORITY_BY_CATEGORY[category];
}

export function freshnessOf(published_at: string | null | undefined, now = new Date()): Freshness {
  if (!published_at) return "unknown";
  const t = Date.parse(published_at);
  if (Number.isNaN(t)) return "unknown";
  const days = (now.getTime() - t) / 86_400_000;
  if (days <= 90) return "current";
  if (days <= 540) return "recent";
  return "dated";
}

/** Provider output in, one shared shape out. */
export function normalizeSource(
  raw: RawProviderResult,
  opts: { query_id?: string | null; retrieved_at?: string; now?: Date } = {},
): SourceResult | null {
  const url = (raw.url ?? "").trim();
  if (!url) return null;
  const category = classifySource(url);
  return {
    title: (raw.title ?? "").trim().slice(0, 300) || hostOf(url) || url,
    source: hostOf(url) || (raw.provider ?? "unknown"),
    url,
    published_at: raw.published_at ?? null,
    category,
    authority: authorityOf(category),
    freshness: freshnessOf(raw.published_at, opts.now),
    excerpt: (raw.snippet ?? "").trim().slice(0, 600) || null,
    retrieved_at: opts.retrieved_at ?? (opts.now ?? new Date()).toISOString(),
    query_id: opts.query_id ?? null,
    verification_state: "unverified",
  };
}

export function rankSources(sources: SourceResult[]): SourceResult[] {
  const aRank: Record<Authority, number> = { authoritative: 3, credible: 2, anecdotal: 1, unknown: 0 };
  const fRank: Record<Freshness, number> = { current: 3, recent: 2, dated: 1, unknown: 0 };
  return [...sources].sort(
    (a, b) => aRank[b.authority] - aRank[a.authority] || fRank[b.freshness] - fRank[a.freshness],
  );
}

export type Disagreement = "agreed" | "conflicting" | "unverified" | "no_sources";

/** Never collapse disagreement into false certainty. */
export function assessAgreement(sources: SourceResult[]): {
  state: Disagreement;
  confidence: Confidence;
} {
  if (!sources.length) return { state: "no_sources", confidence: "unreadable" };
  if (sources.some((s) => s.verification_state === "contradicted")) {
    return { state: "conflicting", confidence: "uncertain" };
  }
  const corroborated = sources.filter((s) => s.verification_state === "corroborated");
  if (corroborated.length >= 2) {
    const authoritative = corroborated.some((s) => s.authority === "authoritative");
    return { state: "agreed", confidence: authoritative ? "high" : "probable" };
  }
  return { state: "unverified", confidence: sources.some((s) => s.authority === "authoritative") ? "probable" : "uncertain" };
}

export function depthForIntent(intent: ResearchIntent): ResearchDepth {
  switch (intent) {
    case "lookup":
      return "quick";
    case "explain":
    case "compare":
    case "verify":
      return "standard";
    case "investigate":
    case "monitor":
      return "deep";
  }
}

/** Layered output. Bottom line first; walls of text never by default. */
export interface ResearchOutput {
  bottom_line: string;
  what_i_found: string[];
  what_matters_to_you: string[];
  what_is_uncertain: string[];
  sources: SourceResult[];
  can_go_deeper: boolean;
}

/** A complex investigation, broken up. Trivial lookups skip this entirely. */
export interface ResearchSession {
  id?: string;
  question: string;
  intent: ResearchIntent;
  depth: ResearchDepth;
  /** Sanitized public sub-questions, never private phrasing. */
  sub_questions: string[];
  sources: SourceResult[];
  findings: string[];
  contradictions: string[];
  /** IDs of internal records that shaped the question, kept private. */
  internal_context_refs: string[];
  synthesis?: string | null;
  saved: boolean;
  project_id?: string | null;
  organization_id?: string | null;
}

/** Research alone is not a receipt-worthy event; state changes are. */
export function researchNeedsReceipt(session: Pick<ResearchSession, "saved" | "intent" | "project_id">): boolean {
  return Boolean(session.saved || session.project_id || session.intent === "monitor");
}
