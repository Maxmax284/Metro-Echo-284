// BriefPdfDocument — clean, premium PDF rendering of a Brief.
// Each claim that carries receipts gets a superscript footnote number that
// links to a matching numbered entry in the Source footnotes appendix.
// Internal links use @react-pdf/renderer Link with src="#fn-N".
import { Document, Page, View, Text, Link, StyleSheet } from "@react-pdf/renderer";
import type { Brief, BriefSection } from "@/lib/briefs";
import {
  buildFootnotes,
  footnoteAnchorId,
  footnoteSrcId,
  toSuperscript,
  type ClaimRef,
} from "@/lib/briefFootnotes";

const COLORS = {
  ink: "#111418",
  body: "#2C3138",
  muted: "#7A8089",
  rule: "#E5E7EB",
  accent: "#3B82F6",
  surface: "#F8F9FB",
  overallBg: "#EEF4FF",
};

const AUDIENCE_PDF_LABEL: Record<string, string> = {
  me: "For me",
  internal_operator: "For internal operator",
  client: "For client",
  audit: "For audit",
  implementation: "For implementation",
  presentation: "For presentation",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 56, paddingBottom: 56, paddingHorizontal: 56,
    fontFamily: "Helvetica", fontSize: 11, color: COLORS.body, lineHeight: 1.5,
  },
  titlePage: { flexDirection: "column", justifyContent: "center", alignItems: "flex-start", height: "100%" },
  kicker: { fontSize: 9, letterSpacing: 2, color: COLORS.muted, textTransform: "uppercase", marginBottom: 14 },
  title: { fontFamily: "Times-Roman", fontSize: 28, color: COLORS.ink, marginBottom: 10, lineHeight: 1.2 },
  subtitle: { fontSize: 13, color: COLORS.muted, marginBottom: 28 },
  accentRule: { width: 40, height: 2, backgroundColor: COLORS.accent, marginBottom: 24 },
  meta: { fontSize: 9, color: COLORS.muted },
  sectionHeading: { fontFamily: "Times-Roman", fontSize: 14, color: COLORS.ink, marginTop: 18, marginBottom: 6 },
  sectionKicker: { fontSize: 8, letterSpacing: 1.6, color: COLORS.muted, textTransform: "uppercase", marginBottom: 4 },
  prose: { fontSize: 11, color: COLORS.body, marginBottom: 4 },
  listItem: { flexDirection: "row", marginBottom: 4 },
  bullet: { width: 10, color: COLORS.muted },
  listText: { flex: 1, fontSize: 11, color: COLORS.body },
  timelineRow: { marginBottom: 8, paddingLeft: 10, borderLeftWidth: 1, borderLeftColor: COLORS.rule },
  timelineWhen: { fontSize: 8, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 },
  timelineWhat: { fontSize: 11, color: COLORS.body },
  decisionBox: { borderWidth: 1, borderColor: COLORS.accent, borderRadius: 4, backgroundColor: COLORS.surface, padding: 10, marginVertical: 6 },
  decisionLabel: { fontSize: 11, fontFamily: "Helvetica-Bold", color: COLORS.ink, marginBottom: 4 },
  decisionWhy: { fontSize: 10, color: COLORS.muted },
  receipt: { fontSize: 9, fontFamily: "Courier", color: COLORS.muted, marginBottom: 2 },
  pullQuote: { fontFamily: "Times-Italic", fontSize: 13, color: COLORS.ink, borderLeftWidth: 2, borderLeftColor: COLORS.accent, paddingLeft: 10, marginVertical: 8 },
  appendixTitle: { fontFamily: "Times-Roman", fontSize: 16, color: COLORS.ink, marginBottom: 10 },
  appendixIntro: { fontSize: 10, color: COLORS.muted, marginBottom: 12 },
  footnoteRow: { flexDirection: "row", marginBottom: 6 },
  footnoteNum: { width: 22, fontSize: 10, fontFamily: "Helvetica-Bold", color: COLORS.accent },
  footnoteText: { flex: 1, fontSize: 10, color: COLORS.body },
  footnoteMeta: { fontSize: 8, color: COLORS.muted, marginTop: 1 },
  fn: { fontSize: 8, color: COLORS.accent, textDecoration: "none" },
  footer: {
    position: "absolute", bottom: 24, left: 56, right: 56,
    flexDirection: "row", justifyContent: "space-between",
    fontSize: 8, color: COLORS.muted, borderTopWidth: 1, borderTopColor: COLORS.rule, paddingTop: 6,
  },
});

function bodyText(body: any): string {
  if (body == null) return "";
  if (typeof body === "string") return body;
  if (typeof body === "object" && typeof body.text === "string") return body.text;
  return String(body);
}

function Footnotes({ numbers }: { numbers: number[] }) {
  if (!numbers.length) return null;
  // Render each number as its own Link so each is independently clickable.
  return (
    <Text>
      {numbers.map((n, i) => (
        <Text key={n}>
          {i === 0 ? " " : ""}
          <Link src={footnoteSrcId(n)} style={styles.fn}>{toSuperscript([n])}</Link>
        </Text>
      ))}
    </Text>
  );
}

function renderSection(section: BriefSection, claimMap: Map<string, ClaimRef>) {
  const heading = section.heading ? <Text style={styles.sectionKicker}>{section.heading}</Text> : null;
  const getClaim = (key: string) => claimMap.get(`${section.id}:${key}`);

  switch (section.kind) {
    case "list": {
      const items: any[] = Array.isArray(section.body) ? section.body : [];
      return (
        <View key={section.id} wrap={false}>
          {heading}
          {items.map((it, i) => {
            const text = typeof it === "string" ? it : (it?.text ?? it?.what ?? "");
            const claim = getClaim(String(i));
            return (
              <View key={i} style={styles.listItem}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.listText}>{text}<Footnotes numbers={claim?.numbers ?? []} /></Text>
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
                <Text style={styles.timelineWhat}>{(it.what ?? "")}<Footnotes numbers={claim?.numbers ?? []} /></Text>
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
            <Text style={styles.decisionLabel}>{(body.decision ?? "")}<Footnotes numbers={claim?.numbers ?? []} /></Text>
            {body.why ? <Text style={styles.decisionWhy}>Why: {body.why}</Text> : null}
          </View>
        </View>
      );
    }
    case "receipts": {
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
    case "pull_quote": {
      const claim = getClaim("prose");
      return (
        <View key={section.id} wrap={false}>
          {heading}
          <Text style={styles.pullQuote}>{bodyText(section.body)}<Footnotes numbers={claim?.numbers ?? []} /></Text>
        </View>
      );
    }
    case "prose":
    default: {
      const claim = getClaim("prose");
      return (
        <View key={section.id}>
          {heading}
          <Text style={styles.prose}>{bodyText(section.body)}<Footnotes numbers={claim?.numbers ?? []} /></Text>
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
  const audience: string | null = (brief as any).audience ?? grounding.audience ?? null;
  const audienceLabel = audience ? (AUDIENCE_PDF_LABEL[audience] ?? null) : null;
  const isProjectStructured = brief.scope_kind === "project" && structured?.blocks;
  const refIndex: Record<string, { kind: string; id: string; label: string }> =
    structured?.ref_index ?? {};
  const blocks = structured?.blocks ?? {};

  const renderCitations = (cites: string[] | undefined) => {
    if (!cites?.length) return null;
    return (
      <Text style={styles.receipt}>
        Sources: {cites.map((c) => refIndex[c]?.label ?? c).slice(0, 4).join(" · ")}
      </Text>
    );
  };

  return (
    <Document title={brief.title} author="Vanta" subject={`${brief.format} brief`}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.titlePage}>
          <Text style={styles.kicker}>
            Vanta · {brief.format.replace("_", " ")} · {brief.scope_kind}
            {audienceLabel ? ` · ${audienceLabel}` : ""}
          </Text>
          <Text style={styles.title}>{brief.title}</Text>
          {brief.subtitle ? <Text style={styles.subtitle}>{brief.subtitle}</Text> : null}
          <View style={styles.accentRule} />
          <Text style={styles.meta}>
            Generated {generated.toISOString().slice(0, 19).replace("T", " ")}
          </Text>
          <Text style={styles.meta}>Signals hash · {brief.signals_hash.slice(0, 16)}</Text>
          {footnotes.ordered.length > 0 && (
            <Text style={[styles.meta, { marginTop: 8 }]}>
              Every superscript number links to a source in the appendix.
            </Text>
          )}
        </View>
        <View style={styles.footer} fixed>
          <Text>Vanta · operational brief</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      <Page size="LETTER" style={styles.page}>
        {isProjectStructured ? (
          <>
            {blocks.overall_summary?.text && (
              <View wrap={false}>
                <Text style={styles.sectionKicker}>Overall summary</Text>
                <View style={{ borderLeftWidth: 2, borderLeftColor: COLORS.accent, backgroundColor: COLORS.overallBg, padding: 10, marginBottom: 10 }}>
                  <Text style={{ fontSize: 12, color: COLORS.ink, lineHeight: 1.55 }}>
                    {blocks.overall_summary.text}
                  </Text>
                  {renderCitations(blocks.overall_summary.citations)}
                </View>
              </View>
            )}
            {blocks.situation?.text && (
              <View>
                <Text style={styles.sectionHeading}>Situation</Text>
                <Text style={styles.prose}>{blocks.situation.text}</Text>
              </View>
            )}
            {blocks.key_topics?.themes?.length ? (
              <View>
                <Text style={styles.sectionHeading}>Key topics</Text>
                {blocks.key_topics.themes.map((t: any, i: number) => (
                  <View key={i} style={{ marginBottom: 8, padding: 8, backgroundColor: COLORS.surface, borderRadius: 3 }} wrap={false}>
                    <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", color: COLORS.ink, marginBottom: 2 }}>{t.title}</Text>
                    <Text style={styles.prose}>{t.summary}</Text>
                    {renderCitations(t.citations)}
                  </View>
                ))}
              </View>
            ) : null}
            {blocks.decisions?.bullets?.length ? (
              <View>
                <Text style={styles.sectionHeading}>Decisions / known requirements</Text>
                {blocks.decisions.bullets.map((b: any, i: number) => (
                  <View key={i} style={styles.decisionBox} wrap={false}>
                    <Text style={styles.decisionLabel}>{b.text}</Text>
                    {renderCitations(b.citations)}
                  </View>
                ))}
              </View>
            ) : null}
            {blocks.risks?.bullets?.length ? (
              <View>
                <Text style={styles.sectionHeading}>Risks / questions</Text>
                {blocks.risks.bullets.map((b: any, i: number) => (
                  <View key={i} style={styles.listItem} wrap={false}>
                    <Text style={styles.bullet}>•</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listText}>{b.text}</Text>
                      {renderCitations(b.citations)}
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
            {blocks.next_move?.text ? (
              <View wrap={false}>
                <Text style={styles.sectionHeading}>Next move</Text>
                <View style={styles.decisionBox}>
                  <Text style={styles.decisionLabel}>{blocks.next_move.text}</Text>
                  {renderCitations(blocks.next_move.citations)}
                </View>
              </View>
            ) : null}
            {/* TODO: canvas snapshot — slot for Slice 6+ */}
          </>
        ) : (
          <>
            <Text style={styles.sectionHeading}>Overview</Text>
            {brief.sections.map((s) => renderSection(s, claimMap))}
          </>
        )}

        <View style={styles.footer} fixed>
          <Text>Vanta · {brief.title}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      {footnotes.ordered.length > 0 && (
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
            <Text>Vanta · source footnotes</Text>
            <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
          </View>
        </Page>
      )}
    </Document>
  );
}
