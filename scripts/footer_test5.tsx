import React from "react";
import { renderToFile, Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

const c = { pagePadding: 56, bodySize: 11, body: "#2C3138", muted: "#7A8089", rule: "#E5E7EB" };
const s = StyleSheet.create({
  page: { paddingTop: c.pagePadding, paddingBottom: c.pagePadding, paddingHorizontal: c.pagePadding, fontFamily: "Helvetica", fontSize: c.bodySize, color: c.body, lineHeight: 1.5 },
  footer: { position: "absolute", bottom: 18, left: c.pagePadding, width: 612 - c.pagePadding * 2, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: c.rule, paddingTop: 6 },
});

renderToFile(
  <Document>
    <Page size="LETTER" style={s.page}>
      <Text>hello</Text>
      <View style={s.footer} fixed>
        <Text style={{fontSize:8,color:c.muted}}>FOOTER</Text>
        <Text style={{fontSize:8,color:c.muted}} render={({pageNumber})=>`${pageNumber}`} />
      </View>
    </Page>
  </Document>,
  "/tmp/ft5.pdf"
).then(()=>console.log("ok"));
