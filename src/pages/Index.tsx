import { useState, useLayoutEffect, useRef } from "react";
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
import { CommandCenterSurface } from "@/components/surfaces/CommandCenterSurface";
import { ScheduleSurface } from "@/components/surfaces/ScheduleSurface";
import { BriefsSurface } from "@/components/surfaces/BriefsSurface";
import { ProjectsSurface } from "@/components/surfaces/ProjectsSurface";
import { InboxSurface } from "@/components/surfaces/InboxSurface";
import { TodaySurface } from "@/components/surfaces/TodaySurface";
import { WorkSurface } from "@/components/surfaces/WorkSurface";
import {
  DEFAULT_SURFACE,
  parseSurfaceFromSearch,
  surfaceSearch,
  type SurfaceId,
} from "@/lib/navigation";

import { generateEmbedding } from "@/lib/embeddings";
import { useOperationalState } from "@/lib/operationalState";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { LogOut, Loader2, Settings as SettingsIcon, Sparkles, FolderKanban, FileText } from "lucide-react";
import { ModeBadge } from "@/components/shell/ModeBadge";
import { WorkspaceSwitcher } from "@/components/shell/WorkspaceSwitcher";
import { vantaToast as toast, vantaSay } from "@/lib/vantaVoice";
import { supabase } from "@/integrations/supabase/client";
import { TelegramLinkCard } from "@/components/TelegramLinkCard";
import { ExecutorsCard } from "@/components/ExecutorsCard";
import { FileUploadCard } from "@/components/FileUploadCard";
import { VoiceCaptureCard } from "@/components/capture/VoiceCaptureCard";
import { EmailInboxCard } from "@/components/EmailInboxCard";
import { Separator } from "@/components/ui/separator";
import { NudgesPanel } from "@/components/NudgesPanel";
import { CaptureToastProvider } from "@/components/capture/CaptureToast";
import { GlobalDropZone } from "@/components/files/GlobalDropZone";
import { ClipboardImageIntake } from "@/components/files/ClipboardImageIntake";
import { MissingSecretsBanner } from "@/components/integrations/MissingSecretsBanner";

import { useSherlock } from "@/components/sherlock/SherlockContext";
import { useCurrentContext } from "@/providers/CurrentContextProvider";
import { OPEN_RECEIPTS_EVENT } from "@/lib/receipts";
import { useAwareness } from "@/providers/AwarenessProvider";
import { useEffect } from "react";

export default function Index() {
  return <IndexInner />;
}

function IndexInner() {
  const { user, loading, signOut } = useAuth();
  const [surface, _setSurface] = useState<SurfaceKey>("today");
  const [focusCommitmentId, setFocusCommitmentId] = useState<string | null>(null);
  const [focusReceiptActionId, setFocusReceiptActionId] = useState<string | null>(null);

  // Per-surface scroll memory. We capture the active surface's scroll position
  // right before switching, then restore the incoming surface's position on
  // mount. Surfaces all use a `.overflow-y-auto` scroller, so we grab the
  // first one inside the wrapper.
  const surfaceWrapperRef = useRef<HTMLDivElement | null>(null);
  const scrollMemory = useRef<Record<string, number>>({});
  const setSurface = (next: SurfaceKey) => {
    const el = surfaceWrapperRef.current?.querySelector<HTMLElement>(".overflow-y-auto");
    if (el) scrollMemory.current[surface] = el.scrollTop;
    _setSurface(next);
  };
  useLayoutEffect(() => {
    const el = surfaceWrapperRef.current?.querySelector<HTMLElement>(".overflow-y-auto");
    if (!el) return;
    el.scrollTop = scrollMemory.current[surface] ?? 0;
  }, [surface]);

  const { state } = useOperationalState(surface);
  const { openSherlock } = useSherlock();
  const { setContext } = useCurrentContext();
  const { overall: awareness, place } = useAwareness();

  useEffect(() => {
    setContext({ surface });
  }, [surface, setContext]);

  // "See in Receipts" from an action receipt drawer.
  useEffect(() => {
    const onOpenReceipts = (e: Event) => {
      const id = (e as CustomEvent<{ actionId: string }>).detail?.actionId ?? null;
      setFocusReceiptActionId(id);
      setSurface("receipts");
    };
    window.addEventListener(OPEN_RECEIPTS_EVENT, onOpenReceipts);
    return () => window.removeEventListener(OPEN_RECEIPTS_EVENT, onOpenReceipts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep-link from push notifications: /?commitment=<id> opens the Commitments
  // surface and focuses that specific commitment. We strip the param so it
  // doesn't re-fire on subsequent renders or navigations.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const id = url.searchParams.get("commitment");
    if (id) {
      setSurface("commitments");
      setFocusCommitmentId(id);
      url.searchParams.delete("commitment");
      window.history.replaceState({}, "", url.pathname + (url.search ? url.search : "") + url.hash);
    }
  }, []);

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
        toast.success(vantaSay.capturedToMemory());
      } else if (kind === "stage_action") {
        await supabase.from("actions").insert({
          user_id: user.id,
          title: args.title,
          description: args.description ?? null,
          risk: args.risk ?? "standard",
          status: "staged",
          source: "conversation",
        });
        toast.success(vantaSay.actionStaged());
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
        toast.success(vantaSay.commitmentAdded());
      } else if (kind === "run_sherlock") {
        openSherlock({
          entity_type: "freeform",
          title: (args.text ?? "").slice(0, 80),
          text: args.text ?? "",
        });
      } else if (kind === "query_awareness") {
        // Phase C: real round-trip — answer grounded in the active place + briefings,
        // then post the result back into the active conversation as an assistant turn.
        const question = String(args.question ?? "").trim();
        if (!question) return;
        const { data, error } = await supabase.functions.invoke("awareness-query", {
          body: { question, section: args.section ?? null },
        });
        if (error || (data as any)?.error) {
          throw new Error((data as any)?.error || error?.message || "awareness query failed");
        }
        const { answer, confidence, place } = data as { answer: string; confidence: string; place: { label: string } | null };
        const tag = place ? `📍 ${place.label} · confidence: ${confidence}` : `confidence: ${confidence}`;
        const composed = `${answer}\n\n_${tag}_`;
        const { data: conv } = await supabase
          .from("conversations")
          .select("id")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (conv?.id) {
          await supabase.from("messages").insert({
            user_id: user.id,
            conversation_id: conv.id,
            role: "assistant",
            content: composed,
            metadata: { source: "awareness", confidence, place_id: place ? (data as any).place.id : null },
          });
        }
        toast.success(vantaSay.awarenessAnswered(place?.label));
      }
    } catch (e) {
      toast.fromError(e);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <AmbientHeader
        state={state}
        place={place?.label}
        awareness={{ freshness: awareness.freshness, confidence: awareness.confidence }}
        onAwarenessClick={() => setSurface("awareness")}
        right={
          <div className="flex items-center gap-1.5">
            <WorkspaceSwitcher />
            <ModeBadge />
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
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="Projects"
              onClick={() => setSurface("projects")}
              title="Projects — Living Briefs"
            >
              <FolderKanban className="h-3.5 w-3.5" />
            </Button>
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="Documents"
              title="Documents — drafts & reviews"
            >
              <a href="/documents"><FileText className="h-3.5 w-3.5" /></a>
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
                  <a
                    href="/settings"
                    className="flex items-center justify-between rounded-lg surface-elevated px-3 py-2.5 text-xs ring-1 ring-border/60 hover:ring-primary/40"
                  >
                    <span className="font-medium">Control Room</span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">owner</span>
                  </a>
                  <a
                    href="/settings/connected-accounts"
                    className="flex items-center justify-between rounded-lg surface-elevated px-3 py-2.5 text-xs ring-1 ring-border/60 hover:ring-primary/40"
                  >
                    <span className="font-medium">Connected accounts</span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">your channels</span>
                  </a>
                  <a
                    href="/documents"
                    className="flex items-center justify-between rounded-lg surface-elevated px-3 py-2.5 text-xs ring-1 ring-border/60 hover:ring-primary/40"
                  >
                    <span className="font-medium">Documents</span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">drafts &amp; reviews</span>
                  </a>
                  <a
                    href="/settings/workspaces"
                    className="flex items-center justify-between rounded-lg surface-elevated px-3 py-2.5 text-xs ring-1 ring-border/60 hover:ring-primary/40"
                  >
                    <span className="font-medium">Workspaces</span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">members &amp; roles</span>
                  </a>

                  <TelegramLinkCard />
                  <Separator />
                  <VoiceCaptureCard />
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
        <main className="relative flex flex-1 min-w-0 min-h-0 flex-col overflow-x-hidden">
          <div className="px-3 pt-2 md:px-4">
            <NudgesPanel collapsed />
          </div>
          <MissingSecretsBanner />

          <div ref={surfaceWrapperRef} key={surface} className="motion-surface-in flex flex-1 min-h-0 flex-col">
            {surface === "today" && <TodaySurface onNavigate={setSurface} />}
            {surface === "command" && <CommandCenterSurface onNavigate={setSurface} />}
            {surface === "inbox" && <InboxSurface />}
            {surface === "projects" && <ProjectsSurface />}
            {surface === "briefs" && <BriefsSurface />}
            {surface === "receipts" && <AuditSurface focusActionId={focusReceiptActionId} />}
            {surface === "schedule" && <ScheduleSurface onNavigate={setSurface} />}
            {surface === "conversation" && <ConversationSurface onIntent={onIntent} readOnly />}
            {surface === "memory" && <MemorySurface />}
            {surface === "commitments" && <CommitmentsSurface focusId={focusCommitmentId} onFocusHandled={() => setFocusCommitmentId(null)} />}
            {surface === "actions" && <ActionsSurface />}
            {surface === "sherlock" && <SherlockSurface />}
            {surface === "awareness" && <AwarenessSurface />}
          </div>
        </main>
      </div>

      <SurfaceTabs active={surface} onChange={setSurface} variant="bottom" />
      <CaptureToastProvider onOpenFile={() => setSurface("memory")} />
      <GlobalDropZone />
      <ClipboardImageIntake />
    </div>
  );
}
