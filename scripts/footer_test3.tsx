import React from "react";
import { renderToFile, Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

const c = { pagePadding: 56, bodySize: 11, body: "#222", muted: "#888", rule: "#ddd" };
const s = StyleSheet.create({
  page: { paddingTop: c.pagePadding, paddingBottom: c.pagePadding, paddingHorizontal: c.pagePadding, fontFamily: "Helvetica", fontSize: c.bodySize, color: c.body, lineHeight: 1.5 },
  titlePage: { flexDirection: "column", justifyContent: "center", alignItems: "flex-start", flexGrow: 1 },
  footer: {
    position: "absolute", bottom: 18, left: c.pagePadding,
    width: 612 - c.pagePadding * 2,
    flexDirection: "row", justifyContent: "space-between",
    borderTopWidth: 1, borderTopColor: c.rule, paddingTop: 6,
  },
  footerL: { fontSize: 8, color: c.muted },
  footerR: { fontSize: 8, color: c.muted },
});

const Doc = () => (
  <Document>
    <Page size="LETTER" style={s.page}>
      <View style={s.titlePage}>
        <Text>Title page body</Text>
      </View>
      <View style={s.footer} fixed>
        <Text style={s.footerL}>FOOTER_COVER</Text>
        <Text style={s.footerR} render={({pageNumber, totalPages}) => `${pageNumber} / ${totalPages}`} />
      </View>
    </Page>
  </Document>
);
renderToFile(<Doc/>, "/tmp/ft3.pdf").then(()=>console.log("ok"));
