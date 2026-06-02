import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

// Highest-privilege role wins. 'personal' is the fallback when no row exists
// (the project is effectively single-user/owner today; non-owner branches are
// staged for when workspaces exist).
export type Role = "owner" | "manager" | "coach" | "viewer" | "personal";

const RANK: Record<Role, number> = {
  owner: 5, manager: 4, coach: 3, viewer: 2, personal: 1,
};

export function useRole(): Role {
  const { session } = useAuth();
  const [role, setRole] = useState<Role>("personal");
  useEffect(() => {
    let cancelled = false;
    if (!session) return;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const roles = data.map((r: any) => r.role as Role).filter((r): r is Role => r in RANK);
        if (!roles.length) return;
        roles.sort((a, b) => RANK[b] - RANK[a]);
        setRole(roles[0]);
      });
    return () => { cancelled = true; };
  }, [session]);
  return role;
}
