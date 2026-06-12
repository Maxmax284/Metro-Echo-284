import React from "react";
import { renderToFile, Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { templateFor } from "../src/lib/briefTemplates";

const t = templateFor("internal_operator");
const c = t.pdf;
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
  "/tmp/ft4.pdf"
).then(()=>console.log("ok"));
