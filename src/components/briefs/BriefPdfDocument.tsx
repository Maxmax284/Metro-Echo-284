// BriefPdfDocument — clean, premium PDF rendering of a Brief.
// Letter size. Sans body, serif headings, single accent. No emojis.
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { Brief, BriefSection } from "@/lib/briefs";

const COLORS = {
  ink: "#111418",
  body: "#2C3138",
  muted: "#7A8089",
  rule: "#E5E7EB",
  accent: "#3B82F6",
  surface: "#F8F9FB",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 56,
    paddingBottom: 56,
    paddingHorizontal: 56,
    fontFamily: "Helvetica",
    fontSize: 11,
    color: COLORS.body,
    lineHeight: 1.5,
  },
  titlePage: {
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "flex-start",
    height: "100%",
  },
  kicker: {
    fontSize: 9,
    letterSpacing: 2,
    color: COLORS.muted,
    textTransform: "uppercase",
    marginBottom: 14,
  },
  title: {
    fontFamily: "Times-Roman",
    fontSize: 28,
    color: COLORS.ink,
    marginBottom: 10,
    lineHeight: 1.2,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.muted,
    marginBottom: 28,
  },
  accentRule: {
    width: 40, height: 2, backgroundColor: COLORS.accent, marginBottom: 24,
  },
  meta: { fontSize: 9, color: COLORS.muted },
  sectionHeading: {
    fontFamily: "Times-Roman",
    fontSize: 14,
    color: COLORS.ink,
    marginTop: 18,
    marginBottom: 6,
  },
  sectionKicker: {
    fontSize: 8,
    letterSpacing: 1.6,
    color: COLORS.muted,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  prose: { fontSize: 11, color: COLORS.body, marginBottom: 4 },
  listItem: { flexDirection: "row", marginBottom: 4 },
  bullet: { width: 10, color: COLORS.muted },
  listText: { flex: 1, fontSize: 11, color: COLORS.body },
  timelineRow: { marginBottom: 8, paddingLeft: 10, borderLeftWidth: 1, borderLeftColor: COLORS.rule },
  timelineWhen: { fontSize: 8, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 },
  timelineWhat: { fontSize: 11, color: COLORS.body },
  decisionBox: {
    borderWidth: 1, borderColor: COLORS.accent, borderRadius: 4,
    backgroundColor: COLORS.surface, padding: 10, marginVertical: 6,
  },
  decisionLabel: { fontSize: 11, fontFamily: "Helvetica-Bold", color: COLORS.ink, marginBottom: 4 },
  decisionWhy: { fontSize: 10, color: COLORS.muted },
  receipt: { fontSize: 9, fontFamily: "Courier", color: COLORS.muted, marginBottom: 2 },
  pullQuote: {
    fontFamily: "Times-Italic", fontSize: 13, color: COLORS.ink,
    borderLeftWidth: 2, borderLeftColor: COLORS.accent, paddingLeft: 10, marginVertical: 8,
  },
  appendixTitle: {
    fontFamily: "Times-Roman", fontSize: 16, color: COLORS.ink, marginBottom: 10,
  },
  footer: {
    position: "absolute", bottom: 24, left: 56, right: 56,
    flexDirection: "row", justifyContent: "space-between",
    fontSize: 8, color: COLORS.muted,
    borderTopWidth: 1, borderTopColor: COLORS.rule, paddingTop: 6,
  },
});

function renderSection(section: BriefSection) {
  const heading = section.heading ? (
    <Text style={styles.sectionKicker}>{section.heading}</Text>
  ) : null;

  switch (section.kind) {
    case "list": {
      const items: string[] = Array.isArray(section.body) ? section.body : [];
      return (
        <View key={section.id} wrap={false}>
          {heading}
          {items.map((it, i) => (
            <View key={i} style={styles.listItem}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.listText}>{it}</Text>
            </View>
          ))}
        </View>
      );
    }
    case "timeline": {
      const items: { when?: string; what?: string }[] = Array.isArray(section.body) ? section.body : [];
      return (
        <View key={section.id}>
          {heading}
          {items.map((it, i) => (
            <View key={i} style={styles.timelineRow} wrap={false}>
              <Text style={styles.timelineWhen}>{it.when ?? ""}</Text>
              <Text style={styles.timelineWhat}>{it.what ?? ""}</Text>
            </View>
          ))}
        </View>
      );
    }
    case "decision": {
      const body = section.body ?? {};
      return (
        <View key={section.id} wrap={false}>
          {heading}
          <View style={styles.decisionBox}>
            <Text style={styles.decisionLabel}>{body.decision ?? ""}</Text>
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
              {typeof it === "string" ? it : JSON.stringify(it)}
            </Text>
          ))}
        </View>
      );
    }
    case "pull_quote":
      return (
        <View key={section.id} wrap={false}>
          {heading}
          <Text style={styles.pullQuote}>{String(section.body ?? "")}</Text>
        </View>
      );
    case "prose":
    default:
      return (
        <View key={section.id}>
          {heading}
          <Text style={styles.prose}>{String(section.body ?? "")}</Text>
        </View>
      );
  }
}

export function BriefPdfDocument({ brief }: { brief: Brief }) {
  const generated = new Date(brief.generated_at);
  return (
    <Document
      title={brief.title}
      author="Vanta"
      subject={`${brief.format} brief`}
    >
      {/* Title page */}
      <Page size="LETTER" style={styles.page}>
        <View style={styles.titlePage}>
          <Text style={styles.kicker}>
            Vanta · {brief.format.replace("_", " ")} · {brief.scope_kind}
          </Text>
          <Text style={styles.title}>{brief.title}</Text>
          {brief.subtitle ? <Text style={styles.subtitle}>{brief.subtitle}</Text> : null}
          <View style={styles.accentRule} />
          <Text style={styles.meta}>
            Generated {generated.toISOString().slice(0, 19).replace("T", " ")}
          </Text>
          <Text style={styles.meta}>Signals hash · {brief.signals_hash.slice(0, 16)}</Text>
        </View>
        <View style={styles.footer} fixed>
          <Text>Vanta · operational brief</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      {/* Body */}
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.sectionHeading}>Overview</Text>
        {brief.sections.map(renderSection)}

        <View style={styles.footer} fixed>
          <Text>Vanta · {brief.title}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      {/* Appendix */}
      {brief.appendix_receipts && brief.appendix_receipts.length > 0 && (
        <Page size="LETTER" style={styles.page}>
          <Text style={styles.appendixTitle}>Receipt appendix</Text>
          {brief.appendix_receipts.map((r, i) => (
            <Text key={i} style={styles.receipt}>
              {r.kind}:{r.id?.slice(0, 8) ?? ""} — {r.label ?? ""}
            </Text>
          ))}
          <View style={styles.footer} fixed>
            <Text>Vanta · receipts</Text>
            <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
          </View>
        </Page>
      )}
    </Document>
  );
}
