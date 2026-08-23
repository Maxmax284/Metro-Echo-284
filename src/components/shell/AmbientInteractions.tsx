// AmbientInteractions — mounts the global interaction behaviours once.
// Renders nothing; see src/hooks/useAmbientInteractions.ts.
import { useAmbientInteractions } from "@/hooks/useAmbientInteractions";

export function AmbientInteractions() {
  useAmbientInteractions();
  return null;
}
