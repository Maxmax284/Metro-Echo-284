// crossSourceAnswer — how a cross-source read gets said in Ask.
//
// Doctrine:
//   - Conclusion first. The sources sit behind it, named, never in front of it.
//   - Mail headers and file names only. Nothing here opens a body.
//   - If nothing on the board claims what came back, Echo says what it found
//     plainly instead of manufacturing a relationship.
//
// Pure module: no IO, no React.

import {
  readCrossSituations,
  worthSaying,
  type CrossFact,
  type CrossSituation,
} from "@/lib/crossSource";

export type AnchorRow = {
  id: string;
  kind: "calendar" | "commitment";
  title: string;
  at: string | null;
  location?: string | null;
  project?: string | null;
};

export type MailHit = {
  id: string;
  subject?: string | null;
  fromName?: string | null;
  date?: string | null;
  snippet?: string | null;
};

export type FileHit = {
  id: string;
  name?: string | null;
  modifiedAt?: string | null;
  link?: string | null;
};

export function mailFact(hit: MailHit, project?: string | null): CrossFact {
  return {
    id: hit.id,
    kind: "mail",
    title: String(hit.subject ?? "(no subject)"),
    at: hit.date ?? null,
    from: hit.fromName ?? null,
    /* Snippet only — the same 160-ish characters Gmail hands over in a list. */
    text: hit.snippet ?? null,
    project: project ?? null,
  };
}

export function fileFact(hit: FileHit, project?: string | null): CrossFact {
  return {
    id: hit.id,
    kind: "file",
    title: String(hit.name ?? "Untitled"),
    at: hit.modifiedAt ?? null,
    link: hit.link ?? null,
    project: project ?? null,
  };
}

export function anchorFact(row: AnchorRow): CrossFact {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    at: row.at,
    location: row.location ?? null,
    project: row.project ?? null,
  };
}

/** The lead situation, or nothing worth saying. */
export function leadSituation(input: {
  anchors: AnchorRow[];
  mail?: MailHit[];
  files?: FileHit[];
}): CrossSituation | null {
  const supporting = [
    ...(input.mail ?? []).map((m) => mailFact(m)),
    ...(input.files ?? []).map((f) => fileFact(f)),
  ];
  const reads = readCrossSituations({
    anchors: input.anchors.map(anchorFact),
    supporting,
  });
  return reads.find(worthSaying) ?? null;
}

/**
 * One answer: the conclusion, then where it came from, then anything that was
 * found and did not belong to it. `fallback` is what Echo would have said with
 * no situation to hang the results on.
 */
export function crossSourceReply(input: {
  anchors: AnchorRow[];
  mail?: MailHit[];
  files?: FileHit[];
  fallback: string;
}): { text: string; situation: CrossSituation | null } {
  const lead = leadSituation(input);
  if (!lead) return { text: input.fallback, situation: null };

  const usedIds = new Set(lead.links.map((l) => l.fact.id));
  const leftoverMail = (input.mail ?? []).filter((m) => !usedIds.has(m.id));
  const leftoverFiles = (input.files ?? []).filter((f) => !usedIds.has(f.id));

  const blocks: string[] = [lead.conclusion];

  if (lead.newAddress) blocks.push(`The address in that email reads **${lead.newAddress}**.`);
  if (lead.timeChanged) {
    blocks.push(
      "Nothing on your calendar has been changed — that came out of an email, so check it before you move anything.",
    );
  }

  blocks.push(["**Where that comes from**", ...lead.provenance.map((p) => `• ${p}`)].join("\n"));

  const rest = [
    ...leftoverMail.map((m) => `• **${m.subject ?? "(no subject)"}** — ${m.fromName ?? "someone"}`),
    ...leftoverFiles.map((f) => `• [${f.name ?? "file"}](${f.link ?? "#"})`),
  ];
  if (rest.length > 0) blocks.push(["**Also turned up**", ...rest.slice(0, 5)].join("\n"));

  return { text: blocks.join("\n\n"), situation: lead };
}
