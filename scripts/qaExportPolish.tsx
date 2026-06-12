// QA harness: render Operator + Client briefs to PDFs from a realistic fixture.
// Run with: bun scripts/qaExportPolish.tsx
import React from "react";
import { renderToFile } from "@react-pdf/renderer";
import { BriefPdfDocument } from "../src/components/briefs/BriefPdfDocument";
import type { Brief } from "../src/lib/briefs";

const baseGrounding = [
  { kind: "note", id: "note-7f2a4c91-aaaa", label: "Nikki — Lamai 06 Jun voice note" },
  { kind: "file", id: "file-3d51bb02-bbbb", label: "Lamai Q2 retention sheet" },
  { kind: "message", id: "msg-2891cc31-cccc", label: "Telegram thread — schedule shift" },
  { kind: "capture", id: "cap-fa9981ab-dddd", label: "Voice capture — equipment quote" },
  { kind: "commitment", id: "cmt-1188eedd-eeee", label: "Send retention plan by Fri" },
];

const refIndex = Object.fromEntries(baseGrounding.map((g) => [`${g.kind}:${g.id}`, g]));

const structured = {
  ref_index: refIndex,
  blocks: {
    overall_summary: {
      text:
        "Lamai Muay Thai is heading into Q3 with two pressing fronts: member retention is " +
        "softening for the August window, and the equipment refresh is now overdue. Nikki " +
        "wants a clean weekly rhythm before opening the second studio. note:note-7f2a4c91-aaaa " +
        "Most decisions are ready; what's missing is owner sign-off and a date on the floor work.",
      citations: ["note:note-7f2a4c91-aaaa", "file:file-3d51bb02-bbbb"],
    },
    situation: {
      text:
        "Retention dipped 9% month-over-month, driven mostly by the 18:00 evening cohort. " +
        "Equipment quote from Fairtex landed Monday; price is in range. " +
        "Schedule shift discussed on Telegram with the two head coaches — both aligned. " +
        "capture:cap-fa9981ab-dddd remains the canonical quote until a counter comes in.",
    },
    key_topics: {
      themes: [
        {
          title: "August retention plan",
          summary:
            "Roll out the buddy-week program in the first week of August. Coach Pim leads. " +
            "Comms via WhatsApp broadcast and front-desk reminder.",
          citations: ["note:note-7f2a4c91-aaaa", "commitment:cmt-1188eedd-eeee"],
        },
        {
          title: "Equipment refresh (Fairtex)",
          summary:
            "Mats, pads, and four heavy bags. Quote total 184k THB. Lead time 3 weeks from " +
            "deposit. Decision needs Nikki's sign-off; everything else is locked.",
          citations: ["file:file-3d51bb02-bbbb", "capture:cap-fa9981ab-dddd"],
        },
        {
          title: "Schedule shift — evenings",
          summary:
            "Move 18:00 technical class to 18:30 starting August. Pim and Boom both agreed " +
            "on Telegram. message:msg-2891cc31-cccc Members to be notified two weeks ahead.",
          citations: ["message:msg-2891cc31-cccc"],
        },
      ],
    },
    decisions: {
      bullets: [
        {
          text: "Approve Fairtex quote at 184k THB; deposit on 14 Jun.",
          citations: ["file:file-3d51bb02-bbbb"],
        },
        {
          text: "Lock 18:30 evening slot starting 4 August.",
          citations: ["message:msg-2891cc31-cccc"],
        },
        {
          text: "Run buddy-week program week of 5 August.",
          citations: ["note:note-7f2a4c91-aaaa"],
        },
      ],
    },
    risks: {
      bullets: [
        {
          text:
            "If Fairtex deposit slips past 21 Jun, equipment arrives after second studio opens. " +
            "finding:fnd-abcd1234ef would need re-triage.",
          citations: ["file:file-3d51bb02-bbbb"],
        },
        {
          text: "Evening shift may surprise long-term members; broadcast must go out by 18 Jul.",
          citations: ["message:msg-2891cc31-cccc"],
        },
      ],
    },
    next_move: {
      text:
        "Send Nikki the Fairtex approval line for one-tap sign-off, then draft the member " +
        "broadcast about the 18:30 shift. commitment:cmt-1188eedd-eeee tracks the broadcast.",
      citations: ["commitment:cmt-1188eedd-eeee", "note:note-7f2a4c91-aaaa"],
    },
  },
};

const brief: Brief = {
  id: "qa-brief-1",
  title: "Lamai Muay Thai — Q3 readiness",
  subtitle: "Retention, equipment, schedule — week of 12 Jun",
  format: "operator" as any,
  scope_kind: "project",
  scope_id: "project-lamai",
  signals_hash: "9f3c1e4a82d57b91ee0a6c2d1b4f8a0c",
  generated_at: new Date().toISOString(),
  sections: [],
  grounding: { structured } as any,
} as any;

async function run() {
  // Operator (internal_operator) variant
  const operator = { ...brief, audience: "internal_operator" } as any;
  await renderToFile(
    <BriefPdfDocument brief={operator} />,
    "/mnt/documents/qa-operator-brief.pdf",
  );
  // Client variant
  const client = {
    ...brief,
    audience: "client",
    title: "Lamai Muay Thai — quarterly update",
    subtitle: "Prepared for ownership review",
    format: "client" as any,
  } as any;
  await renderToFile(
    <BriefPdfDocument brief={client} />,
    "/mnt/documents/qa-client-brief.pdf",
  );
  console.log("OK");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
