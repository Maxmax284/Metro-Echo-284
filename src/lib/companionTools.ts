// Shared Companion Tool Registry (V3 Stage 1)
// Single source of truth for every tool the Companion can expose.
// Tools are filtered by surface, mode, role, and live API availability.
// NOTHING here calls external APIs directly — tools either:
//   (a) build a prompt for vanta-converse (which routes through apiGuard server-side), or
//   (b) trigger a UI action (open Sherlock overlay, open Research panel, etc.)

import {
  MapPin, Receipt, Link2, FileText, BookmarkPlus, CheckSquare, ListPlus,
  Search, Sparkles, ScrollText, Languages, FileSearch,
  type LucideIcon,
} from "lucide-react";
import type { AppMode } from "@/hooks/useMode";
import type { SystemControls } from "@/hooks/useSystemControls";

export type ToolSurface =
  | "command" | "conversation" | "memory" | "commitments"
  | "actions" | "awareness" | "sherlock" | "audit" | "*";

export type ToolProvider = "none" | "lovable-ai" | "serpapi" | "open-meteo";

/** Scope a tool is allowed to run in — scope is absolute, tools included. */
export type ToolScope = "personal" | "organization" | "admin";

/** Structured block a tool's output should render as (see vantaBlocks). */
export type ToolOutputBlock = "summary" | "card" | "status" | "approval" | "list";

export type ToolBuildCtx = {
  surface: string;
  placeLabel?: string;
};

export type Tool = {
  id: string;
  label: string;
  icon: LucideIcon;
  description: string;
  surfaces: ToolSurface[];          // "*" = everywhere
  modes: AppMode[];                  // which modes may invoke it
  ownerOnly?: boolean;
  provider: ToolProvider;            // for kill-switch gating
  costsCredits: boolean;
  createsDraft: boolean;             // routes output to actions / commitments / notes as draft
  needsApproval: boolean;
  /** Prompt-style tool: returns text that gets sent to vanta-converse. */
  buildPrompt?: (ctx: ToolBuildCtx) => string;
  /** Direct-action tool id: handled by CompanionTools' action router. */
  directAction?: "open-sherlock" | "open-research";
  /** Scopes this tool may run in. Omitted = any scope. */
  allowedScopes?: ToolScope[];
  /** Which structured block the tool's answer should land as. */
  outputBlockType?: ToolOutputBlock;
  /** Registry-only capability: never offered in the slash menu / tool tray. */
  hiddenFromDirectInvocation?: boolean;
  auditEvent?: string;
};

export const COMPANION_TOOLS: Tool[] = [
  // --- existing 4 (preserve behavior) ---
  {
    id: "area",
    label: "Ask about area",
    icon: MapPin,
    description: "Summarize what to know about your current place.",
    surfaces: ["*"],
    modes: ["observer", "advisor", "operator"],
    provider: "lovable-ai",
    costsCredits: true,
    createsDraft: false,
    needsApproval: false,
    buildPrompt: ({ placeLabel }) =>
      placeLabel
        ? `Ask about ${placeLabel}: what should I know right now (transport, payments, etiquette, hazards)? Use the latest awareness briefings and snapshot.`
        : `Ask about my current area: what should I know right now? If no place is set, suggest capturing one first.`,
    auditEvent: "companion.tool.area",
  },
  {
    id: "receipt",
    label: "Explain receipt",
    icon: Receipt,
    description: "Read the most recent uploaded receipt and flag anomalies.",
    surfaces: ["*"],
    modes: ["observer", "advisor", "operator"],
    provider: "lovable-ai",
    costsCredits: true,
    createsDraft: true,
    needsApproval: true,
    buildPrompt: () =>
      `Explain the most recent receipt/file I uploaded — what was bought, totals, anomalies, and whether anything needs follow-up. Stage a draft action only if needed.`,
    auditEvent: "companion.tool.receipt",
  },
  {
    id: "related",
    label: "Find related",
    icon: Link2,
    description: "Surface notes / commitments / actions linked to current view.",
    surfaces: ["*"],
    modes: ["observer", "advisor", "operator"],
    provider: "lovable-ai",
    costsCredits: true,
    createsDraft: false,
    needsApproval: false,
    buildPrompt: ({ surface }) =>
      `Find notes, commitments, and actions related to what I'm currently looking at on the ${surface} surface. Surface links — don't execute anything.`,
    auditEvent: "companion.tool.related",
  },
  {
    id: "draft",
    label: "Explain draft",
    icon: FileText,
    description: "Walk through the latest proposed action before approval.",
    surfaces: ["actions", "audit", "command"],
    modes: ["observer", "advisor", "operator"],
    provider: "lovable-ai",
    costsCredits: true,
    createsDraft: false,
    needsApproval: false,
    buildPrompt: () =>
      `Explain the latest proposed action: what it does, what it touches, the risk level, and what to check before approving. Do not execute.`,
    auditEvent: "companion.tool.draft",
  },

  // --- new prompt-style tools that route to existing tables via vanta-converse ---
  {
    id: "save-memory",
    label: "Save to Memory",
    icon: BookmarkPlus,
    description: "Capture the current thread as a structured note.",
    surfaces: ["*"],
    modes: ["observer", "advisor", "operator"],
    provider: "lovable-ai",
    costsCredits: true,
    createsDraft: false,
    needsApproval: false,
    buildPrompt: ({ surface }) =>
      `Distill this conversation into a Memory note: title, 2–4 sentence summary, tags, and any linked entities visible on the ${surface} surface. Save it.`,
    auditEvent: "companion.tool.save_memory",
  },
  {
    id: "create-commitment",
    label: "Create commitment",
    icon: CheckSquare,
    description: "Stage a commitment with due date and priority for review.",
    surfaces: ["*"],
    modes: ["advisor", "operator"],
    provider: "lovable-ai",
    costsCredits: true,
    createsDraft: true,
    needsApproval: true,
    buildPrompt: () =>
      `Propose a commitment based on what we just discussed. Include a clear summary, due_at if mentioned, and priority. Create it in commitments — I'll review.`,
    auditEvent: "companion.tool.create_commitment",
  },
  {
    id: "draft-action",
    label: "Draft action",
    icon: ListPlus,
    description: "Stage a proposed action for approval. Never executes.",
    surfaces: ["*"],
    modes: ["advisor", "operator"],
    provider: "lovable-ai",
    costsCredits: true,
    createsDraft: true,
    needsApproval: true,
    buildPrompt: ({ surface }) =>
      `Draft an action (status=proposed) from this thread. Title, description, risk, and affected_entities. Use surface=${surface} as source. Do not execute.`,
    auditEvent: "companion.tool.draft_action",
  },
  {
    id: "summarize-page",
    label: "Summarize page",
    icon: ScrollText,
    description: "Compress the current surface into a 5-line brief.",
    surfaces: ["*"],
    modes: ["observer", "advisor", "operator"],
    provider: "lovable-ai",
    costsCredits: true,
    createsDraft: false,
    needsApproval: false,
    buildPrompt: ({ surface }) =>
      `Summarize what's visible on the ${surface} surface right now in ≤5 lines. Plain English. No filler.`,
    auditEvent: "companion.tool.summarize",
  },
  {
    id: "translate",
    label: "Translate",
    icon: Languages,
    description: "Translate the last message or attachment.",
    surfaces: ["*"],
    modes: ["observer", "advisor", "operator"],
    provider: "lovable-ai",
    costsCredits: true,
    createsDraft: false,
    needsApproval: false,
    buildPrompt: () =>
      `Translate the last message or attached text to English (or to my preferred language if set). Keep the source visible alongside.`,
    auditEvent: "companion.tool.translate",
  },
  {
    id: "analyze-file",
    label: "Analyze file",
    icon: FileSearch,
    description: "Run analysis on the most recently ingested file.",
    surfaces: ["*"],
    modes: ["observer", "advisor", "operator"],
    provider: "lovable-ai",
    costsCredits: true,
    createsDraft: false,
    needsApproval: false,
    buildPrompt: () =>
      `Analyze the most recently ingested file: type, key facts, dates, totals, anything that should become a commitment or note. Source-label everything.`,
    auditEvent: "companion.tool.analyze_file",
  },

  // --- direct-action tools (open existing UI surfaces, no prompt) ---
  {
    id: "run-sherlock",
    label: "Run Sherlock",
    icon: Sparkles,
    description: "Open scoped investigation on current context.",
    surfaces: ["*"],
    modes: ["observer", "advisor", "operator"],
    provider: "lovable-ai",
    costsCredits: true,
    createsDraft: false,
    needsApproval: false,
    directAction: "open-sherlock",
    auditEvent: "companion.tool.sherlock",
  },
  {
    id: "research-this",
    label: "Research this",
    icon: Search,
    description: "Create a research object via SerpApi (rate-limited).",
    surfaces: ["*"],
    modes: ["advisor", "operator"],
    provider: "serpapi",
    costsCredits: true,
    createsDraft: false,
    needsApproval: false,
    directAction: "open-research",
    auditEvent: "companion.tool.research",
  },
];

export type ToolAvailability =
  | { available: true }
  | { available: false; reason: string };

/** Single source of truth for whether a tool may be invoked right now. */
export function getToolAvailability(
  tool: Tool,
  opts: {
    surface: string;
    mode: AppMode;
    isOwner: boolean | null;
    controls: SystemControls | null;
    /** Active scope, when the caller knows it. Omitted = no scope gate. */
    scope?: ToolScope;
    /** True when the user is picking the tool by hand (slash menu, tool tray). */
    direct?: boolean;
  }
): ToolAvailability {
  // Direct-invocation gate — some capabilities exist only for Vanta to reach for.
  if (opts.direct && tool.hiddenFromDirectInvocation) {
    return { available: false, reason: "Vanta uses this on its own" };
  }
  // Scope gate — scope is absolute.
  if (opts.scope && tool.allowedScopes && !tool.allowedScopes.includes(opts.scope)) {
    return { available: false, reason: `Not available in ${opts.scope === "organization" ? "a workspace" : opts.scope} scope` };
  }
  // Surface gate
  if (!tool.surfaces.includes("*") && !tool.surfaces.includes(opts.surface as ToolSurface)) {
    return { available: false, reason: `Not available on ${opts.surface}` };
  }
  // Mode gate
  if (!tool.modes.includes(opts.mode)) {
    if (opts.mode === "locked") return { available: false, reason: "Companion is in Locked mode" };
    return { available: false, reason: `Requires ${tool.modes[0]}+ mode` };
  }
  // Owner gate
  if (tool.ownerOnly && !opts.isOwner) {
    return { available: false, reason: "Owner-only" };
  }
  // API availability gate
  if (tool.provider !== "none") {
    const c = opts.controls;
    if (c) {
      if (!c.external_apis_enabled || c.global_usage_mode === "lockdown") {
        return { available: false, reason: "External APIs disabled in Control Room" };
      }
      if (tool.provider === "serpapi" && !c.serpapi_enabled) {
        return { available: false, reason: "SerpApi paused in Control Room" };
      }
      if (tool.provider === "lovable-ai" && !c.gemini_enabled) {
        return { available: false, reason: "AI synthesis paused in Control Room" };
      }
      if (tool.provider === "open-meteo" && !c.weather_enabled) {
        return { available: false, reason: "Weather paused in Control Room" };
      }
    }
  }
  return { available: true };
}
