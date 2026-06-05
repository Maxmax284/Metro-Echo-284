// resolveEntities — fire-and-forget client helper that asks the
// entity-resolve edge function for a semantic + (when needed) LLM pass
// after the rule-based linkEntities has already run. Never throws,
// never blocks the caller. Plan→Approve→Execute is preserved: this
// only writes entity_links + audit; it does not move data.
import { supabase } from "@/integrations/supabase/client";
import type { EntitySourceKind } from "./entityGraph";

export function resolveEntities(input: {
  text: string;
  source_kind: EntitySourceKind;
  source_id: string;
  role?: "mentions" | "about" | "owner" | "location" | "participant" | "source";
}) {
  const text = (input.text ?? "").trim();
  if (!text || !input.source_id) return;
  // Intentionally not awaited — passive graph fill.
  void supabase.functions
    .invoke("entity-resolve", {
      body: {
        text,
        source_kind: input.source_kind,
        source_id: input.source_id,
        role: input.role ?? "mentions",
      },
    })
    .catch(() => { /* best-effort */ });
}
