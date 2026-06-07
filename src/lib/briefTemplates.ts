// Per-audience template variants for Brief preview + PDF export.
// Same content, different packaging. Used by BriefRenderer (in-app preview)
// and BriefPdfDocument (exported PDF) so the chosen audience produces a
// visibly distinct, matching look across both surfaces.

import type { BriefAudience } from "@/lib/briefs";

export type BriefTemplate = {
  id: BriefAudience | "default";
  /** Short label shown on the cover / preview chip. */
  label: string;
  /** One-line tone descriptor surfaced under the title. */
  tagline: string;
  /** Visual mood — drives both PDF and CSS preview. */
  mood: "neutral" | "warm" | "clinical" | "audit" | "tech" | "executive";
  /** Hex colors used in PDF + matching HSL classes in preview. */
  pdf: {
    accent: string;
    ink: string;
    body: string;
    muted: string;
    rule: string;
    surface: string;
    overallBg: string;
    titleFont: "Times-Roman" | "Helvetica-Bold" | "Helvetica";
    titleSize: number;
    bodySize: number;
    pagePadding: number;
  };
  preview: {
    /** Tailwind classes for the preview card frame + accent tint. */
    cardClass: string;
    headerClass: string;
    accentClass: string; // text color
    accentBgClass: string; // background tint
    titleClass: string;
  };
  layout: {
    /** Show the full standalone cover page in PDF. */
    coverPage: boolean;
    /** Show the numbered source footnotes appendix page in PDF. */
    footnotesAppendix: boolean;
    /** Show signals_hash + generated meta on cover. */
    showSignalsHash: boolean;
    /** Hide the Risks/Questions section for polished external audiences. */
    hideRisks: boolean;
    /** Render Sources appendix first (after Overall) for receipts-first audiences. */
    receiptsFirst: boolean;
    /** Rename labels per audience (e.g. Risks -> Considerations). */
    labels: {
      overall: string;
      situation: string;
      keyTopics: string;
      decisions: string;
      risks: string;
      nextMove: string;
    };
  };
};

const DEFAULT_LABELS = {
  overall: "Overall summary",
  situation: "Situation",
  keyTopics: "Key topics",
  decisions: "Decisions / known requirements",
  risks: "Risks / questions",
  nextMove: "Next move",
};

export const BRIEF_TEMPLATES: Record<BriefAudience | "default", BriefTemplate> = {
  default: {
    id: "default",
    label: "Standard brief",
    tagline: "Operational summary.",
    mood: "neutral",
    pdf: {
      accent: "#3B82F6", ink: "#111418", body: "#2C3138", muted: "#7A8089",
      rule: "#E5E7EB", surface: "#F8F9FB", overallBg: "#EEF4FF",
      titleFont: "Times-Roman", titleSize: 28, bodySize: 11, pagePadding: 56,
    },
    preview: {
      cardClass: "border-border/60 bg-surface-elevated/60",
      headerClass: "border-border/40",
      accentClass: "text-primary",
      accentBgClass: "bg-primary/5",
      titleClass: "text-[18px] font-semibold",
    },
    layout: {
      coverPage: true, footnotesAppendix: true, showSignalsHash: true,
      hideRisks: false, receiptsFirst: false, labels: DEFAULT_LABELS,
    },
  },

  me: {
    id: "me",
    label: "For me",
    tagline: "Terse. Just the moves.",
    mood: "neutral",
    pdf: {
      accent: "#111418", ink: "#0B0D10", body: "#1F2329", muted: "#6B7079",
      rule: "#E5E7EB", surface: "#F4F5F7", overallBg: "#F4F5F7",
      titleFont: "Helvetica-Bold", titleSize: 22, bodySize: 11, pagePadding: 44,
    },
    preview: {
      cardClass: "border-foreground/15 bg-background/60",
      headerClass: "border-foreground/15",
      accentClass: "text-foreground",
      accentBgClass: "bg-foreground/5",
      titleClass: "text-[17px] font-semibold tracking-tight",
    },
    layout: {
      coverPage: false, footnotesAppendix: false, showSignalsHash: false,
      hideRisks: false, receiptsFirst: false,
      labels: { ...DEFAULT_LABELS, decisions: "Decided", risks: "Watch", nextMove: "Next" },
    },
  },

  internal_operator: {
    id: "internal_operator",
    label: "For internal operator",
    tagline: "Tactical. Easy to act on.",
    mood: "neutral",
    pdf: {
      accent: "#2563EB", ink: "#111418", body: "#2C3138", muted: "#7A8089",
      rule: "#E5E7EB", surface: "#F8F9FB", overallBg: "#EEF4FF",
      titleFont: "Helvetica-Bold", titleSize: 26, bodySize: 11, pagePadding: 56,
    },
    preview: {
      cardClass: "border-blue-500/30 bg-blue-500/5",
      headerClass: "border-blue-500/30",
      accentClass: "text-blue-500",
      accentBgClass: "bg-blue-500/10",
      titleClass: "text-[18px] font-semibold",
    },
    layout: {
      coverPage: true, footnotesAppendix: true, showSignalsHash: true,
      hideRisks: false, receiptsFirst: false, labels: DEFAULT_LABELS,
    },
  },

  client: {
    id: "client",
    label: "For client",
    tagline: "Polished. External-ready.",
    mood: "warm",
    pdf: {
      accent: "#0F766E", ink: "#0F1B17", body: "#34403B", muted: "#7B8581",
      rule: "#E2E8E5", surface: "#F4FAF7", overallBg: "#E6F4EE",
      titleFont: "Times-Roman", titleSize: 30, bodySize: 11, pagePadding: 64,
    },
    preview: {
      cardClass: "border-emerald-600/30 bg-emerald-600/5",
      headerClass: "border-emerald-600/30",
      accentClass: "text-emerald-700 dark:text-emerald-400",
      accentBgClass: "bg-emerald-600/10",
      titleClass: "text-[19px] font-serif",
    },
    layout: {
      coverPage: true, footnotesAppendix: false, showSignalsHash: false,
      hideRisks: true, receiptsFirst: false,
      labels: { ...DEFAULT_LABELS, risks: "Considerations" },
    },
  },

  audit: {
    id: "audit",
    label: "For audit",
    tagline: "Receipts-first. Timestamps lead.",
    mood: "audit",
    pdf: {
      accent: "#111418", ink: "#0B0D10", body: "#1F2329", muted: "#5F6670",
      rule: "#D4D7DC", surface: "#F1F2F4", overallBg: "#F1F2F4",
      titleFont: "Helvetica-Bold", titleSize: 24, bodySize: 10, pagePadding: 48,
    },
    preview: {
      cardClass: "border-foreground/20 bg-muted/30",
      headerClass: "border-foreground/20",
      accentClass: "text-foreground",
      accentBgClass: "bg-foreground/10",
      titleClass: "text-[17px] font-mono uppercase tracking-wider",
    },
    layout: {
      coverPage: true, footnotesAppendix: true, showSignalsHash: true,
      hideRisks: false, receiptsFirst: true, labels: DEFAULT_LABELS,
    },
  },

  implementation: {
    id: "implementation",
    label: "For implementation",
    tagline: "Requirements, decisions, next steps.",
    mood: "tech",
    pdf: {
      accent: "#6366F1", ink: "#111418", body: "#2C3138", muted: "#7A8089",
      rule: "#E5E7EB", surface: "#F5F5FB", overallBg: "#EEF0FF",
      titleFont: "Helvetica-Bold", titleSize: 26, bodySize: 11, pagePadding: 56,
    },
    preview: {
      cardClass: "border-indigo-500/30 bg-indigo-500/5",
      headerClass: "border-indigo-500/30",
      accentClass: "text-indigo-500",
      accentBgClass: "bg-indigo-500/10",
      titleClass: "text-[18px] font-mono",
    },
    layout: {
      coverPage: true, footnotesAppendix: true, showSignalsHash: true,
      hideRisks: false, receiptsFirst: false,
      labels: { ...DEFAULT_LABELS, risks: "Open questions / risks", nextMove: "Build next" },
    },
  },

  presentation: {
    id: "presentation",
    label: "For presentation",
    tagline: "Tight. Scannable. Executive.",
    mood: "executive",
    pdf: {
      accent: "#DC2626", ink: "#0B0D10", body: "#2C3138", muted: "#7A8089",
      rule: "#E5E7EB", surface: "#FDF6F6", overallBg: "#FEECEC",
      titleFont: "Times-Roman", titleSize: 36, bodySize: 12, pagePadding: 64,
    },
    preview: {
      cardClass: "border-red-500/30 bg-red-500/5",
      headerClass: "border-red-500/30",
      accentClass: "text-red-600 dark:text-red-400",
      accentBgClass: "bg-red-500/10",
      titleClass: "text-[22px] font-serif tracking-tight",
    },
    layout: {
      coverPage: true, footnotesAppendix: false, showSignalsHash: false,
      hideRisks: true, receiptsFirst: false,
      labels: { ...DEFAULT_LABELS, keyTopics: "Highlights", nextMove: "The ask" },
    },
  },
};

export function templateFor(audience: BriefAudience | null | undefined): BriefTemplate {
  if (!audience) return BRIEF_TEMPLATES.default;
  return BRIEF_TEMPLATES[audience] ?? BRIEF_TEMPLATES.default;
}
