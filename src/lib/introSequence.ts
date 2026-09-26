// introSequence — the once-per-account welcome.
//
// The boot is a station announcement; the intro is the first-ever boarding.
// It runs exactly once per account — the server carries the flag, so the
// Google sign-in round trip (or a new device) can never bypass it or replay
// it. A per-device mirror only saves a fetch on later opens.
//
// Pure module: no IO, no React — the decision and the copy are testable.

/** localStorage mirror key prefix, per account id. */
export const INTRO_MIRROR_PREFIX = "vanta.intro.seen.";

export function introMirrorKey(userId: string): string {
  return `${INTRO_MIRROR_PREFIX}${userId}`;
}

/**
 * The intro is due only when no record says it ran. Any non-empty stamp on
 * the account means this person has boarded before.
 */
export function introDue(serverSeenAt: unknown): boolean {
  return !(typeof serverSeenAt === "string" && serverSeenAt.length > 0);
}

/** East Coast register: warm, dry, no exclamation marks. */
export const INTRO_COPY = {
  header: "First boarding",
  tag: "Runs once — skip any time",
  drum: "METRO ECHO",
  lead: "A situational companion. One brain, four rooms.",
  rooms: [
    { name: "Today", line: "The read on right now." },
    { name: "Work", line: "Desks for the doing." },
    { name: "Echo", line: "Talk it through." },
    { name: "Receipts", line: "Proof of everything." },
  ],
  rules: [
    "Capture never executes — nothing happens from a message alone.",
    "If Echo isn't sure, it says so. Nothing gets invented.",
  ],
  stepIn: "Step onto the platform",
  skip: "Skip the intro",
} as const;
