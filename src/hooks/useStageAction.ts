// useStageAction — the only way a client surface drafts an action.
//
// It resolves the signed-in user, stamps the active room (Personal or a
// workspace) so a workspace draft never lands as personal, normalizes the risk
// word to a real database value, and inserts one row in a pre-approval state.
// Nothing here executes.
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { buildActionRow, type StageActionInput } from "@/lib/actionStaging";

export function useStageAction() {
  const { orgId } = useScope();

  return useCallback(
    async (input: StageActionInput): Promise<string | null> => {
      const { data: u } = await supabase.auth.getUser();
      const userId = u.user?.id;
      if (!userId) throw new Error("not-signed-in");
      const row = buildActionRow({ ...input, userId, organizationId: orgId });
      const { data, error } = await supabase
        .from("actions")
        .insert(row as never)
        .select("id")
        .single();
      if (error) throw error;
      return (data as { id?: string } | null)?.id ?? null;
    },
    [orgId],
  );
}

export type StageActionFn = ReturnType<typeof useStageAction>;
