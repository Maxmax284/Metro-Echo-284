// regions — the seeded region tier of the world identity.
//
// The climate band (regionTint.ts) paints every latitude procedurally. This
// table is the tier above it: a hand-seeded read of regions Echo actually
// knows, so Samui does not wear the same sky as Bangkok. The lookup is
// country-gated and name-matched — a pure table read, zero network, no
// per-region assets. index.css paints the archetype classes.
//
// Doctrine:
//   - Graceful nothing. A country with no rows, or a region with no row in a
//     seeded country, gets no claim — the band tint carries it instead.
//     Unmapped is not a failure; guessing confidently is.
//   - Country-gated. "Georgia" is not a region claim. The place row's own
//     country must vouch for the match.
//   - A stale fix does not repaint the world. The channel clears the
//     attribute; index.css falls back to the band and the home hues.
//   - A chosen skin (data-skin) hard-sets its own hues and always wins.
//   - City speaks before region: standing in Chiang Mai City inside Chiang
//     Mai province is one claim, not two.
//
// Pure module: no IO, no React.

export type RegionArchetype = "island-coastal" | "capital-metro" | "northern-mist" | "brutalist-metro";

const ATTR = "data-region";

type Seed = {
  /** ISO-2 codes and full country names, matched case-insensitively. */
  country: string[];
  /** City or region names, lower case. The city is tried before the region. */
  names: string[];
  archetype: RegionArchetype;
};

/* Seed the places Echo actually stands first; grow the table as data, never
   as guesses. */
const SEEDS: Seed[] = [
  // Thailand — the Samui/Bangkok/Chiang Mai triangle.
  { country: ["TH", "THAILAND"], archetype: "capital-metro",
    names: ["bangkok", "krung thep", "nonthaburi", "samut prakan", "pathum thani"] },
  { country: ["TH", "THAILAND"], archetype: "island-coastal",
    names: ["surat thani", "ko samui", "koh samui", "samui", "koh tao", "ko tao",
            "ko pha ngan", "koh phangan", "phuket", "krabi", "chumphon",
            "nakhon si thammarat", "trang"] },
  { country: ["TH", "THAILAND"], archetype: "northern-mist",
    names: ["chiang mai", "chiang rai", "mae hong son", "nan", "pai"] },
  // Taiwan.
  { country: ["TW", "TAIWAN"], archetype: "capital-metro",
    names: ["taipei", "new taipei", "taoyuan", "keelung"] },
  // Japan — Tokyo wears concrete, the north wears mist.
  { country: ["JP", "JAPAN"], archetype: "brutalist-metro",
    names: ["tokyo", "kanto", "yokohama", "chiba", "saitama", "kawasaki"] },
  { country: ["JP", "JAPAN"], archetype: "northern-mist",
    names: ["hokkaido", "sapporo", "aomori"] },
  // The DMV — city-level only. "Virginia" the state is too wide a claim.
  { country: ["US", "USA", "UNITED STATES", "UNITED STATES OF AMERICA"], archetype: "capital-metro",
    names: ["district of columbia", "washington", "washington dc", "chantilly",
            "arlington", "alexandria", "reston", "tysons", "fairfax", "herndon",
            "bethesda", "silver spring"] },
];

/**
 * The region archetype for a place, or null when the table has no honest
 * claim. City is tried before region; both must be vouched for by the
 * place's own country.
 */
export function regionAtmosphere(input: {
  country?: string | null;
  region?: string | null;
  city?: string | null;
  /** True when the fix is too old to be spoken as "now". */
  stale?: boolean;
}): RegionArchetype | null {
  if (input.stale) return null;
  const country = (input.country ?? "").trim().toUpperCase();
  if (!country) return null;
  const rows = SEEDS.filter((s) => s.country.includes(country));
  if (!rows.length) return null;
  const city = (input.city ?? "").trim().toLowerCase();
  if (city) {
    const hit = rows.find((s) => s.names.includes(city));
    if (hit) return hit.archetype;
  }
  const region = (input.region ?? "").trim().toLowerCase();
  if (region) {
    const hit = rows.find((s) => s.names.includes(region));
    if (hit) return hit.archetype;
  }
  return null;
}

/** Write the region onto <html>; null clears the attribute. */
export function applyRegion(archetype: RegionArchetype | null): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!archetype) {
    root.removeAttribute(ATTR);
    return;
  }
  if (root.getAttribute(ATTR) !== archetype) root.setAttribute(ATTR, archetype);
}

/** Read the current region. Test/debug convenience. */
export function currentRegion(): RegionArchetype | null {
  if (typeof document === "undefined") return null;
  return (document.documentElement.getAttribute(ATTR) as RegionArchetype | null) ?? null;
}
