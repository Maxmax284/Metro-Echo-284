// BriefPdfDocument — clean, premium PDF rendering of a Brief.
// Per-audience template variants (colors, typography, layout flags) come from
// `briefTemplates.ts` so the exported PDF visually matches the in-app preview.
import { Document, Page, View, Text, Link, StyleSheet } from "@react-pdf/renderer";
import type { Brief, BriefSection } from "@/lib/briefs";
import {
  buildFootnotes,
  footnoteAnchorId,
  footnoteSrcId,
  toSuperscript,
  type ClaimRef,
} from "@/lib/briefFootnotes";
import { templateFor } from "@/lib/briefTemplates";

function makeStyles(t: ReturnType<typeof templateFor>) {
  const c = t.pdf;
  return StyleSheet.create({
    page: {
      paddingTop: c.pagePadding, paddingBottom: c.pagePadding, paddingHorizontal: c.pagePadding,
      fontFamily: "Helvetica", fontSize: c.bodySize, color: c.body,
    },
    titlePage: { flexDirection: "column", justifyContent: "flex-start", alignItems: "flex-start", marginTop: 120 },
    kicker: { fontSize: 9, letterSpacing: 2, color: c.muted, textTransform: "uppercase", marginBottom: 14 },
    title: { fontFamily: c.titleFont, fontSize: c.titleSize, color: c.ink, marginBottom: 10, lineHeight: 1.2 },
    subtitle: { fontSize: 13, color: c.muted, marginBottom: 28 },
    accentRule: { width: 40, height: 2, backgroundColor: c.accent, marginBottom: 24 },
    meta: { fontSize: 9, color: c.muted },
    sectionHeading: { fontFamily: c.titleFont === "Times-Roman" ? "Times-Roman" : "Helvetica-Bold", fontSize: 14, color: c.ink, marginTop: 18, marginBottom: 6 },
    sectionKicker: { fontSize: 8, letterSpacing: 1.6, color: c.muted, textTransform: "uppercase", marginBottom: 4 },
    prose: { fontSize: c.bodySize, color: c.body, marginBottom: 4, lineHeight: 1.5 },
    listItem: { flexDirection: "row", marginBottom: 4 },
    bullet: { width: 10, color: c.muted },
    listText: { flex: 1, fontSize: c.bodySize, color: c.body, lineHeight: 1.5 },
    timelineRow: { marginBottom: 8, paddingLeft: 10, borderLeftWidth: 1, borderLeftColor: c.rule },
    timelineWhen: { fontSize: 8, color: c.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 },
    timelineWhat: { fontSize: c.bodySize, color: c.body },
    decisionBox: { borderWidth: 1, borderColor: c.accent, borderRadius: 4, backgroundColor: c.surface, padding: 10, marginVertical: 6 },
    decisionLabel: { fontSize: 11, fontFamily: "Helvetica-Bold", color: c.ink, marginBottom: 4 },
    decisionWhy: { fontSize: 10, color: c.muted },
    receipt: { fontSize: 9, fontFamily: "Courier", color: c.muted, marginBottom: 2 },
    tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: c.rule, paddingVertical: 3 },
    tableHead: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: c.accent, paddingVertical: 3 },
    tableCell: { flex: 1, fontSize: 8.5, color: c.body, paddingRight: 4 },
    tableCellHead: { flex: 1, fontSize: 8, fontFamily: "Helvetica-Bold", color: c.ink, textTransform: "uppercase", letterSpacing: 0.6, paddingRight: 4 },
    rosterCard: { borderWidth: 1, borderColor: c.rule, borderRadius: 4, padding: 8, marginBottom: 8 },
    rosterTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", color: c.ink },
    rosterSubtitle: { fontSize: 9, color: c.muted, marginBottom: 4 },
    rosterLine: { flexDirection: "row", marginBottom: 1.5 },
    rosterLabel: { width: 96, fontSize: 9, color: c.muted },
    rosterValue: { flex: 1, fontSize: 9.5, color: c.body },
    rosterNote: { fontSize: 8, color: c.muted },
    conflictRow: { borderLeftWidth: 2, borderLeftColor: c.accent, paddingLeft: 8, marginBottom: 6 },
    conflictWhat: { fontSize: 10, fontFamily: "Helvetica-Bold", color: c.ink },
    conflictReading: { fontSize: 9, color: c.body },
    conflictResolution: { fontSize: 8.5, color: c.muted, marginTop: 1 },
    pullQuote: { fontFamily: "Times-Italic", fontSize: 13, color: c.ink, borderLeftWidth: 2, borderLeftColor: c.accent, paddingLeft: 10, marginVertical: 8 },
    appendixTitle: { fontFamily: c.titleFont, fontSize: 16, color: c.ink, marginBottom: 10 },
    appendixIntro: { fontSize: 10, color: c.muted, marginBottom: 12 },
    footnoteRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 8 },
    footnoteNum: { width: 22, fontSize: 10, fontFamily: "Helvetica-Bold", color: c.accent, lineHeight: 1.4 },
    footnoteText: { fontSize: 10, color: c.body, lineHeight: 1.4 },
    footnoteMeta: { fontSize: 8, color: c.muted, lineHeight: 1.4, marginTop: 2 },

    fn: { fontSize: 8, color: c.accent, textDecoration: "none" },
    audienceChip: {
      alignSelf: "flex-start", marginBottom: 10, paddingVertical: 3, paddingHorizontal: 8,
      borderRadius: 10, backgroundColor: c.surface, color: c.ink, fontSize: 9,
      borderWidth: 1, borderColor: c.accent,
    },
    overallBox: {
      borderLeftWidth: 2, borderLeftColor: c.accent, backgroundColor: c.overallBg,
      padding: 10, marginBottom: 10,
    },
    overallText: { fontSize: 12, color: c.ink, lineHeight: 1.55 },
    footer: {
      position: "absolute", bottom: 18, left: c.pagePadding,
      width: 612 - c.pagePadding * 2, // LETTER width 612pt minus horizontal padding
      flexDirection: "row", justifyContent: "space-between",
      borderTopWidth: 1, borderTopColor: c.rule, paddingTop: 6,
    },
    footerLeft: { fontSize: 8, color: c.muted, flexShrink: 1, paddingRight: 12 },
    footerRight: { fontSize: 8, color: c.muted },
    watermark: {
      position: "absolute", top: 280, left: 0, right: 0,
      textAlign: "center", fontSize: 80, fontFamily: "Helvetica-Bold",
      color: c.accent, opacity: 0.08, letterSpacing: 6,
      transform: "rotate(-28deg)",
    },
    sigBlock: {
      marginTop: 24, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.rule,
    },
    sigRow: {
      flexDirection: "row", justifyContent: "space-between",
      marginTop: 32, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: c.ink,
    },
    sigLabel: { fontSize: 9, color: c.muted, marginTop: 4, textTransform: "uppercase", letterSpacing: 1 },
    sigName: { fontSize: 11, fontFamily: "Helvetica-Bold", color: c.ink, marginTop: 10 },
    sigRole: { fontSize: 9, color: c.muted, marginTop: 2 },
  });
}

export type PdfSignature = { name: string; role?: string | null };


/** Strip raw `{kind}:{id-hex}` receipt strings from claim text — used for
 * external (client) audiences where internal IDs must not leak. */
const RAW_RECEIPT_RE =
  /\s*\b(?:note|file|entity|commitment|action|message|capture|reminder|signal|finding|project)\s*[:#]\s*[A-Za-z0-9_-]{6,}\b\s*/g;
function sanitize(text: string, strip?: boolean): string {
  if (!strip || !text) return text;
  let out = text.replace(RAW_RECEIPT_RE, " ");
  // Tidy punctuation left over from the strip: collapse whitespace, fix
  // floating commas / periods, and recapitalise the first letter after a
  // sentence break when a receipt removal left a lowercase orphan.
  out = out
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,.;:])\1+/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
  out = out.replace(/([.!?]\s+)([a-z])/g, (_m, p, c) => p + c.toUpperCase());
  return out;
}

function bodyText(body: any, strip?: boolean): string {
  if (body == null) return "";
  if (typeof body === "string") return sanitize(body, strip);
  if (typeof body === "object" && typeof body.text === "string") return sanitize(body.text, strip);
  return sanitize(String(body), strip);
}

function Footnotes({ numbers, style }: { numbers: number[]; style: any }) {
  if (!numbers.length) return null;
  return (
    <Text>
      {numbers.map((n, i) => (
        <Text key={n}>
          {i === 0 ? " " : ""}
          <Link src={footnoteSrcId(n)} style={style}>{toSuperscript([n])}</Link>
        </Text>
      ))}
    </Text>
  );
}

function renderSection(section: BriefSection, claimMap: Map<string, ClaimRef>, styles: any, strip?: boolean) {
  const heading = section.heading ? <Text style={styles.sectionKicker}>{section.heading}</Text> : null;
  const getClaim = (key: string) => claimMap.get(`${section.id}:${key}`);

  switch (section.kind) {
    case "list": {
      const items: any[] = Array.isArray(section.body) ? section.body : [];
      return (
        <View key={section.id} wrap={false}>
          {heading}
          {items.map((it, i) => {
            const raw = typeof it === "string" ? it : (it?.text ?? it?.what ?? "");
            const text = sanitize(raw, strip);
            const claim = getClaim(String(i));
            return (
              <View key={i} style={styles.listItem}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.listText}>{text}<Footnotes numbers={claim?.numbers ?? []} style={styles.fn} /></Text>
              </View>
            );
          })}
        </View>
      );
    }
    case "timeline": {
      const items: any[] = Array.isArray(section.body) ? section.body : [];
      return (
        <View key={section.id}>
          {heading}
          {items.map((it, i) => {
            const claim = getClaim(String(i));
            return (
              <View key={i} style={styles.timelineRow} wrap={false}>
                <Text style={styles.timelineWhen}>{it.when ?? ""}</Text>
                <Text style={styles.timelineWhat}>{sanitize(it.what ?? "", strip)}<Footnotes numbers={claim?.numbers ?? []} style={styles.fn} /></Text>
              </View>
            );
          })}
        </View>
      );
    }
    case "decision": {
      const body = section.body ?? {};
      const claim = getClaim("decision");
      return (
        <View key={section.id} wrap={false}>
          {heading}
          <View style={styles.decisionBox}>
            <Text style={styles.decisionLabel}>{sanitize(body.decision ?? "", strip)}<Footnotes numbers={claim?.numbers ?? []} style={styles.fn} /></Text>
            {body.why ? <Text style={styles.decisionWhy}>Why: {sanitize(body.why, strip)}</Text> : null}
          </View>
        </View>
      );
    }
    case "receipts": {
      // External audiences do not show raw receipt lists.
      if (strip) return null;
      const items: any[] = Array.isArray(section.body) ? section.body : [];
      return (
        <View key={section.id}>
          {heading}
          {items.map((it, i) => (
            <Text key={i} style={styles.receipt}>
              {typeof it === "string" ? it : (it?.text ?? JSON.stringify(it))}
            </Text>
          ))}
        </View>
      );
    }
    case "field_table": {
      const body = section.body ?? {};
      const columns: string[] = Array.isArray(body.columns) ? body.columns : [];
      const rows: string[][] = Array.isArray(body.rows) ? body.rows : [];
      return (
        <View key={section.id}>
          {heading}
          <View style={styles.tableHead}>
            {columns.map((col, i) => <Text key={i} style={styles.tableCellHead}>{col}</Text>)}
          </View>
          {rows.map((row, i) => (
            <View key={i} style={styles.tableRow} wrap={false}>
              {row.map((cell, j) => <Text key={j} style={styles.tableCell}>{sanitize(cell ?? "", strip)}</Text>)}
            </View>
          ))}
        </View>
      );
    }
    case "roster_card": {
      const items: any[] = Array.isArray(section.body) ? section.body : [];
      return (
        <View key={section.id}>
          {heading}
          {items.map((it, i) => (
            <View key={i} style={styles.rosterCard} wrap={false}>
              <Text style={styles.rosterTitle}>{sanitize(it?.title ?? "", strip)}</Text>
              {it?.subtitle ? <Text style={styles.rosterSubtitle}>{sanitize(it.subtitle, strip)}</Text> : null}
              {(it?.lines ?? []).map((ln: any, j: number) => (
                <View key={j} style={styles.rosterLine}>
                  <Text style={styles.rosterLabel}>{ln?.label ?? ""}</Text>
                  <Text style={styles.rosterValue}>
                    {sanitize(ln?.value ?? "", strip)}
                    {ln?.note ? <Text style={styles.rosterNote}>{`  (${ln.note})`}</Text> : null}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      );
    }
    case "conflict_log": {
      const items: any[] = Array.isArray(section.body) ? section.body : [];
      return (
        <View key={section.id}>
          {heading}
          {items.map((it, i) => (
            <View key={i} style={styles.conflictRow} wrap={false}>
              <Text style={styles.conflictWhat}>{sanitize(it?.what ?? "", strip)}</Text>
              {(it?.readings ?? []).map((r: string, j: number) => (
                <Text key={j} style={styles.conflictReading}>• {sanitize(r, strip)}</Text>
              ))}
              {it?.resolution ? <Text style={styles.conflictResolution}>{sanitize(it.resolution, strip)}</Text> : null}
            </View>
          ))}
        </View>
      );
    }
    case "pull_quote": {
      const claim = getClaim("prose");
      return (
        <View key={section.id} wrap={false}>
          {heading}
          <Text style={styles.pullQuote}>{bodyText(section.body, strip)}<Footnotes numbers={claim?.numbers ?? []} style={styles.fn} /></Text>
        </View>
      );
    }
    case "prose":
    default: {
      const claim = getClaim("prose");
      return (
        <View key={section.id}>
          {heading}
          <Text style={styles.prose}>{bodyText(section.body, strip)}<Footnotes numbers={claim?.numbers ?? []} style={styles.fn} /></Text>
        </View>
      );
    }
  }
}

export function BriefPdfDocument({ brief }: { brief: Brief }) {
  const generated = new Date(brief.generated_at);
  const { footnotes, claims } = buildFootnotes(brief);
  const claimMap = new Map(claims.map((c) => [c.claimId, c]));

  const grounding: any = brief.grounding ?? {};
  const structured: any = grounding.structured ?? null;
  const audience: any = (brief as any).audience ?? grounding.audience ?? null;
  const template = templateFor(audience);
  const styles = makeStyles(template);
  const isProjectStructured = brief.scope_kind === "project" && structured?.blocks;
  const refIndex: Record<string, { kind: string; id: string; label: string }> =
    structured?.ref_index ?? {};
  const blocks = structured?.blocks ?? {};

  const watermark: string | null =
    typeof (grounding as any)?.watermark === "string" && (grounding as any).watermark.trim()
      ? String((grounding as any).watermark).trim().toUpperCase()
      : null;
  const signatures: PdfSignature[] = Array.isArray((grounding as any)?.signatures)
    ? ((grounding as any).signatures as any[])
        .map((s) => (typeof s === "string" ? { name: s } : { name: String(s?.name ?? "").trim(), role: s?.role ?? null }))
        .filter((s) => s.name.length > 0)
    : [];

  const renderCitations = (cites: string[] | undefined) => {
    if (!cites?.length) return null;
    return (
      <Text style={styles.receipt}>
        Sources: {cites.map((c) => refIndex[c]?.label ?? c).slice(0, 4).join(" · ")}
      </Text>
    );
  };


  const renderFootnotesAppendix = () => {
    if (!template.layout.footnotesAppendix || footnotes.ordered.length === 0) return null;
    return (
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.appendixTitle}>Source footnotes</Text>
        <Text style={styles.appendixIntro}>
          Each numbered entry is the exact item the matching claim was drawn from.
        </Text>
        {footnotes.ordered.map(({ n, ref }) => (
          <View key={n} id={footnoteAnchorId(n)} style={styles.footnoteRow} wrap={false}>
            <Text style={styles.footnoteNum}>{n}.</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.footnoteText}>
                {ref.label ?? `${ref.kind} ${ref.id?.slice(0, 8) ?? ""}`}
              </Text>
              <Text style={styles.footnoteMeta}>
                {ref.kind}{ref.id ? ` · ${ref.id.slice(0, 12)}` : ""}
              </Text>
            </View>
          </View>
        ))}
        <View style={styles.footer} fixed>
          <Text style={styles.footerLeft}>Echo · source footnotes</Text>
          <Text style={styles.footerRight} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    );
  };

  const labels = template.layout.labels;
  const strip = !!template.layout.stripRawReceipts;

  const sourcesAppendixInline = template.layout.receiptsFirst && footnotes.ordered.length > 0 ? (
    <View key="sources_lead" wrap={false}>
      <Text style={styles.sectionHeading}>Sources lead</Text>
      {footnotes.ordered.slice(0, 12).map(({ n, ref }) => (
        <Text key={n} style={styles.receipt}>
          {n}. {ref.label ?? `${ref.kind} ${ref.id?.slice(0, 8) ?? ""}`} · {ref.kind}
        </Text>
      ))}
    </View>
  ) : null;

  const overallBlock = blocks.overall_summary?.text ? (
    <View key="overall" wrap={false}>
      <Text style={styles.sectionKicker}>{labels.overall}</Text>
      <View style={styles.overallBox}>
        <Text style={styles.overallText}>{sanitize(blocks.overall_summary.text, strip)}</Text>
        {!strip && renderCitations(blocks.overall_summary.citations)}
      </View>
    </View>
  ) : null;

  const situationBlock = blocks.situation?.text ? (
    <View key="situation">
      <Text style={styles.sectionHeading}>{labels.situation}</Text>
      <Text style={styles.prose}>{sanitize(blocks.situation.text, strip)}</Text>
    </View>
  ) : null;

  const keyTopicsBlock = blocks.key_topics?.themes?.length ? (
    <View key="key_topics">
      <Text style={styles.sectionHeading}>{labels.keyTopics}</Text>
      {blocks.key_topics.themes.map((t: any, i: number) => (
        <View key={i} style={{ marginBottom: 8, padding: 8, backgroundColor: template.pdf.surface, borderRadius: 3 }} wrap={false}>
          <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", color: template.pdf.ink, marginBottom: 2 }}>{sanitize(t.title, strip)}</Text>
          <Text style={styles.prose}>{sanitize(t.summary, strip)}</Text>
          {!strip && renderCitations(t.citations)}
        </View>
      ))}
    </View>
  ) : null;

  const decisionsBlock = blocks.decisions?.bullets?.length ? (
    <View key="decisions">
      <Text style={styles.sectionHeading}>{labels.decisions}</Text>
      {blocks.decisions.bullets.map((b: any, i: number) => (
        <View key={i} style={styles.decisionBox} wrap={false}>
          <Text style={styles.decisionLabel}>{sanitize(b.text, strip)}</Text>
          {!strip && renderCitations(b.citations)}
        </View>
      ))}
    </View>
  ) : null;

  const risksBlock = !template.layout.hideRisks && blocks.risks?.bullets?.length ? (
    <View key="risks">
      <Text style={styles.sectionHeading}>{labels.risks}</Text>
      {blocks.risks.bullets.map((b: any, i: number) => (
        <View key={i} style={{ marginBottom: 6 }} wrap={false}>
          <View style={styles.listItem}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.listText}>{sanitize(b.text, strip)}</Text>
          </View>
          {!strip && b.citations?.length ? (
            <View style={{ paddingLeft: 10 }}>{renderCitations(b.citations)}</View>
          ) : null}
        </View>
      ))}
    </View>
  ) : null;

  const nextMoveBlock = blocks.next_move?.text ? (
    <View key="next_move" wrap={false}>
      <Text style={styles.sectionHeading}>{labels.nextMove}</Text>
      <View style={styles.decisionBox}>
        <Text style={styles.decisionLabel}>{sanitize(blocks.next_move.text, strip)}</Text>
        {!strip && renderCitations(blocks.next_move.citations)}
      </View>
    </View>
  ) : null;

  const blockMap: Record<string, React.ReactNode> = {
    overall: overallBlock,
    situation: situationBlock,
    key_topics: keyTopicsBlock,
    decisions: decisionsBlock,
    risks: risksBlock,
    next_move: nextMoveBlock,
  };
  const order =
    template.layout.sectionOrder ??
    (["overall", "situation", "key_topics", "decisions", "risks", "next_move"] as const);

  const footerLabel = template.layout.footerNote ?? `Echo · ${brief.title}`;

  const renderSignaturePage = () => {
    if (signatures.length === 0) return null;
    return (
      <Page size="LETTER" style={styles.page}>
        {watermark && <Text style={styles.watermark} fixed>{watermark}</Text>}
        <Text style={styles.appendixTitle}>Signature page</Text>
        <Text style={styles.appendixIntro}>
          By signing below each party acknowledges the terms of "{brief.title}".
          {watermark ? ` This copy is marked ${watermark} and is not for execution.` : ""}
        </Text>
        <View style={styles.sigBlock}>
          {signatures.map((s, i) => (
            <View key={i} wrap={false} style={{ marginBottom: 24 }}>
              <Text style={styles.sigName}>{s.name}</Text>
              {s.role ? <Text style={styles.sigRole}>{s.role}</Text> : null}
              <View style={styles.sigRow}>
                <Text style={{ fontSize: 9, color: template.pdf.muted }}>Signature</Text>
                <Text style={{ fontSize: 9, color: template.pdf.muted }}>Date</Text>
              </View>
              <Text style={styles.sigLabel}>Print name</Text>
            </View>
          ))}
        </View>
        <View style={styles.footer} fixed>
          <Text style={styles.footerLeft}>{footerLabel}</Text>
          <Text style={styles.footerRight} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    );
  };

  return (
    <Document title={brief.title} author="Echo" subject={`${brief.format} brief`}>
      {template.layout.coverPage && (
        <Page size="LETTER" style={styles.page}>
          {watermark && <Text style={styles.watermark} fixed>{watermark}</Text>}
          <View style={{ marginTop: 120 }}>
            <Text style={styles.audienceChip}>{template.label} · {template.tagline}</Text>
            <Text style={styles.kicker}>
              Echo · {brief.format.replace("_", " ")} · {brief.scope_kind}
            </Text>
            <Text style={styles.title}>{brief.title}</Text>
            {brief.subtitle ? <Text style={styles.subtitle}>{brief.subtitle}</Text> : null}
            <View style={styles.accentRule} />
            <Text style={styles.meta}>
              Generated {generated.toISOString().slice(0, 19).replace("T", " ")}
            </Text>
            {template.layout.showSignalsHash && (
              <Text style={styles.meta}>Signals hash · {brief.signals_hash.slice(0, 16)}</Text>
            )}
            {template.layout.footnotesAppendix && footnotes.ordered.length > 0 && (
              <Text style={[styles.meta, { marginTop: 8 }]}>
                Every superscript number links to a source in the appendix.
              </Text>
            )}
          </View>
          <View style={styles.footer} fixed>
            <Text style={styles.footerLeft}>{footerLabel}</Text>
            <Text style={styles.footerRight} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
          </View>
        </Page>
      )}

      <Page size="LETTER" style={styles.page}>
        {watermark && <Text style={styles.watermark} fixed>{watermark}</Text>}
        {!template.layout.coverPage && (
          <View style={{ marginBottom: 10 }}>
            <Text style={styles.audienceChip}>{template.label}</Text>
            <Text style={styles.title}>{brief.title}</Text>
            {brief.subtitle ? <Text style={styles.subtitle}>{brief.subtitle}</Text> : null}
          </View>
        )}

        {isProjectStructured ? (
          <>
            {sourcesAppendixInline}
            {order.map((k) => blockMap[k]).filter(Boolean)}
          </>
        ) : (
          <>
            <Text style={styles.sectionHeading}>Overview</Text>
            {brief.sections.map((s) => renderSection(s, claimMap, styles, strip))}
          </>
        )}

        <View style={styles.footer} fixed>
          <Text style={styles.footerLeft}>{footerLabel}</Text>
          <Text style={styles.footerRight} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      {renderSignaturePage()}
      {renderFootnotesAppendix()}
    </Document>
  );
}

