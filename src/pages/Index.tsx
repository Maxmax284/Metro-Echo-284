import { useState, useLayoutEffect, useRef } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { AmbientHeader } from "@/components/shell/AmbientHeader";
import { SurfaceTabs, SurfaceKey } from "@/components/shell/SurfaceTabs";
import { SurfaceCrossfade } from "@/components/shell/SurfaceCrossfade";
import { ConversationSurface } from "@/components/surfaces/ConversationSurface";
import { ThreadRail, ThreadBar } from "@/components/ask/ThreadSpine";
import { AskRoom } from "@/components/ask/AskRoom";
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
import { useShellWeather } from "@/hooks/useShellWeather";
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

import { useStageAction } from "@/hooks/useStageAction";
import { useSherlock } from "@/components/sherlock/SherlockContext";
import { useCurrentContext } from "@/providers/CurrentContextProvider";
import { OPEN_RECEIPTS_EVENT } from "@/lib/receipts";
import { OPEN_ASK_EVENT } from "@/lib/askPromotion";
import { useAwareness } from "@/providers/AwarenessProvider";
import { BootSequence } from "@/components/shell/BootSequence";
import { IntroSequence } from "@/components/shell/IntroSequence";
import { useIntroGate } from "@/hooks/useIntroGate";
import { useEffect } from "react";
import { useRoomSignals } from "@/hooks/useRoomSignals";

export default function Index() {
  return <IndexInner />;
}

function IndexInner() {
  const { user, loading, signOut } = useAuth();
  // Navigation state is URL-backed: `?surface=<id>` so refresh, browser back
  // and saved links all land on the same room/desk. Legacy keys (audit, chat,
  // cockpit) are mapped in parseSurfaceFromSearch.
  const [surface, _setSurface] = useState<SurfaceKey>(
    () => (typeof window !== "undefined" ? parseSurfaceFromSearch(window.location.search) : null) ?? DEFAULT_SURFACE,
  );
  const [focusCommitmentId, setFocusCommitmentId] = useState<string | null>(null);
  const [focusReceiptActionId, setFocusReceiptActionId] = useState<string | null>(null);
  const [focusActionId, setFocusActionId] = useState<string | null>(null);

  // Per-surface scroll memory. We capture the active surface's scroll position
  // right before switching, then restore the incoming surface's position on
  // mount. Surfaces all use a `.overflow-y-auto` scroller, so we grab the
  // first one inside the wrapper.
  const surfaceWrapperRef = useRef<HTMLDivElement | null>(null);
  const scrollMemory = useRef<Record<string, number>>({});
  const setSurface = (next: SurfaceKey, opts?: { replace?: boolean }) => {
    const el = surfaceWrapperRef.current?.querySelector<HTMLElement>(".overflow-y-auto");
    if (el) scrollMemory.current[surface] = el.scrollTop;
    _setSurface(next);
    if (typeof window !== "undefined") {
      const url = window.location.pathname + surfaceSearch(next as SurfaceId) + window.location.hash;
      if (opts?.replace) window.history.replaceState({ surface: next }, "", url);
      else window.history.pushState({ surface: next }, "", url);
    }
  };

  // Browser back/forward moves between rooms instead of leaving the app.
  useEffect(() => {
    const onPop = () => {
      _setSurface(parseSurfaceFromSearch(window.location.search) ?? DEFAULT_SURFACE);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useLayoutEffect(() => {
    const el = surfaceWrapperRef.current?.querySelector<HTMLElement>(".overflow-y-auto");
    if (!el) return;
    // Work is a noticeboard, not a thread: it always opens at the top so the
    // desk row (flights, money, schedule…) is never hidden below the fold.
    // The other rooms keep their remembered position.
    el.scrollTop = surface === "work" ? 0 : (scrollMemory.current[surface] ?? 0);
  }, [surface]);


  const { state } = useOperationalState(surface);
  /* Calm / drift / pressure now holds in all four rooms, not only Today. */
  useShellWeather();
  const { openSherlock } = useSherlock();
  const stageAction = useStageAction();
  const { setContext } = useCurrentContext();
  const { overall: awareness, place } = useAwareness();
  /* The once-per-account welcome gates the boot: while it's checking or
     showing, the roll call stands down so the two never overlap. */
  const { gate: introGate, finishIntro } = useIntroGate(user?.id);
  const roomSignals = useRoomSignals();
  const openRoomSignal = (signal: import("@/lib/roomSignals").RoomSignal) => {
    if (signal.target === "actions") setFocusActionId(signal.situationId ?? null);
    if (signal.target === "receipts") setFocusReceiptActionId(signal.situationId ?? null);
    void roomSignals.acknowledge(signal);
  };

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

  // "Continue in Ask" — the quick dock hands the same thread to the full room.
  useEffect(() => {
    const onOpenAsk = () => setSurface("ask");
    window.addEventListener(OPEN_ASK_EVENT, onOpenAsk);
    return () => window.removeEventListener(OPEN_ASK_EVENT, onOpenAsk);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  // Deep-link from push notifications: /?commitment=<id> opens the Commitments
  // surface and focuses that specific commitment. We strip the param so it
  // doesn't re-fire on subsequent renders or navigations.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    /* Home-screen shortcuts and notification links open the exact room instead
       of dropping someone on the front page. Only the four rooms are allowed. */
    const wanted = url.searchParams.get("room");
    if (wanted && ["today", "work", "ask", "receipts"].includes(wanted)) {
      setSurface(wanted as typeof surface);
      url.searchParams.delete("room");
      window.history.replaceState({}, "", url.pathname + (url.search ? url.search : "") + url.hash);
    }
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


  return (
    <div className="relative flex min-h-dvh flex-col">
      {/* The roll call covers first paint only; the rooms render regardless.
          The once-per-account intro outranks it and never replays. */}
      {introGate === "show" && user && <IntroSequence userId={user.id} onFinished={finishIntro} />}
      {introGate === "done" && <BootSequence />}
      <AmbientHeader

        state={state}
        room={surface}
        place={place?.label}
        awareness={{ freshness: awareness.freshness, confidence: awareness.confidence }}
        onAwarenessClick={() => setSurface("awareness")}
        right={
          <div className="flex items-center gap-1.5">
             {/* Sign out stays visible at phone width instead of being buried
                 inside Settings. The icon keeps the header compact. */}
             <Button
               variant="ghost"
               size="icon"
               onClick={signOut}
               className="h-8 w-8 shrink-0 sm:hidden"
               aria-label="Sign out"
               title="Sign out"
             >
               <LogOut className="h-4 w-4" />
             </Button>
            {/* The gear leads the cluster: Control Room must never scroll out
                of reach on a phone. Bordered and labelled so it reads as the
                door to settings, not decoration. */}
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-8 gap-1.5 rounded-md px-2 ring-1 ring-border/70 hover:ring-primary/50"
                  aria-label="Settings"
                  title="Settings"
                >
                  <SettingsIcon className="h-4 w-4" />
                  <span className="text-[10px] uppercase tracking-wider">Settings</span>
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

                  {/* The phone header no longer carries these, so the sheet does. */}
                  <Separator />
                  <div className="space-y-2 sm:hidden">
                    <button
                      type="button"
                      onClick={() => setSurface("projects")}
                      className="flex w-full items-center justify-between rounded-lg surface-elevated px-3 py-2.5 text-xs ring-1 ring-border/60 hover:ring-primary/40"
                    >
                      <span className="font-medium">Projects</span>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">living briefs</span>
                    </button>
                    <button
                      type="button"
                      onClick={signOut}
                      className="flex w-full items-center gap-2 rounded-lg surface-elevated px-3 py-2.5 text-xs ring-1 ring-border/60 hover:ring-primary/40"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      <span className="font-medium">Sign out</span>
                    </button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
            <WorkspaceSwitcher />
            <ModeBadge />
            {/* Secondary doors stand down on a phone: at 384px seven controls
                clipped the cluster off the right edge. Every one of them is
                reachable from the Settings sheet or the room rail instead. */}
            <div className="hidden items-center gap-1.5 sm:flex">
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

              <Button variant="ghost" size="sm" onClick={signOut} className="gap-1 text-xs">
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </Button>
            </div>
          </div>
        }
      />

      <div className="flex flex-1 min-h-0">
        <SurfaceTabs active={surface} onChange={setSurface} variant="rail" signals={roomSignals.signals} bubble={roomSignals.bubble} onDismissBubble={roomSignals.dismissBubble} onOpenSignal={openRoomSignal} />
        <main className="relative flex flex-1 min-w-0 min-h-0 flex-col overflow-x-hidden">
          <div className="px-3 pt-2 md:px-4">
            <NudgesPanel collapsed />
          </div>
          <MissingSecretsBanner />

          <SurfaceCrossfade surfaceKey={surface} innerRef={surfaceWrapperRef}>
            {surface === "today" && <TodaySurface onNavigate={setSurface} />}
            {surface === "work" && <WorkSurface onNavigate={setSurface} />}
            {surface === "ask" && (
              <AskRoom>
                <ThreadRail />
                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                  <ThreadBar />
                  <div className="min-h-0 flex-1">
                    <ConversationSurface />
                  </div>
                </div>
              </AskRoom>
            )}
            {surface === "command" && <CommandCenterSurface onNavigate={setSurface} />}

            {surface === "inbox" && <InboxSurface />}
            {surface === "projects" && <ProjectsSurface />}
            {surface === "briefs" && <BriefsSurface onNavigate={setSurface as never} />}
            {surface === "receipts" && <AuditSurface focusActionId={focusReceiptActionId} />}
            {surface === "schedule" && <ScheduleSurface onNavigate={setSurface} />}
            {surface === "memory" && <MemorySurface />}
            {surface === "commitments" && <CommitmentsSurface focusId={focusCommitmentId} onFocusHandled={() => setFocusCommitmentId(null)} />}
            {surface === "actions" && <ActionsSurface focusId={focusActionId} onFocusHandled={() => setFocusActionId(null)} />}
            {surface === "sherlock" && <SherlockSurface />}
            {surface === "awareness" && <AwarenessSurface />}
          </SurfaceCrossfade>
        </main>
      </div>

      <SurfaceTabs active={surface} onChange={setSurface} variant="bottom" signals={roomSignals.signals} bubble={roomSignals.bubble} onDismissBubble={roomSignals.dismissBubble} onOpenSignal={openRoomSignal} />
      <CaptureToastProvider onOpenFile={() => setSurface("memory")} />
      <GlobalDropZone />
      <ClipboardImageIntake />
    </div>
  );
}
