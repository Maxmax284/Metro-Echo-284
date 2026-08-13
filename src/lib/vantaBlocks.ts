// Structured response parser.
// Vanta answers in short, labelled blocks instead of walls of text. This turns
// the streamed assistant text into typed blocks the UI renders as cards,
// status rows, checklists and approval notices. It is intentionally forgiving:
// any text that doesn't match a known shape stays a plain paragraph, so a
// mid-stream partial answer always renders.

export type Tone = "neutral" | "good" | "warn" | "risk";

export type StatusItem = { label: string; value: string; tone: Tone };

export type VantaBlock =
  | { type: "summary"; text: string }
  | { type: "section"; title: string; tone: Tone; blocks: VantaBlock[] }
  | { type: "bullets"; items: { text: string; tone: Tone }[] }
  | { type: "status"; items: StatusItem[] }
  | { type: "approval"; title: string; detail: string }
  | { type: "next"; items: string[] }
  | { type: "text"; text: string };

const RISK_WORDS = /\b(risk|blocked|failed|overdue|breach|urgent|conflict|missing|broken|danger)\b/i;
const WARN_WORDS = /\b(stale|unclear|uncertain|pending|waiting|needs review|check|aging|maybe)\b/i;
const GOOD_WORDS = /\b(done|approved|complete|completed|resolved|clear|on track|saved|captured|healthy)\b/i;

export function toneOf(text: string): Tone {
  if (RISK_WORDS.test(text)) return "risk";
  if (WARN_WORDS.test(text)) return "warn";
  if (GOOD_WORDS.test(text)) return "good";
  return "neutral";
}

const stripMd = (s: string) =>
  s.replace(/\*\*/g, "").replace(/^#+\s*/, "").replace(/^[*_]|[*_]$/g, "").trim();

const isHeading = (line: string) =>
  /^#{1,4}\s+\S/.test(line) || /^\*\*[^*]{2,60}\*\*:?\s*$/.test(line) || /^[A-Z][A-Za-z '/]{2,40}:\s*$/.test(line);

// A short title-case line immediately followed by a bullet/status is a heading
// even without a colon ("Needs attention").
const isImplicitHeading = (line: string, next?: string) => {
  const t = line.trim();
  if (t.length > 40 || /[.!?,;]$/.test(t) || !/^[A-Z]/.test(t) || t.includes(":")) return false;
  if (!next) return false;
  return isBullet(next) || asStatus(next) !== null;
};

const isBullet = (line: string) => /^\s*(?:[-*•]|\d+[.)])\s+\S/.test(line);
const bulletText = (line: string) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim();

const APPROVAL_RE = /^(?:needs approval|approval needed|awaiting approval|to approve)\s*[:—-]?\s*(.*)$/i;
const NEXT_HEADING = /^(next|next steps?|what to do|do next|suggested next)$/i;

// "Label: value" where the label is short — a status row, not a sentence.
function asStatus(line: string): StatusItem | null {
  const m = /^([A-Za-z][A-Za-z0-9 _/'&-]{1,28}):\s+(.{1,120})$/.exec(line.trim());
  if (!m) return null;
  const value = m[2].trim();
  if (/[.!?]\s+\S/.test(value)) return null; // multi-sentence → prose
  return { label: stripMd(m[1]), value: stripMd(value), tone: toneOf(`${m[1]} ${value}`) };
}

/** Parse assistant text into renderable blocks. Never throws. */
export function parseVantaBlocks(raw: string): VantaBlock[] {
  const text = (raw ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  const lines = text.split("\n");
  const out: VantaBlock[] = [];
  let current: VantaBlock[] = out;
  let sawSummary = false;

  let bullets: { text: string; tone: Tone }[] = [];
  let statuses: StatusItem[] = [];
  let nexts: string[] = [];
  let para: string[] = [];
  let inNext = false;

  const flushBullets = () => {
    if (!bullets.length) return;
    if (inNext) nexts.push(...bullets.map((b) => b.text));
    else current.push({ type: "bullets", items: bullets });
    bullets = [];
  };
  const flushStatuses = () => {
    if (statuses.length) current.push({ type: "status", items: statuses });
    statuses = [];
  };
  const flushNext = () => {
    if (nexts.length) current.push({ type: "next", items: nexts });
    nexts = [];
  };
  const flushPara = () => {
    const t = para.join(" ").trim();
    para = [];
    if (!t) return;
    if (!sawSummary && current === out) {
      sawSummary = true;
      out.push({ type: "summary", text: t });
      return;
    }
    current.push({ type: "text", text: t });
  };
  const flushAll = () => {
    flushPara();
    flushBullets();
    flushStatuses();
    flushNext();
  };

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li].trimEnd();
    if (!line.trim()) {
      flushAll();
      continue;
    }

    const approval = APPROVAL_RE.exec(stripMd(line));
    if (approval) {
      flushAll();
      current.push({ type: "approval", title: "Needs your approval", detail: approval[1].trim() });
      continue;
    }

    if (isHeading(line) || isImplicitHeading(line, lines[li + 1])) {
      flushAll();
      const title = stripMd(line).replace(/:$/, "");
      if (NEXT_HEADING.test(title)) {
        inNext = true;
        current = out;
        continue;
      }
      inNext = false;
      const section: VantaBlock = { type: "section", title, tone: toneOf(title), blocks: [] };
      out.push(section);
      current = (section as Extract<VantaBlock, { type: "section" }>).blocks;
      continue;
    }

    if (isBullet(line)) {
      flushPara();
      flushStatuses();
      const t = stripMd(bulletText(line));
      const st = asStatus(t);
      if (st && !inNext) statuses.push(st);
      else bullets.push({ text: t, tone: toneOf(t) });
      continue;
    }

    const st = asStatus(line);
    if (st && !inNext) {
      flushPara();
      flushBullets();
      statuses.push(st);
      continue;
    }

    para.push(stripMd(line));
  }

  flushAll();
  return out;
}

/** True when the parsed shape is richer than a single paragraph. */
export function isStructured(blocks: VantaBlock[]): boolean {
  return blocks.some((b) => b.type !== "summary" && b.type !== "text");
}
