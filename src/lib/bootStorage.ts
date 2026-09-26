// bootStorage — the boot's memory of itself.
//
// bootSequence.ts stays pure (no IO); this is the one module allowed to touch
// localStorage for the boot. The intro writes through here too, so finishing
// the once-per-account intro never triggers a second ceremony on the same
// landing.

export const BOOT_AT_KEY = "vanta.boot.at";
export const BOOT_DAY_KEY = "vanta.boot.day";

export function localDay(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function readLastBoot(): { at: number | null; day: string | null } {
  try {
    const raw = localStorage.getItem(BOOT_AT_KEY);
    const at = raw ? Number(raw) : null;
    return {
      at: at != null && Number.isFinite(at) ? at : null,
      day: localStorage.getItem(BOOT_DAY_KEY),
    };
  } catch {
    return { at: null, day: null };
  }
}

export function recordBoot() {
  try {
    localStorage.setItem(BOOT_AT_KEY, String(Date.now()));
    localStorage.setItem(BOOT_DAY_KEY, localDay());
  } catch {
    /* a private window still gets its boot; it just forgets it happened */
  }
}
