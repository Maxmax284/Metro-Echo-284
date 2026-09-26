// SkyChannel — keeps `data-sky` honest from weather Echo already has.
//
// The awareness snapshot carries a real Open-Meteo reading that the briefs
// already use; this writes it onto <html> so the shell can feel the actual
// sky (stage 2 paints with it). Stale readings clear the attribute rather
// than repaint the room from old news. No fetch happens here, ever.
import { useEffect } from "react";
import { useAwareness } from "@/providers/AwarenessProvider";
import { applySky, skyFromCondition, skyIsFresh } from "@/lib/sky";

export function SkyChannel() {
  const { snapshot } = useAwareness();
  const weather = snapshot?.compact?.weather ?? null;
  const condition = weather?.condition ?? null;
  const updatedAt = weather?.updated_at ?? null;

  useEffect(() => {
    if (!skyIsFresh(updatedAt)) {
      applySky(null);
      return;
    }
    applySky(skyFromCondition(condition));
  }, [condition, updatedAt]);

  /* Leaving the signed-in shell (sign-out) clears the sky with it. */
  useEffect(() => () => applySky(null), []);

  return null;
}
