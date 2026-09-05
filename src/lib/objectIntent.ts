// Object intent — one way to say what a thing probably is, and what you can
// do with it. Ask, the inbox and Telegram all read this; none of them invents
// its own phrasing.
//
// Honesty rules: low confidence is said out loud ("but I'm not sure"), unknown
// types are called files, and a guess never pretends to be a read — the words
// say "looks like", never "is".

export type ObjectKind =
  | "receipt"
  | "invoice"
  | "contract"
  | "document"
  | "screenshot"
  | "photo"
  | "note"
  | "file";

export type ObjectIntent = {
  kind: ObjectKind;
  /** The voice line, e.g. "Looks like a receipt." */
  line: string;
  /** True when the detection itself said it's guessing. */
  unsure: boolean;
};

const KIND_WORD: Record<ObjectKind, string> = {
  receipt: "receipt",
  invoice: "invoice",
  contract: "contract",
  document: "document",
  screenshot: "screenshot",
  photo: "photo",
  note: "note",
  file: "file",
};

const RECEIPT_RE = /(receipt|expense|taxi|grab|7-?eleven|invoice|payment)/i;
const SCREENSHOT_RE = /(screenshot|screen shot|img_\d|whatsapp image)/i;
const CONTRACT_RE = /(contract|agreement|nda|terms)/i;

/** What a file probably is, from its detected type first, its name second. */
export function kindForObject(input: {
  filename?: string | null;
  detectedDocType?: string | null;
  mime?: string | null;
}): ObjectKind {
  const detected = (input.detectedDocType ?? "").toLowerCase();
  if (detected && detected !== "unknown") {
    if (detected.includes("receipt")) return "receipt";
    if (detected.includes("invoice")) return "invoice";
    if (detected.includes("contract") || detected.includes("agreement")) return "contract";
    if (detected.includes("screenshot")) return "screenshot";
    if (detected.includes("photo") || detected.includes("image")) return "photo";
    if (detected.includes("note")) return "note";
    return "document";
  }

  const name = (input.filename ?? "").trim();
  if (CONTRACT_RE.test(name)) return "contract";
  if (RECEIPT_RE.test(name)) return "receipt";
  if (SCREENSHOT_RE.test(name)) return "screenshot";

  const mime = (input.mime ?? "").toLowerCase();
  if (mime.startsWith("image/")) return "photo";
  if (name) return "file";
  return "file";
}

export function objectIntentFor(input: {
  filename?: string | null;
  detectedDocType?: string | null;
  mime?: string | null;
  confidence?: string | null;
}): ObjectIntent {
  const kind = kindForObject(input);
  const unsure = (input.confidence ?? "").toLowerCase() === "low";
  const word = KIND_WORD[kind];
  return {
    kind,
    unsure,
    line: unsure ? `Looks like a ${word}, but I'm not sure.` : `Looks like a ${word}.`,
  };
}

/** The offers a kind always carries. Surfaces may add more; none remove these. */
export function defaultOffersFor(kind: ObjectKind): string[] {
  switch (kind) {
    case "receipt":
    case "invoice":
      return ["Read the total", "File it", "Ask about it"];
    case "contract":
    case "document":
      return ["Summarize it", "File it", "Ask about it"];
    default:
      return ["File it", "Ask about it"];
  }
}
