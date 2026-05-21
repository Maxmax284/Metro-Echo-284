// useSherlockSettings — per-user ambient recognition toggles.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { DEFAULT_SETTINGS, type SherlockSettings } from "@/lib/sherlock/types";

export function useSherlockSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<SherlockSettings | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("sherlock_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) {
      setSettings(data as SherlockSettings);
    } else {
      // Seed defaults lazily on first read.
      const seed = { user_id: user.id, ...DEFAULT_SETTINGS };
      const { data: created } = await supabase
        .from("sherlock_settings")
        .insert(seed)
        .select("*")
        .single();
      setSettings((created ?? seed) as SherlockSettings);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const update = useCallback(
    async (patch: Partial<Omit<SherlockSettings, "user_id" | "created_at" | "updated_at">>) => {
      if (!user) return;
      const { data } = await supabase
        .from("sherlock_settings")
        .update(patch)
        .eq("user_id", user.id)
        .select("*")
        .single();
      if (data) setSettings(data as SherlockSettings);
    },
    [user?.id],
  );

  return { settings, loading, update, refresh: load };
}
