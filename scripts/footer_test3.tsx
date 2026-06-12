import React from "react";
import { renderToFile, Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

const c = { pagePadding: 56 };
const s = StyleSheet.create({
  page: { paddingTop: c.pagePadding, paddingBottom: c.pagePadding, paddingHorizontal: c.pagePadding, fontFamily: "Helvetica" },
  titlePage: { flexDirection: "column", justifyContent: "center", alignItems: "flex-start" },
  footer: {
    position: "absolute", bottom: 18, left: c.pagePadding,
    width: 612 - c.pagePadding * 2,
    flexDirection: "row", justifyContent: "space-between",
    borderTopWidth: 1, borderTopColor: "#ddd", paddingTop: 6,
  },
});

const Doc = () => (
  <Document>
    <Page size="LETTER" style={s.page}>
      <View style={s.titlePage}>
        <Text>Title</Text>
      </View>
      <View style={s.footer} fixed>
        <Text style={{fontSize: 8, color: "#888"}}>FOOTER_X</Text>
        <Text style={{fontSize: 8, color: "#888"}} render={({pageNumber}) => `${pageNumber}`} />
      </View>
    </Page>
  </Document>
);
renderToFile(<Doc/>, "/tmp/ft3.pdf").then(()=>console.log("ok"));
