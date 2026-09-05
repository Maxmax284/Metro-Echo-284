// crossrefPairs — noticing that two things you already sent belong together.
//
// Doctrine:
//   - deterministic only. No model runs here, ever. Reading two sources
//     together costs a model call, so it stays behind an explicit tap.
//   - a proposal is not a case. Nothing is written, nothing is filed.
//   - the reason must be a fact about the files, in plain English.
//
// Pure module: callers fetch rows, this decides whether there is anything
// worth proposing and how to say it.

export type ReadableSource = {
  id: string;
  filename: string;
  mime_type: string | null;
  source: string | null;
  created_at: string;
  /** True only when text actually came off it. Unread files never pair. */
  readable: boolean;
};

export type PairProposal = {
  /** Two to six sources, newest first. */
  fileIds: string[];
  filenames: string[];
  /** Why these were put next to each other. A fact, not a guess. */
  reason: string;
  /** Which signal matched, for the reveal. */
  signal: "same_arrival" | "same_name" | "same_kind";
  /** Newest source time, for the freshness strip. */
  at: string;
};

const WINDOW_MS = 6 * 60 * 60 * 1000; // one sitting, not one day
const MAX_SOURCES = 6;

/** Filename without extension, counters or timestamps — "invoice-2 (1).pdf" → "invoice". */
export function nameStem(filename: string): string {
  let stem = filename.toLowerCase().replace(/\.[a-z0-9]{1,5}$/i, "");
  /* Strip copy counters and timestamps off the end, however many are stacked. */
  for (let i = 0; i < 4; i++) {
    const next = stem.replace(/[\s_-]*\(\d+\)\s*$/, "").replace(/[\s_-]+\d+\s*$/, "");
    if (next === stem) break;
    stem = next;
  }
  return stem
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b\d{3,}\b/g, "")
    .trim();
}

/** The plain-words kind of a source, used only to say what both files are. */
export function kindOf(rec: ReadableSource): string {
  const mime = (rec.mime_type ?? "").toLowerCase();
  const ext = rec.filename.split(".").pop()?.toLowerCase() ?? "";
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "heic", "heif"].includes(ext)) return "picture";
  if (mime === "application/pdf" || ext === "pdf") return "PDF";
  if (["doc", "docx"].includes(ext)) return "document";
  if (["csv", "xls", "xlsx"].includes(ext)) return "spreadsheet";
  if (mime.startsWith("text/") || ["txt", "md"].includes(ext)) return "text file";
  return "file";
}

function label(rec: ReadableSource): string {
  return rec.filename || "an unnamed source";
}

function sourceWord(rec: ReadableSource): string {
  const s = (rec.source ?? "").toLowerCase();
  if (s === "telegram") return "Telegram";
  if (s === "conversation") return "Ask";
  if (s === "email") return "email";
  return "an upload";
}

/**
 * The one reading worth offering, or null. Called with recent readable sources,
 * newest first. Only one proposal is ever returned — Today gets one line, not a
 * pile of maybes.
 */
export function proposeReading(sources: ReadableSource[], now = Date.now()): PairProposal | null {
  const pool = sources.filter((s) => s.readable && s.filename).slice(0, 24);
  if (pool.length < 2) return null;

  const build = (group: ReadableSource[], signal: PairProposal["signal"], reason: string): PairProposal => {
    const picked = group.slice(0, MAX_SOURCES);
    return {
      fileIds: picked.map((s) => s.id),
      filenames: picked.map(label),
      reason,
      signal,
      at: picked.map((s) => s.created_at).sort().reverse()[0],
    };
  };

  /* Strongest signal first: the same name, whatever day they came. */
  const byStem = new Map<string, ReadableSource[]>();
  for (const s of pool) {
    const stem = nameStem(s.filename);
    if (stem.length < 4) continue;
    byStem.set(stem, [...(byStem.get(stem) ?? []), s]);
  }
  const named = [...byStem.entries()].find(([, g]) => g.length >= 2);
  if (named) {
    return build(named[1], "same_name", `${named[1].length} sources are named the same thing — "${named[0]}".`);
  }

  /* Then: arrived together, from the same door, in one sitting. */
  const recent = pool.filter((s) => now - new Date(s.created_at).getTime() <= WINDOW_MS);
  const byDoor = new Map<string, ReadableSource[]>();
  for (const s of recent) byDoor.set(s.source ?? "upload", [...(byDoor.get(s.source ?? "upload") ?? []), s]);
  const together = [...byDoor.values()].find((g) => g.length >= 2);
  if (together) {
    return build(
      together,
      "same_arrival",
      `${together.length} sources arrived from ${sourceWord(together[0])} within a few hours of each other.`,
    );
  }

  /* Weakest signal, and only for same-kind pages from the same door. */
  const byKind = new Map<string, ReadableSource[]>();
  for (const s of pool) {
    const key = `${kindOf(s)}::${s.source ?? "upload"}`;
    byKind.set(key, [...(byKind.get(key) ?? []), s]);
  }
  const sameKind = [...byKind.values()].find((g) => g.length >= 3);
  if (sameKind) {
    return build(
      sameKind,
      "same_kind",
      `${sameKind.length} ${kindOf(sameKind[0])}s came in from ${sourceWord(sameKind[0])} and none of them have been read together.`,
    );
  }

  return null;
}

/** The headline sentence for a proposal. Same words on every surface. */
export function proposalLine(p: PairProposal): string {
  const n = p.fileIds.length;
  return p.signal === "same_name"
    ? `${n} sources look like the same thing. Want them read side by side?`
    : `${n} sources could be read against each other.`;
}
