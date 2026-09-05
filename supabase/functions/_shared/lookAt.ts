// lookAt — the deliberate camera seam. Vanta looks at what the user points at,
// and only then.
//
// Doctrine:
//   - looking is not scanning. Nothing here runs on a timer, a sweep, or an
//     upload trigger. A person asks, once, and gets one look.
//   - looking is not reading. `pageRead` answers "what text is here?".
//     This answers "what am I looking at?" — perception, not OCR.
//   - looking is not acting. A look writes a receipt and returns words. It
//     never routes, files, stages, or executes anything.
//   - uncertainty survives. If the picture does not support a conclusion, the
//     answer says so instead of guessing.

export type LookIntentId = "identify" | "unusual" | "text" | "promises" | "amount";

export type LookIntent = {
  id: LookIntentId;
  /** Button copy. Plain English, verb first. */
  label: string;
  /** What Vanta says while it is looking. */
  looking: string;
  /** The question put to the model. Never shown to the user. */
  prompt: string;
};

/** The few things worth asking of a picture. Deliberate, one at a time. */
export const LOOK_INTENTS: LookIntent[] = [
  {
    id: "identify",
    label: "What is this?",
    looking: "Vanta is looking",
    prompt:
      "Say plainly what this is, in one or two sentences. Name the thing first. Then add only details that are actually visible. If you cannot tell what it is, say so and say what you can see.",
  },
  {
    id: "unusual",
    label: "Anything off?",
    looking: "Vanta is looking for anything off",
    prompt:
      "Look for anything that seems wrong, damaged, unsafe, or out of place. Name what you see and where. If nothing stands out, say plainly that nothing stands out. Do not invent problems.",
  },
  {
    id: "text",
    label: "Read what it says",
    looking: "Vanta is reading it",
    prompt:
      "Read the text in this picture, including handwriting. Return the text plainly, keeping line breaks. If there is no text, say there is no text.",
  },
  {
    id: "promises",
    label: "Find promises and dates",
    looking: "Vanta is looking for promises and dates",
    prompt:
      "Find anything in this picture that reads as a promise, a task, or a date. List each one on its own line, in the words used in the picture. If there are none, say there are none. Do not invent commitments.",
  },
  {
    id: "amount",
    label: "Read the total",
    looking: "Vanta is looking for the total",
    prompt:
      "If this is a receipt, bill, or invoice, report the merchant, the date, and the total with its currency exactly as printed. If a value is unreadable, say which one. If this is not a receipt, say what it looks like instead.",
  },
];

export function lookIntent(id: string | null | undefined): LookIntent {
  return LOOK_INTENTS.find((i) => i.id === id) ?? LOOK_INTENTS[0];
}

/** Plain-English state copy. No machine words. */
export const LOOK_STATES = {
  idle: "Camera is off until you open it.",
  captured: "Got the picture. Nothing has been read yet.",
  looking: "Vanta is looking",
  done: "Looked at it.",
  nothing: "Vanta could not make anything of it.",
} as const;

/** True when the answer is honest about not knowing. */
export function isUncertain(answer: string): boolean {
  const a = answer.toLowerCase();
  return (
    a.includes("cannot tell") ||
    a.includes("can't tell") ||
    a.includes("not sure") ||
    a.includes("hard to tell") ||
    a.includes("too blurry") ||
    a.includes("unclear")
  );
}

/** Only pictures can be looked at. Everything else goes through the file lane. */
export function isLookable(rec: { mime_type: string | null; filename: string }): boolean {
  const mime = (rec.mime_type ?? "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  const ext = rec.filename.split(".").pop()?.toLowerCase() ?? "";
  return ["png", "jpg", "jpeg", "webp", "heic", "heif", "gif", "avif"].includes(ext);
}

const VOICE =
  "You are Vanta looking at a picture a person deliberately showed you. Answer in plain English, short. Lead with the answer. Never describe your process, never mention models or providers, never guess past what the picture supports. If you are unsure, say so in the first sentence.";

export class LookError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "LookError";
  }
}

function toDataUrl(buf: Uint8Array, mime: string): string {
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return `data:${mime || "image/png"};base64,${btoa(bin)}`;
}

/**
 * One look at one picture. Returns words, nothing else — the caller owns the
 * receipt and any aftermath.
 */
export async function lookAtImage(
  blob: Blob,
  mime: string,
  intentId: string,
  question?: string | null,
): Promise<{ answer: string; uncertain: boolean; intent: LookIntentId }> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new LookError(401, "LOVABLE_API_KEY missing");
  const intent = lookIntent(intentId);
  const buf = new Uint8Array(await blob.arrayBuffer());
  const dataUrl = toDataUrl(buf, mime);
  const ask = question && question.trim().length > 0
    ? `${intent.prompt}\n\nThe person also asked: ${question.trim()}`
    : intent.prompt;

  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: VOICE },
        {
          role: "user",
          content: [
            { type: "text", text: ask },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new LookError(r.status, `look ${r.status}: ${t.slice(0, 200)}`);
  }
  const j = await r.json();
  const answer = String(j.choices?.[0]?.message?.content ?? "").trim();
  return { answer, uncertain: isUncertain(answer), intent: intent.id };
}
