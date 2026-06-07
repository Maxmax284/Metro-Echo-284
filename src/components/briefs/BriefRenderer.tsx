// BriefRenderer — calm, minimal in-app rendering of a Brief.
// Each claim (prose, list item, timeline item, decision, pull-quote) is
// directly tappable when it has receipts. Tapping opens the ReceiptsDrawer
// with the matching source items pre-highlighted. Footnote numbers next to
// each claim mirror the numbered appendix used in the exported PDF.
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Brief, BriefSection, BriefGrounding } from "@/lib/briefs";
import { formatDistanceToNow } from "date-fns";
import { Quote, ScrollText } from "lucide-react";
import { ReceiptsDrawer } from "./ReceiptsDrawer";
import {
  buildFootnotes,
  claimAnchorId,
  footnoteAnchorId,
  type ClaimRef,
  type FootnoteMap,
} from "@/lib/briefFootnotes";
import { templateFor } from "@/lib/briefTemplates";

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </div>
  );
}

type OpenReceiptsFn = (args: {
  refs: BriefGrounding[];
  label?: string;
  highlightKey?: string;
}) => void;

type ClaimByKey = Map<string, ClaimRef>;

function FootnoteMarks({ numbers }: { numbers: number[] }) {
  if (!numbers.length) return null;
  return (
    <sup className="ml-0.5 text-[9.5px] font-medium text-primary/80">
      {numbers.map((n, i) => (
        <span key={n}>
          {i > 0 ? "," : ""}
          <a
            href={`#${footnoteAnchorId(n)}`}
            onClick={(e) => {
              const el = document.getElementById(footnoteAnchorId(n));
              if (el) {
                e.preventDefault();
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                el.classList.add("ring-2", "ring-primary/60");
                setTimeout(() => el.classList.remove("ring-2", "ring-primary/60"), 1600);
              }
            }}
            className="hover:underline"
          >
            {n}
          </a>
        </span>
      ))}
    </sup>
  );
}

function ClaimWrap({
  claim, children, openReceipts,
}: { claim?: ClaimRef; children: React.ReactNode; openReceipts: OpenReceiptsFn }) {
  if (!claim || claim.receipts.length === 0) return <>{children}</>;
  return (
    <button
      type="button"
      id={claimAnchorId(claim.claimId)}
      onClick={() =>
        openReceipts({
          refs: claim.receipts,
          label: claim.heading,
          highlightKey: claim.claimId,
        })
      }
      className="group cursor-pointer rounded-sm text-left underline decoration-dotted decoration-primary/40 underline-offset-[3px] transition-colors hover:bg-primary/5 hover:decoration-primary"
      aria-label="Open receipts for this claim"
    >
      {children}
      <FootnoteMarks numbers={claim.numbers} />
    </button>
  );
}

function extractText(body: any): string {
  if (body == null) return "";
  if (typeof body === "string") return body;
  if (typeof body === "object" && typeof body.text === "string") return body.text;
  return String(body);
}

function ProseBlock({ section, claims, openReceipts }: { section: BriefSection; claims: ClaimByKey; openReceipts: OpenReceiptsFn }) {
  const claim = claims.get(`${section.id}:prose`);
  return (
    <div className="space-y-1.5">
      {section.heading && <SectionHeading>{section.heading}</SectionHeading>}
      <p className="text-[13.5px] leading-relaxed text-foreground/90">
        <ClaimWrap claim={claim} openReceipts={openReceipts}>
          {extractText(section.body)}
        </ClaimWrap>
      </p>
    </div>
  );
}

function ListBlock({ section, claims, openReceipts }: { section: BriefSection; claims: ClaimByKey; openReceipts: OpenReceiptsFn }) {
  const items: any[] = Array.isArray(section.body) ? section.body : [];
  return (
    <div className="space-y-1.5">
      {section.heading && <SectionHeading>{section.heading}</SectionHeading>}
      <ul className="space-y-1 text-[13px] text-foreground/85">
        {items.map((it, i) => {
          const text = typeof it === "string" ? it : (it?.text ?? it?.what ?? "");
          const claim = claims.get(`${section.id}:${i}`);
          return (
            <li key={i} className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-foreground/40" />
              <span><ClaimWrap claim={claim} openReceipts={openReceipts}>{text}</ClaimWrap></span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TimelineBlock({ section, claims, openReceipts }: { section: BriefSection; claims: ClaimByKey; openReceipts: OpenReceiptsFn }) {
  const items: any[] = Array.isArray(section.body) ? section.body : [];
  return (
    <div className="space-y-1.5">
      {section.heading && <SectionHeading>{section.heading}</SectionHeading>}
      <ol className="space-y-2 border-l border-border/60 pl-3 text-[12.5px]">
        {items.map((it, i) => {
          const claim = claims.get(`${section.id}:${i}`);
          return (
            <li key={i}>
              <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{it.when ?? ""}</div>
              <div className="text-foreground/90">
                <ClaimWrap claim={claim} openReceipts={openReceipts}>{it.what ?? ""}</ClaimWrap>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function DecisionBlock({ section, claims, openReceipts }: { section: BriefSection; claims: ClaimByKey; openReceipts: OpenReceiptsFn }) {
  const body = section.body ?? {};
  const claim = claims.get(`${section.id}:decision`);
  return (
    <div className="space-y-1.5">
      {section.heading && <SectionHeading>{section.heading}</SectionHeading>}
      <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
        <div className="text-[13.5px] font-medium text-foreground">
          <ClaimWrap claim={claim} openReceipts={openReceipts}>{body.decision ?? ""}</ClaimWrap>
        </div>
        {body.why && <div className="mt-1 text-[12px] text-muted-foreground">Why: {body.why}</div>}
      </div>
    </div>
  );
}

function ReceiptsBlock({ section, claims, openReceipts }: { section: BriefSection; claims: ClaimByKey; openReceipts: OpenReceiptsFn }) {
  const items: any[] = Array.isArray(section.body) ? section.body : [];
  return (
    <div className="space-y-1.5">
      {section.heading && <SectionHeading>{section.heading}</SectionHeading>}
      <div className="rounded-md border border-border/50 bg-background/40 p-2">
        <ul className="space-y-1 text-[11.5px] font-mono text-foreground/80">
          {items.map((it, i) => {
            const claim = claims.get(`${section.id}:${i}`);
            const text = typeof it === "string" ? it : (it?.text ?? JSON.stringify(it));
            return (
              <li key={i} className="truncate">
                <ClaimWrap claim={claim} openReceipts={openReceipts}>{text}</ClaimWrap>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function PullQuoteBlock({ section, claims, openReceipts }: { section: BriefSection; claims: ClaimByKey; openReceipts: OpenReceiptsFn }) {
  const claim = claims.get(`${section.id}:prose`);
  return (
    <div className="space-y-1.5">
      {section.heading && <SectionHeading>{section.heading}</SectionHeading>}
      <blockquote className="flex gap-2 border-l-2 border-primary/50 pl-3 text-[13.5px] italic text-foreground/85">
        <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/60" />
        <span><ClaimWrap claim={claim} openReceipts={openReceipts}>{extractText(section.body)}</ClaimWrap></span>
      </blockquote>
    </div>
  );
}

function renderSection(section: BriefSection, claims: ClaimByKey, openReceipts: OpenReceiptsFn) {
  switch (section.kind) {
    case "list":      return <ListBlock section={section} claims={claims} openReceipts={openReceipts} />;
    case "timeline":  return <TimelineBlock section={section} claims={claims} openReceipts={openReceipts} />;
    case "decision":  return <DecisionBlock section={section} claims={claims} openReceipts={openReceipts} />;
    case "receipts":  return <ReceiptsBlock section={section} claims={claims} openReceipts={openReceipts} />;
    case "pull_quote":return <PullQuoteBlock section={section} claims={claims} openReceipts={openReceipts} />;
    case "prose":
    default:          return <ProseBlock section={section} claims={claims} openReceipts={openReceipts} />;
  }
}

function FootnoteAppendix({ footnotes, openReceipts }: { footnotes: FootnoteMap; openReceipts: OpenReceiptsFn }) {
  if (footnotes.ordered.length === 0) return null;
  return (
    <div className="space-y-1.5 border-t border-border/40 pt-3">
      <SectionHeading>Source footnotes</SectionHeading>
      <ol className="space-y-1 text-[11.5px] text-muted-foreground">
        {footnotes.ordered.map(({ n, ref }) => (
          <li
            key={n}
            id={footnoteAnchorId(n)}
            className="rounded-sm px-1 py-0.5 transition-colors"
          >
            <button
              type="button"
              onClick={() =>
                openReceipts({ refs: [ref], label: `Footnote ${n}`, highlightKey: `fn-${n}` })
              }
              className="text-left hover:text-foreground"
            >
              <span className="mr-1 font-mono text-foreground/70">{n}.</span>
              <span className="text-foreground/85">{ref.label ?? `${ref.kind} ${ref.id?.slice(0, 8) ?? ""}`}</span>
              <span className="ml-1 text-[10px] text-muted-foreground/80">· {ref.kind}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function BriefRenderer({ brief }: { brief: Brief }) {
  const { footnotes, claims } = useMemo(() => buildFootnotes(brief), [brief]);
  const claimsByKey = useMemo(() => {
    const m: ClaimByKey = new Map();
    for (const c of claims) m.set(c.claimId, c);
    return m;
  }, [claims]);

  const [drawer, setDrawer] = useState<{
    refs: BriefGrounding[]; label?: string; highlightKey?: string;
  } | null>(null);

  const openReceipts: OpenReceiptsFn = (args) => setDrawer(args);

  return (
    <>
      <Card className="space-y-4 border-border/60 bg-surface-elevated/60 p-4">
        <header className="space-y-1 border-b border-border/40 pb-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {brief.format.replace("_", " ")} · {brief.scope_kind}
          </div>
          <h2 className="text-[18px] font-semibold leading-tight text-foreground">{brief.title}</h2>
          {brief.subtitle && (
            <p className="text-[12.5px] text-muted-foreground">{brief.subtitle}</p>
          )}
          <p className="text-[10.5px] text-muted-foreground/80">
            Drafted {formatDistanceToNow(new Date(brief.generated_at), { addSuffix: true })} · tap any
            <span className="mx-1 underline decoration-dotted decoration-primary/40 underline-offset-[3px]">claim</span>
            or footnote number to see its receipts.
          </p>
        </header>

        <div className="space-y-4">
          {brief.sections.map((s) => (
            <div key={s.id}>{renderSection(s, claimsByKey, openReceipts)}</div>
          ))}
        </div>

        <FootnoteAppendix footnotes={footnotes} openReceipts={openReceipts} />

        {brief.appendix_receipts && brief.appendix_receipts.length > 0 && (
          <div className="space-y-1.5 border-t border-border/40 pt-3">
            <button
              type="button"
              onClick={() => openReceipts({ refs: brief.appendix_receipts, label: "Receipt appendix" })}
              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              <ScrollText className="h-3 w-3" /> Open all appendix receipts
            </button>
          </div>
        )}
      </Card>

      <ReceiptsDrawer
        open={!!drawer}
        onOpenChange={(o) => { if (!o) setDrawer(null); }}
        refs={drawer?.refs ?? []}
        sectionLabel={drawer?.label}
        highlightKey={drawer?.highlightKey}
      />
    </>
  );
}
