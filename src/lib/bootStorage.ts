// bootStorage — the boot's memory of itself.
//
// bootSequence.ts stays pure (no IO); this is the one module allowed to touch
// localStorage for the boot. The intro writes through here too, so finishing
// the once-per-account intro never triggers a second ceremony on the same
// landing.

export const BOOT_AT_KEY = "vanta.boot.at";
export const BOOT_DAY_KEY = "vanta.boot.day";
/* Separate from the completed-boot record: the day is claimed the moment a
   full boot is DECIDED, before the boot component necessarily mounts (the
   intro gate can still be loading). decideBoot never reads this key, so a
   claim can't demote the boot it's claiming for. */
export const BOOT_CLAIM_KEY = "vanta.boot.claimed";

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

/* A full roll call claims the day the moment it is decided — synchronously,
   at the shell's first render — so the claim always lands before any room
   effect that would lift the dawn shutter behind the cover, even while the
   boot itself is still waiting behind the intro gate. The boot's own lift
   is that day's shutter moment (see ceremonyGate). Unlike recordBoot, the
   last-boot clock stays untouched: a claimed day must not read as a
   completed boot. */
export function claimBootDay() {
  try {
    localStorage.setItem(BOOT_CLAIM_KEY, localDay());
  } catch {
    /* private window — the shutter simply keeps its own counsel */
  }
}

export function readBootClaim(): string | null {
  try {
    return localStorage.getItem(BOOT_CLAIM_KEY);
  } catch {
    return null;
  }
}
