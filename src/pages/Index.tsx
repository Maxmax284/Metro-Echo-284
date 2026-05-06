import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { AmbientHeader } from "@/components/shell/AmbientHeader";
import { SurfaceTabs, SurfaceKey } from "@/components/shell/SurfaceTabs";
import { ConversationSurface } from "@/components/surfaces/ConversationSurface";
import { MemorySurface } from "@/components/surfaces/MemorySurface";
import { ActionsSurface } from "@/components/surfaces/ActionsSurface";
import { AwarenessSurface } from "@/components/surfaces/AwarenessSurface";
import { useOperationalState } from "@/lib/operationalState";
import { Button } from "@/components/ui/button";
import { LogOut, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export default function Index() {
  const { user, loading, signOut } = useAuth();
  const [surface, setSurface] = useState<SurfaceKey>("conversation");
  const { state } = useOperationalState(surface);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  const onIntent = async (kind: string, args: any) => {
    try {
      if (kind === "capture_note") {
        await supabase.from("notes").insert({ user_id: user.id, title: args.title ?? null, body: args.body ?? "" });
        toast.success("Captured to memory");
      } else if (kind === "stage_action") {
        await supabase.from("actions").insert({
          user_id: user.id,
          title: args.title,
          description: args.description ?? null,
          risk: args.risk ?? "standard",
          status: "staged",
          source: "conversation",
        });
        toast.success("Action staged for review");
      } else if (kind === "add_commitment") {
        await supabase.from("commitments").insert({
          user_id: user.id,
          summary: args.summary,
          due_at: args.due_at ?? null,
        });
        toast.success("Commitment added");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't apply intent");
    }
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <AmbientHeader
        state={state}
        right={
          <Button variant="ghost" size="sm" onClick={signOut} className="gap-1 text-xs">
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </Button>
        }
      />

      <div className="flex flex-1 min-h-0">
        <SurfaceTabs active={surface} onChange={setSurface} variant="rail" />
        <main className="relative flex flex-1 min-h-0 flex-col">
          {surface === "conversation" && <ConversationSurface onIntent={onIntent} />}
          {surface === "memory" && <MemorySurface />}
          {surface === "actions" && <ActionsSurface />}
          {surface === "awareness" && <AwarenessSurface />}
        </main>
      </div>

      <SurfaceTabs active={surface} onChange={setSurface} variant="bottom" />
    </div>
  );
}
