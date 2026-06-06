// BriefRenderer — calm, minimal in-app rendering of a Brief.
// Supports per-claim receipts: each list/timeline item, prose block, or
// decision can carry `receipts`. Tapping the receipts chip opens a drawer.
import { useState } from "react";
import { Card } from "@/components/ui/card";
import type { Brief, BriefSection, BriefGrounding } from "@/lib/briefs";
import { formatDistanceToNow } from "date-fns";
import { Quote, ScrollText } from "lucide-react";
import { ReceiptsDrawer } from "./ReceiptsDrawer";

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </div>
  );
}

function ReceiptsChip({
  receipts, sectionLabel, onOpen,
}: { receipts?: BriefGrounding[]; sectionLabel?: string; onOpen: (r: BriefGrounding[], label?: string) => void }) {
  if (!receipts || receipts.length === 0) return null;
  return (
    <button
      type="button"
      onClick={() => onOpen(receipts, sectionLabel)}
      className="ml-1 inline-flex items-center gap-1 rounded-full bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground ring-1 ring-border/50 transition-colors hover:bg-primary/10 hover:text-primary"
      aria-label={`Show ${receipts.length} receipts`}
    >
      <ScrollText className="h-2.5 w-2.5" /> {receipts.length}
    </button>
  );
}

type OpenReceiptsFn = (r: BriefGrounding[], label?: string) => void;

function extractText(body: any): { text: string; receipts?: BriefGrounding[] } {
  if (body == null) return { text: "" };
  if (typeof body === "string") return { text: body };
  if (typeof body === "object" && typeof body.text === "string") return { text: body.text, receipts: body.receipts };
  return { text: String(body) };
}

function ProseBlock({ section, openReceipts }: { section: BriefSection; openReceipts: OpenReceiptsFn }) {
  const { text, receipts } = extractText(section.body);
  const all = receipts ?? section.receipts;
  return (
    <div className="space-y-1.5">
      {section.heading && <SectionHeading>{section.heading}</SectionHeading>}
      <p className="text-[13.5px] leading-relaxed text-foreground/90">
        {text}
        <ReceiptsChip receipts={all} sectionLabel={section.heading} onOpen={openReceipts} />
      </p>
    </div>
  );
}

function ListBlock({ section, openReceipts }: { section: BriefSection; openReceipts: OpenReceiptsFn }) {
  const items: any[] = Array.isArray(section.body) ? section.body : [];
  return (
    <div className="space-y-1.5">
      {section.heading && <SectionHeading>{section.heading}</SectionHeading>}
      <ul className="space-y-1 text-[13px] text-foreground/85">
        {items.map((it, i) => {
          const text = typeof it === "string" ? it : (it?.text ?? it?.what ?? "");
          const receipts: BriefGrounding[] | undefined = typeof it === "object" ? it?.receipts : undefined;
          return (
            <li key={i} className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-foreground/40" />
              <span>
                {text}
                <ReceiptsChip receipts={receipts ?? section.receipts} sectionLabel={section.heading} onOpen={openReceipts} />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TimelineBlock({ section, openReceipts }: { section: BriefSection; openReceipts: OpenReceiptsFn }) {
  const items: any[] = Array.isArray(section.body) ? section.body : [];
  return (
    <div className="space-y-1.5">
      {section.heading && <SectionHeading>{section.heading}</SectionHeading>}
      <ol className="space-y-2 border-l border-border/60 pl-3 text-[12.5px]">
        {items.map((it, i) => (
          <li key={i}>
            <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{it.when ?? ""}</div>
            <div className="text-foreground/90">
              {it.what ?? ""}
              <ReceiptsChip receipts={it.receipts ?? section.receipts} sectionLabel={section.heading} onOpen={openReceipts} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function DecisionBlock({ section, openReceipts }: { section: BriefSection; openReceipts: OpenReceiptsFn }) {
  const body = section.body ?? {};
  return (
    <div className="space-y-1.5">
      {section.heading && <SectionHeading>{section.heading}</SectionHeading>}
      <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
        <div className="text-[13.5px] font-medium text-foreground">
          {body.decision ?? ""}
          <ReceiptsChip receipts={body.receipts ?? section.receipts} sectionLabel={section.heading} onOpen={openReceipts} />
        </div>
        {body.why && <div className="mt-1 text-[12px] text-muted-foreground">Why: {body.why}</div>}
      </div>
    </div>
  );
}

function ReceiptsBlock({ section, openReceipts }: { section: BriefSection; openReceipts: OpenReceiptsFn }) {
  const items: any[] = Array.isArray(section.body) ? section.body : [];
  return (
    <div className="space-y-1.5">
      {section.heading && <SectionHeading>{section.heading}</SectionHeading>}
      <div className="rounded-md border border-border/50 bg-background/40 p-2">
        <ul className="space-y-1 text-[11.5px] font-mono text-foreground/80">
          {items.map((it, i) => (
            <li key={i} className="truncate">{typeof it === "string" ? it : (it?.text ?? JSON.stringify(it))}</li>
          ))}
        </ul>
        {section.receipts && section.receipts.length > 0 && (
          <div className="mt-1.5">
            <ReceiptsChip receipts={section.receipts} sectionLabel={section.heading} onOpen={openReceipts} />
          </div>
        )}
      </div>
    </div>
  );
}

function PullQuoteBlock({ section }: { section: BriefSection }) {
  const { text } = extractText(section.body);
  return (
    <div className="space-y-1.5">
      {section.heading && <SectionHeading>{section.heading}</SectionHeading>}
      <blockquote className="flex gap-2 border-l-2 border-primary/50 pl-3 text-[13.5px] italic text-foreground/85">
        <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/60" />
        <span>{text}</span>
      </blockquote>
    </div>
  );
}

function renderSection(section: BriefSection, openReceipts: OpenReceiptsFn) {
  switch (section.kind) {
    case "list":      return <ListBlock section={section} openReceipts={openReceipts} />;
    case "timeline":  return <TimelineBlock section={section} openReceipts={openReceipts} />;
    case "decision":  return <DecisionBlock section={section} openReceipts={openReceipts} />;
    case "receipts":  return <ReceiptsBlock section={section} openReceipts={openReceipts} />;
    case "pull_quote":return <PullQuoteBlock section={section} />;
    case "prose":
    default:          return <ProseBlock section={section} openReceipts={openReceipts} />;
  }
}

export function BriefRenderer({ brief }: { brief: Brief }) {
  const [drawer, setDrawer] = useState<{ refs: BriefGrounding[]; label?: string } | null>(null);
  const openReceipts: OpenReceiptsFn = (refs, label) => setDrawer({ refs, label });

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
            <span className="mx-1 inline-flex items-center gap-0.5 rounded-full bg-muted/40 px-1.5 py-0.5 text-[9.5px] text-muted-foreground ring-1 ring-border/50">
              <ScrollText className="h-2.5 w-2.5" /> receipts
            </span>
            chip to see the source items.
          </p>
        </header>

        <div className="space-y-4">
          {brief.sections.map((s) => (
            <div key={s.id}>{renderSection(s, openReceipts)}</div>
          ))}
        </div>

        {brief.appendix_receipts && brief.appendix_receipts.length > 0 && (
          <div className="space-y-1.5 border-t border-border/40 pt-3">
            <SectionHeading>Receipt appendix</SectionHeading>
            <ul className="space-y-0.5 text-[11px] font-mono text-muted-foreground">
              {brief.appendix_receipts.map((r, i) => (
                <li key={i} className="truncate">
                  {r.kind}:{r.id?.slice(0, 8) ?? ""} — {r.label ?? ""}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => openReceipts(brief.appendix_receipts, "Receipt appendix")}
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
      />
    </>
  );
}
