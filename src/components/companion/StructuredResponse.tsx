// Renders a Vanta answer as structured blocks: a lead summary, status rows,
// checklists, section cards, approval notices and next steps.
import { AlertTriangle, ArrowUpRight, CheckCircle2, CircleDot, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseVantaBlocks, isStructured, type Tone, type VantaBlock } from "@/lib/vantaBlocks";
import { useCurrentContext } from "@/providers/CurrentContextProvider";

const TONE_RING: Record<Tone, string> = {
  neutral: "ring-border/60 bg-surface-elevated/60",
  good: "ring-primary/30 bg-primary/5",
  warn: "ring-warn/35 bg-warn/5",
  risk: "ring-danger/35 bg-danger/5",
};

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-muted-foreground",
  good: "text-primary",
  warn: "text-warn",
  risk: "text-danger",
};

function ToneDot({ tone }: { tone: Tone }) {
  const Icon = tone === "risk" ? AlertTriangle : tone === "good" ? CheckCircle2 : CircleDot;
  return <Icon className={cn("mt-[3px] h-3.5 w-3.5 shrink-0", TONE_TEXT[tone])} />;
}

function Blocks({ blocks, depth = 0 }: { blocks: VantaBlock[]; depth?: number }) {
  const { setContext } = useCurrentContext();
  return (
    <div className={cn("space-y-2.5", depth > 0 && "space-y-2")}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case "summary":
            return (
              <p key={i} className="text-[15px] font-medium leading-snug text-foreground">
                {b.text}
              </p>
            );
          case "text":
            return (
              <p key={i} className="text-[14px] leading-relaxed text-foreground/90">
                {b.text}
              </p>
            );
          case "status":
            return (
              <div key={i} className="grid gap-1">
                {b.items.map((s, j) => (
                  <div
                    key={j}
                    className={cn(
                      "flex items-baseline justify-between gap-3 rounded-lg px-2.5 py-1.5 ring-1",
                      TONE_RING[s.tone],
                    )}
                  >
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{s.label}</span>
                    <span className={cn("min-w-0 flex-1 text-right text-[13px] font-medium", s.tone === "neutral" ? "text-foreground" : TONE_TEXT[s.tone])}>
                      {s.value}
                    </span>
                  </div>
                ))}
              </div>
            );
          case "bullets":
            return (
              <ul key={i} className="space-y-1.5">
                {b.items.map((it, j) => (
                  <li key={j} className="flex items-start gap-2 text-[14px] leading-snug text-foreground/90">
                    <ToneDot tone={it.tone} />
                    <span className="min-w-0">{it.text}</span>
                  </li>
                ))}
              </ul>
            );
          case "next":
            return (
              <div key={i} className="rounded-xl bg-surface-elevated/70 p-2.5 ring-1 ring-border/60">
                <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">What to do next</div>
                <ol className="space-y-1">
                  {b.items.map((t, j) => (
                    <li key={j} className="flex items-start gap-2 text-[14px] leading-snug text-foreground/90">
                      <span className="mt-[1px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                        {j + 1}
                      </span>
                      <span className="min-w-0">{t}</span>
                    </li>
                  ))}
                </ol>
              </div>
            );
          case "approval":
            return (
              <div key={i} className="rounded-xl bg-primary/5 p-2.5 ring-1 ring-primary/30">
                <div className="flex items-center gap-1.5 text-[12px] font-medium text-primary">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {b.title}
                </div>
                {b.detail && <p className="mt-1 text-[13px] leading-snug text-foreground/90">{b.detail}</p>}
                <button
                  type="button"
                  onClick={() => setContext({ surface: "actions" })}
                  className="mt-2 inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-primary/10 px-2.5 text-[12px] font-medium text-primary transition-colors hover:bg-primary/20"
                >
                  Review in Actions <ArrowUpRight className="h-3 w-3" />
                </button>
              </div>
            );
          case "section":
            return (
              <div key={i} className={cn("rounded-xl p-2.5 ring-1", TONE_RING[b.tone])}>
                <div className={cn("mb-1.5 text-[10px] uppercase tracking-wider", TONE_TEXT[b.tone])}>{b.title}</div>
                <Blocks blocks={b.blocks} depth={depth + 1} />
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

/**
 * Structured renderer for assistant text. Falls back to plain prose when the
 * answer has no structure (short replies, mid-stream partials).
 */
export function StructuredResponse({ text }: { text: string }) {
  const blocks = parseVantaBlocks(text);
  if (!blocks.length) return null;
  if (!isStructured(blocks)) {
    return <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground/95">{text}</div>;
  }
  return <Blocks blocks={blocks} />;
}
