// readCache — the last good read of a read-mostly room, kept on the device.
//
// Doctrine:
//   - A room opened with no signal shows what was last on record, never a
//     blank wall. The OfflineNote above the room says the read is held, and
//     the freshness line on the card says how old it is.
//   - Only read-mostly, non-sensitive reads opt in. Anything live or private
//     stays memory-only.
//   - A held read expires after a day — older than that it is a rumor, not a
//     record.

const PREFIX = "vanta.read_cache.v1.";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function readCached<T>(key: string): { data: T; at: number } | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: number; data?: T };
    if (typeof parsed.at !== "number" || Date.now() - parsed.at > MAX_AGE_MS) return null;
    if (parsed.data === undefined) return null;
    return { data: parsed.data as T, at: parsed.at };
  } catch {
    return null;
  }
}

export function writeCached<T>(key: string, data: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* A full device store loses the held read, never the live one. */
  }
}
