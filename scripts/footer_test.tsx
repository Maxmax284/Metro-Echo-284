import React from "react";
import { renderToFile, Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

const s = StyleSheet.create({
  page: { padding: 50, fontFamily: "Helvetica", fontSize: 11 },
  footerA: { position: "absolute", bottom: 18, left: 50, right: 50, fontSize: 9, color: "#888", borderTopWidth: 1, borderTopColor: "#ddd", paddingTop: 6, flexDirection: "row", justifyContent: "space-between" },
  footerB: { position: "absolute", bottom: 18, left: 50, width: 512, fontSize: 9, color: "#888", borderTopWidth: 1, borderTopColor: "#ddd", paddingTop: 6, flexDirection: "row", justifyContent: "space-between" },
});

const Doc = () => (
  <Document>
    <Page size="LETTER" style={s.page}>
      <Text>Page A — footer uses left+right</Text>
      <View style={s.footerA} fixed>
        <Text>FOOTER_A_LEFT</Text>
        <Text render={({pageNumber}) => `pg ${pageNumber}`} />
      </View>
    </Page>
    <Page size="LETTER" style={s.page}>
      <Text>Page B — footer uses left+width</Text>
      <View style={s.footerB} fixed>
        <Text>FOOTER_B_LEFT</Text>
        <Text render={({pageNumber}) => `pg ${pageNumber}`} />
      </View>
    </Page>
  </Document>
);

renderToFile(<Doc/>, "/tmp/footer_test.pdf").then(()=>console.log("ok"));
