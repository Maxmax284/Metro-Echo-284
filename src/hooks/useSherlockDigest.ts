// useSherlockDigest — the latest weekly read for the room you are standing in.
//
// Doctrine: read-only apart from the "seen" mark. The digest body is composed
// server-side from records, so the client never invents or edits its contents.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";

export type DigestBody = {
  week_start: string;
  headline: string;
  new_by_kind: Array<{ kind: string; label: string; count: number; example: string }>;
  settled: { accepted: number; dismissed: number; marked_wrong: number };
  look_again: Array<{ id: string; summary: string; confidence: string; kind: string }>;
  quiet: boolean;
};

export type SherlockDigestRow = {
  id: string;
  week_start: string;
  digest: DigestBody;
  new_count: number;
  look_again_count: number;
  seen_at: string | null;
  created_at: string;
};

export function useSherlockDigest() {
  const { user } = useAuth();
  const { applyScope, key: scopeKey } = useScope();
  const [digest, setDigest] = useState<SherlockDigestRow | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await applyScope(
      supabase
        .from("sherlock_digests")
        .select("id, week_start, digest, new_count, look_again_count, seen_at, created_at"),
    )
      .order("week_start", { ascending: false })
      .limit(1);
    const row = ((data ?? []) as unknown as SherlockDigestRow[])[0] ?? null;
    setDigest(row);
    setLoading(false);
  }, [user?.id, scopeKey]);

  useEffect(() => { void load(); }, [load]);

  const markSeen = useCallback(async () => {
    if (!digest || digest.seen_at) return;
    const stamp = new Date().toISOString();
    await supabase.from("sherlock_digests").update({ seen_at: stamp }).eq("id", digest.id);
    setDigest((d) => (d ? { ...d, seen_at: stamp } : d));
  }, [digest?.id, digest?.seen_at]);

  return { digest, loading, markSeen, refresh: load };
}
