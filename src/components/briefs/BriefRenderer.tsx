// BriefRenderer — calm, minimal in-app rendering of a Brief.
// Mirrors the section vocabulary used by BriefPdfDocument so the on-screen
// preview matches the exported PDF.
import { Card } from "@/components/ui/card";
import type { Brief, BriefSection } from "@/lib/briefs";
import { formatDistanceToNow } from "date-fns";
import { Quote } from "lucide-react";

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </div>
  );
}

function ProseBlock({ section }: { section: BriefSection }) {
  return (
    <div className="space-y-1.5">
      {section.heading && <SectionHeading>{section.heading}</SectionHeading>}
      <p className="text-[13.5px] leading-relaxed text-foreground/90">
        {String(section.body ?? "")}
      </p>
    </div>
  );
}

function ListBlock({ section }: { section: BriefSection }) {
  const items: string[] = Array.isArray(section.body) ? section.body : [];
  return (
    <div className="space-y-1.5">
      {section.heading && <SectionHeading>{section.heading}</SectionHeading>}
      <ul className="space-y-1 text-[13px] text-foreground/85">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-foreground/40" />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TimelineBlock({ section }: { section: BriefSection }) {
  const items: { when?: string; what?: string }[] = Array.isArray(section.body) ? section.body : [];
  return (
    <div className="space-y-1.5">
      {section.heading && <SectionHeading>{section.heading}</SectionHeading>}
      <ol className="space-y-2 border-l border-border/60 pl-3 text-[12.5px]">
        {items.map((it, i) => (
          <li key={i}>
            <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{it.when ?? ""}</div>
            <div className="text-foreground/90">{it.what ?? ""}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function DecisionBlock({ section }: { section: BriefSection }) {
  const body = section.body ?? {};
  return (
    <div className="space-y-1.5">
      {section.heading && <SectionHeading>{section.heading}</SectionHeading>}
      <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
        <div className="text-[13.5px] font-medium text-foreground">{body.decision ?? ""}</div>
        {body.why && (
          <div className="mt-1 text-[12px] text-muted-foreground">Why: {body.why}</div>
        )}
      </div>
    </div>
  );
}

function ReceiptsBlock({ section }: { section: BriefSection }) {
  const items: any[] = Array.isArray(section.body) ? section.body : [];
  return (
    <div className="space-y-1.5">
      {section.heading && <SectionHeading>{section.heading}</SectionHeading>}
      <div className="rounded-md border border-border/50 bg-background/40 p-2">
        <ul className="space-y-1 text-[11.5px] font-mono text-foreground/80">
          {items.map((it, i) => (
            <li key={i} className="truncate">{typeof it === "string" ? it : JSON.stringify(it)}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function PullQuoteBlock({ section }: { section: BriefSection }) {
  return (
    <div className="space-y-1.5">
      {section.heading && <SectionHeading>{section.heading}</SectionHeading>}
      <blockquote className="flex gap-2 border-l-2 border-primary/50 pl-3 text-[13.5px] italic text-foreground/85">
        <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/60" />
        <span>{String(section.body ?? "")}</span>
      </blockquote>
    </div>
  );
}

function renderSection(section: BriefSection) {
  switch (section.kind) {
    case "list": return <ListBlock section={section} />;
    case "timeline": return <TimelineBlock section={section} />;
    case "decision": return <DecisionBlock section={section} />;
    case "receipts": return <ReceiptsBlock section={section} />;
    case "pull_quote": return <PullQuoteBlock section={section} />;
    case "prose":
    default: return <ProseBlock section={section} />;
  }
}

export function BriefRenderer({ brief }: { brief: Brief }) {
  return (
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
          Drafted {formatDistanceToNow(new Date(brief.generated_at), { addSuffix: true })}
        </p>
      </header>

      <div className="space-y-4">
        {brief.sections.map((s) => (
          <div key={s.id}>{renderSection(s)}</div>
        ))}
      </div>

      {brief.appendix_receipts && brief.appendix_receipts.length > 0 && (
        <div className="space-y-1.5 border-t border-border/40 pt-3">
          <SectionHeading>Receipt appendix</SectionHeading>
          <ul className="space-y-0.5 text-[11px] font-mono text-muted-foreground">
            {brief.appendix_receipts.map((r, i) => (
              <li key={i} className="truncate">
                {r.kind}:{r.id.slice(0, 8)} — {r.label ?? ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
