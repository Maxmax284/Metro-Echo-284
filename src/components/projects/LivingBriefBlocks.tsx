// LivingBriefBlocks — renders the structured Living Brief (5 named blocks)
// with inline citation chips that scroll to and pulse the source item card
// further down the project page. Pure presentation.
import { Badge } from "@/components/ui/badge";

export type Citation = { ref: string; kind: string; id: string; label: string };

export interface StructuredBrief {
  version: number;
  tone: "operator" | "narrative";
  generated_at: string;
  blocks: {
    where_it_stands?: { summary?: string; bullets?: Array<{ text: string; citations: string[] }> };
    what_moved?: { bullets?: Array<{ text: string; citations: string[] }> };
    who_waiting?: { bullets?: Array<{ text: string; citations: string[] }> };
    open_questions?: { bullets?: Array<{ text: string; citations: string[] }> };
    next_move?: { text?: string; citations?: string[] };
  };
  ref_index: Record<string, { kind: string; id: string; label: string }>;
}

export function sourceCardId(kind: string, id: string) {
  return `src-${kind}-${id}`;
}

function jumpTo(kind: string, id: string) {
  const el = document.getElementById(sourceCardId(kind, id));
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("ring-2", "ring-primary/60", "ring-offset-2", "ring-offset-background");
  setTimeout(() => {
    el.classList.remove("ring-2", "ring-primary/60", "ring-offset-2", "ring-offset-background");
  }, 1800);
}

function CitationChips({ refs, refIndex }: { refs: string[]; refIndex: StructuredBrief["ref_index"] }) {
  if (!refs?.length) return null;
  return (
    <span className="ml-1 inline-flex flex-wrap items-center gap-1 align-middle">
      {refs.map((r) => {
        const meta = refIndex[r];
        if (!meta) return null;
        const short = meta.label.length > 28 ? meta.label.slice(0, 26) + "…" : meta.label;
        return (
          <button
            key={r}
            type="button"
            onClick={() => jumpTo(meta.kind, meta.id)}
            title={`${meta.kind}: ${meta.label}`}
            className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-1.5 py-[1px] text-[10px] text-primary/90 transition-colors hover:bg-primary/15"
          >
            <span className="opacity-70 capitalize">{meta.kind}</span>
            <span className="max-w-[140px] truncate">{short}</span>
          </button>
        );
      })}
    </span>
  );
}

function BulletList({
  bullets, refIndex,
}: {
  bullets?: Array<{ text: string; citations: string[] }>;
  refIndex: StructuredBrief["ref_index"];
}) {
  if (!bullets?.length) return <p className="text-xs text-muted-foreground">Nothing here yet.</p>;
  return (
    <ul className="space-y-1.5">
      {bullets.map((b, i) => (
        <li key={i} className="flex gap-2 text-[13.5px] leading-relaxed text-foreground/90">
          <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-foreground/40" />
          <span>
            {b.text}
            <CitationChips refs={b.citations ?? []} refIndex={refIndex} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function BlockHeading({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{children}</div>;
}

export function LivingBriefBlocks({ brief }: { brief: StructuredBrief }) {
  const b = brief.blocks ?? {};
  const idx = brief.ref_index ?? {};
  return (
    <div className="space-y-5">
      {b.where_it_stands && (
        <div className="space-y-1.5">
          <BlockHeading>Where it stands</BlockHeading>
          {b.where_it_stands.summary && (
            <p className="text-[13.5px] leading-relaxed text-foreground/90">{b.where_it_stands.summary}</p>
          )}
          {b.where_it_stands.bullets?.length ? <BulletList bullets={b.where_it_stands.bullets} refIndex={idx} /> : null}
        </div>
      )}

      {b.what_moved?.bullets?.length ? (
        <div className="space-y-1.5">
          <BlockHeading>What moved</BlockHeading>
          <BulletList bullets={b.what_moved.bullets} refIndex={idx} />
        </div>
      ) : null}

      {b.who_waiting?.bullets?.length ? (
        <div className="space-y-1.5">
          <BlockHeading>Who's waiting</BlockHeading>
          <BulletList bullets={b.who_waiting.bullets} refIndex={idx} />
        </div>
      ) : null}

      {b.open_questions?.bullets?.length ? (
        <div className="space-y-1.5">
          <BlockHeading>Open questions</BlockHeading>
          <BulletList bullets={b.open_questions.bullets} refIndex={idx} />
        </div>
      ) : null}

      {b.next_move?.text ? (
        <div className="space-y-1.5">
          <BlockHeading>Next move</BlockHeading>
          <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5 text-[13.5px] text-foreground">
            {b.next_move.text}
            <CitationChips refs={b.next_move.citations ?? []} refIndex={idx} />
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-2 pt-1 text-[10px] text-muted-foreground/80">
        <Badge variant="outline" className="text-[9.5px] capitalize">{brief.tone}</Badge>
        <span>Tap any chip to jump to the source.</span>
      </div>
    </div>
  );
}
