import { supabase } from "@/integrations/supabase/client";

// Fire-and-forget embedding generation. Failures are swallowed (cron will catch up).
export async function generateEmbedding(kind: "note" | "message" | "commitment", id: string) {
  try {
    await supabase.functions.invoke("embeddings-generate", { body: { mode: "single", kind, id } });
  } catch {
    // ignored — backfill mode will cover it
  }
}

export async function backfillEmbeddings(kind: "note" | "message" | "commitment", limit = 25) {
  try {
    return await supabase.functions.invoke("embeddings-generate", { body: { mode: "backfill", kind, limit } });
  } catch {
    return null;
  }
}
