// LivingBriefBlocks — renders the structured Living Brief.
// v2 layout: Situation paragraph, Key Topics (themed groups), Decisions,
// Risks / Questions, Next Move. Falls back to the legacy v1 layout
// (where_it_stands/what_moved/who_waiting/open_questions/next_move) so
// briefs generated before Slice 4 still render until re-summarized.
import { Badge } from "@/components/ui/badge";

export type Citation = { ref: string; kind: string; id: string; label: string };

type Bullet = { text: string; citations: string[] };
type BulletBlock = { bullets?: Bullet[] };
type Theme = { title: string; summary: string; citations: string[] };

export interface StructuredBrief {
  version: number;
  tone: "operator" | "narrative";
  generated_at: string;
  blocks: {
    // v2
    overall_summary?: { text?: string; citations?: string[] };
    situation?: { text?: string };
    key_topics?: { themes?: Theme[] };
    decisions?: BulletBlock;
    risks?: BulletBlock;
    // shared
    next_move?: { text?: string; citations?: string[] };
    // legacy v1
    where_it_stands?: { summary?: string; bullets?: Bullet[] };
    what_moved?: BulletBlock;
    who_waiting?: BulletBlock;
    open_questions?: BulletBlock;
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
  bullets?: Bullet[];
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

function LegacyBlocks({ brief }: { brief: StructuredBrief }) {
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
      <Footer tone={brief.tone} />
    </div>
  );
}

function Footer({ tone }: { tone: StructuredBrief["tone"] }) {
  return (
    <div className="flex items-center gap-2 pt-1 text-[10px] text-muted-foreground/80">
      <Badge variant="outline" className="text-[9.5px] capitalize">{tone}</Badge>
      <span>Tap any chip to jump to the source.</span>
    </div>
  );
}

export function LivingBriefBlocks({ brief }: { brief: StructuredBrief }) {
  const b = brief.blocks ?? {};
  const idx = brief.ref_index ?? {};

  const isV2 = !!(b.overall_summary?.text || b.situation?.text || b.key_topics?.themes?.length || b.decisions?.bullets?.length || b.risks?.bullets?.length);
  const hasLegacy = !!(b.where_it_stands || b.what_moved?.bullets?.length || b.who_waiting?.bullets?.length || b.open_questions?.bullets?.length);

  if (!isV2 && hasLegacy) {
    return <LegacyBlocks brief={brief} />;
  }

  return (
    <div className="space-y-5">
      {b.overall_summary?.text && (
        <div className="space-y-1.5 rounded-md border-l-2 border-primary/60 bg-primary/[0.04] py-2 pl-3 pr-2">
          <BlockHeading>Overall summary</BlockHeading>
          <p className="text-[14px] leading-relaxed text-foreground">
            {b.overall_summary.text}
            <CitationChips refs={b.overall_summary.citations ?? []} refIndex={idx} />
          </p>
        </div>
      )}

      {b.situation?.text && (
        <div className="space-y-1.5">
          <BlockHeading>Situation</BlockHeading>
          <p className="text-[13.5px] leading-relaxed text-foreground/90">{b.situation.text}</p>
        </div>
      )}

      {b.key_topics?.themes?.length ? (
        <div className="space-y-2">
          <BlockHeading>Key topics</BlockHeading>
          <ul className="space-y-2">
            {b.key_topics.themes.map((t, i) => (
              <li key={i} className="rounded-md border border-border/40 bg-surface-elevated/30 p-2.5">
                <div className="text-[12.5px] font-medium text-foreground">{t.title}</div>
                <p className="mt-0.5 text-[13px] leading-relaxed text-foreground/85">
                  {t.summary}
                  <CitationChips refs={t.citations ?? []} refIndex={idx} />
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {b.decisions?.bullets?.length ? (
        <div className="space-y-1.5">
          <BlockHeading>Decisions / known requirements</BlockHeading>
          <BulletList bullets={b.decisions.bullets} refIndex={idx} />
        </div>
      ) : null}

      {b.risks?.bullets?.length ? (
        <div className="space-y-1.5">
          <BlockHeading>Risks / questions</BlockHeading>
          <BulletList bullets={b.risks.bullets} refIndex={idx} />
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

      <Footer tone={brief.tone} />
    </div>
  );
}
