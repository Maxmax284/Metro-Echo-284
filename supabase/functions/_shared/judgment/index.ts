// judgment — the shared street-smart substrate.
//
// One contract, used by the existing reasoning layers (awareness relevance and
// suppression, situation.ts, vanta-converse, telegram-webhook). Not a second
// brain, not a mode, not a room, not a score on a card.

export * from "./situationSense.ts";
export * from "./archetype.ts";
export * from "./consequence.ts";
export * from "./friction.ts";
export * from "./experience.ts";
export * from "./rhythm.ts";
export * from "./roleMap.ts";
export * from "./worldBackbone.ts";
export * from "./bodyLoad.ts";
export * from "./compose.ts";

import { type ArchetypeHypothesis, activeArchetypes, archetypeBlock } from "./archetype.ts";
import { type ExperienceEntry, applicableExperience, experienceBlock } from "./experience.ts";
import { type Rhythm, rhythmBlock } from "./rhythm.ts";
import { type PlatformRow, roleMapBlock } from "./roleMap.ts";
import { type SituationSense, senseBlock } from "./situationSense.ts";
import { type Tradeoff, frictionBlock } from "./friction.ts";
import { type WorldFact, worldBlock } from "./worldBackbone.ts";
import { type BodyLoad, bodyLoadBlock } from "./bodyLoad.ts";
import { STREET_ANSWER_RULES } from "./compose.ts";

export type JudgmentInput = {
  sense?: SituationSense | null;
  archetypes?: ArchetypeHypothesis[] | null;
  tradeoff?: Tradeoff | null;
  experience?: ExperienceEntry[] | null;
  rhythms?: Rhythm[] | null;
  platforms?: PlatformRow[] | null;
  world?: { facts: WorldFact[]; country: string } | null;
  /** Recorded rest and effort. A friction input, never a health reading. */
  bodyLoad?: BodyLoad | null;
  now?: Date;
};

/**
 * The one prompt block. Every part is optional and omitted when there is
 * nothing recorded, so an ordinary question stays an ordinary question and the
 * model is never handed a scaffold to fill in with invention.
 */
export function judgmentBlock(input: JudgmentInput): string {
  const now = input.now ?? new Date();
  const parts: string[] = [];
  if (input.sense) {
    const block = senseBlock(input.sense, now);
    if (block) parts.push(block);
  }
  if (input.archetypes?.length) {
    const block = archetypeBlock(activeArchetypes(input.archetypes, now));
    if (block) parts.push(block);
  }
  if (input.tradeoff) parts.push(frictionBlock(input.tradeoff));
  if (input.experience?.length) {
    const block = experienceBlock(applicableExperience(input.experience, { now }), now);
    if (block) parts.push(block);
  }
  if (input.rhythms?.length) {
    const block = rhythmBlock(input.rhythms, now);
    if (block) parts.push(block);
  }
  if (input.platforms?.length) parts.push(roleMapBlock(input.platforms));
  if (input.bodyLoad) {
    const block = bodyLoadBlock(input.bodyLoad);
    if (block) parts.push(block);
  }
  if (input.world) parts.push(worldBlock(input.world.facts, input.world.country, now));
  if (!parts.length) return "";
  return [...parts, STREET_ANSWER_RULES].join("\n\n");
}
