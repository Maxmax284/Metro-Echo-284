// Tactile helpers — pure, so the rules behind the stickers and stamps are testable.

export type StickerState = "ACTIVE" | "QUIET" | "NEEDS YOU" | "DONE";

/** Project sticker, from real fields only. Quiet = untouched for 14 days. */
export function stickerFor(
  p: { status?: string | null; updated_at?: string | null; needsYou?: boolean },
  now = Date.now(),
): StickerState {
  const s = (p.status ?? "active").toLowerCase();
  if (s === "done" || s === "archived" || s === "completed") return "DONE";
  if (p.needsYou) return "NEEDS YOU";
  const at = p.updated_at ? Date.parse(p.updated_at) : NaN;
  if (Number.isFinite(at) && now - at > 14 * 86_400_000) return "QUIET";
  return "ACTIVE";
}

/** Same id, same tilt, forever. Range −4°..+4°. */
export function stickerTilt(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 81) - 40) / 10;
}

/** A receipt only gets stamped if it landed after you last looked. */
export function isFreshReceipt(at: string | null | undefined, lastSeen: number | null): boolean {
  if (!at) return false;
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return false;
  return lastSeen != null && t > lastSeen;
}

const SEEN_KEY = "vanta:receipts-seen";
export function readReceiptsSeen(): number | null {
  try {
    const v = localStorage.getItem(SEEN_KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}
export function markReceiptsSeen(at = Date.now()) {
  try {
    localStorage.setItem(SEEN_KEY, String(at));
  } catch {
    /* private mode */
  }
}
