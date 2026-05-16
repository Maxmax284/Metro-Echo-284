import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export function useIsOwner() {
  const { session } = useAuth();
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!session) { setIsOwner(false); return; }
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("role", "owner")
      .maybeSingle()
      .then(({ data }) => { if (!cancelled) setIsOwner(!!data); });
    return () => { cancelled = true; };
  }, [session]);
  return isOwner;
}
