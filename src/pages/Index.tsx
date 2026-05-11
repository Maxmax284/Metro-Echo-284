import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { AmbientHeader } from "@/components/shell/AmbientHeader";
import { SurfaceTabs, SurfaceKey } from "@/components/shell/SurfaceTabs";
import { ConversationSurface } from "@/components/surfaces/ConversationSurface";
import { MemorySurface } from "@/components/surfaces/MemorySurface";
import { CommitmentsSurface } from "@/components/surfaces/CommitmentsSurface";
import { ActionsSurface } from "@/components/surfaces/ActionsSurface";
import { AwarenessSurface } from "@/components/surfaces/AwarenessSurface";
import { SherlockSurface } from "@/components/surfaces/SherlockSurface";
import { AuditSurface } from "@/components/surfaces/AuditSurface";
import { generateEmbedding } from "@/lib/embeddings";
import { useOperationalState } from "@/lib/operationalState";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { LogOut, Loader2, Settings as SettingsIcon, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { TelegramLinkCard } from "@/components/TelegramLinkCard";
import { ExecutorsCard } from "@/components/ExecutorsCard";
import { FileUploadCard } from "@/components/FileUploadCard";
import { EmailInboxCard } from "@/components/EmailInboxCard";
import { Separator } from "@/components/ui/separator";
import { NudgesPanel } from "@/components/NudgesPanel";
import { SherlockProvider, useSherlock } from "@/components/sherlock/SherlockContext";
import { SherlockOverlay } from "@/components/sherlock/SherlockOverlay";

export default function Index() {
  return (
    <SherlockProvider>
      <IndexInner />
      <SherlockOverlay />
    </SherlockProvider>
  );
}

function IndexInner() {
  const { user, loading, signOut } = useAuth();
  const [surface, setSurface] = useState<SurfaceKey>("conversation");
  const { state } = useOperationalState(surface);
  const { openSherlock } = useSherlock();

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
        const { data } = await supabase
          .from("notes")
          .insert({ user_id: user.id, title: args.title ?? null, body: args.body ?? "" })
          .select("id")
          .single();
        if (data) generateEmbedding("note", data.id);
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
        const remindAt = args.due_at
          ? new Date(new Date(args.due_at).getTime() - 24 * 60 * 60 * 1000).toISOString()
          : null;
        const { data } = await supabase
          .from("commitments")
          .insert({
            user_id: user.id,
            summary: args.summary,
            due_at: args.due_at ?? null,
            remind_at: remindAt,
          })
          .select("id")
          .single();
        if (data) generateEmbedding("commitment", data.id);
        toast.success("Commitment added");
      } else if (kind === "run_sherlock") {
        openSherlock({
          entity_type: "freeform",
          title: (args.text ?? "").slice(0, 80),
          text: args.text ?? "",
        });
      } else if (kind === "query_awareness") {
        // Phase C wiring: surface the question in Awareness; full free-form briefing
        // routing is being built. For now, open Awareness and toast the question.
        toast.message("Awareness question logged", {
          description: args.question?.slice(0, 120) ?? "",
        });
        setSurface("awareness");
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
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="Analyze with Sherlock"
              onClick={() => openSherlock({ entity_type: "freeform", title: "Ad-hoc analysis", text: "" })}
              title="Analyze with Sherlock"
            >
              <Sparkles className="h-3.5 w-3.5" />
            </Button>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Settings">
                  <SettingsIcon className="h-3.5 w-3.5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[360px] max-w-full">
                <SheetHeader><SheetTitle>Settings</SheetTitle></SheetHeader>
                <div className="mt-4 space-y-6 overflow-y-auto pr-1" style={{ maxHeight: "calc(100dvh - 80px)" }}>
                  <TelegramLinkCard />
                  <Separator />
                  <FileUploadCard />
                  <Separator />
                  <EmailInboxCard />
                  <Separator />
                  <ExecutorsCard />
                </div>
              </SheetContent>
            </Sheet>
            <Button variant="ghost" size="sm" onClick={signOut} className="gap-1 text-xs">
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </Button>
          </div>
        }
      />

      <div className="flex flex-1 min-h-0">
        <SurfaceTabs active={surface} onChange={setSurface} variant="rail" />
        <main className="relative flex flex-1 min-h-0 flex-col">
          <div className="px-3 pt-2 md:px-4">
            <NudgesPanel collapsed />
          </div>
          {surface === "conversation" && <ConversationSurface onIntent={onIntent} />}
          {surface === "memory" && <MemorySurface />}
          {surface === "commitments" && <CommitmentsSurface />}
          {surface === "actions" && <ActionsSurface />}
          {surface === "sherlock" && <SherlockSurface />}
          {surface === "awareness" && <AwarenessSurface />}
          {surface === "audit" && <AuditSurface />}
        </main>
      </div>

      <SurfaceTabs active={surface} onChange={setSurface} variant="bottom" />
    </div>
  );
}
