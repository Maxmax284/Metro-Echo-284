import React from "react";
import { renderToFile } from "@react-pdf/renderer";
import { BriefPdfDocument } from "../src/components/briefs/BriefPdfDocument";
const brief: any = {
  id: "x", title: "T", subtitle: "S", format: "operator", scope_kind: "project",
  scope_id: "p", signals_hash: "abc", generated_at: new Date().toISOString(),
  sections: [], grounding: {}, audience: "internal_operator",
};
renderToFile(<BriefPdfDocument brief={brief}/>, "/tmp/min.pdf")
  .then(()=>console.log("ok"))
  .catch(e=>console.error("ERR",e));
