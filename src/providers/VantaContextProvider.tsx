// VantaContextProvider — one context object, many bodies.
//
// The thread you were on, the project you were in, the posture you set: all of
// it lives here and persists to your profile, so switching from desk to phone
// picks up where you left off instead of starting over. Device class is local
// (this body), everything else travels.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { detectDeviceClass } from "@/lib/deviceClass";
import {
  EMPTY_CONTEXT,
  contextFromStored,
  handoff,
  mergeContext,
  readStoredContext,
  storedFromContext,
  type Posture,
  type StoredContext,
  type VantaContext,
} from "@/lib/awareness";

type Ctx = {
  context: VantaContext;
  loading: boolean;
  /** Local-only patch (device class, quiet hours…). Not persisted. */
  observe: (patch: VantaContext) => void;
  /** Patch that should survive a device switch. */
  remember: (patch: VantaContext) => Promise<void>;
  /** Set the posture by hand, optionally with an end time. */
  setPosture: (posture: Posture | null, until?: string | null) => Promise<void>;
  postureUntil: string | null;
};

const VantaContextCtx = createContext<Ctx | null>(null);

export function VantaContextProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [context, setContext] = useState<VantaContext>(EMPTY_CONTEXT);
  const [postureUntil, setPostureUntil] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const prefsRef = useRef<Record<string, unknown>>({});

  // Load the persisted slice, then stamp this device on top of it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        setContext({ ...EMPTY_CONTEXT, deviceClass: detectDeviceClass() });
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("preferences")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const prefs = ((data?.preferences ?? {}) as Record<string, unknown>) ?? {};
      prefsRef.current = prefs;
      const stored = readStoredContext(prefs);
      setPostureUntil(stored.postureUntil ?? null);
      const restored = contextFromStored(stored);
      setContext(handoff({ ...restored, scope: { userId: user.id, organizationId: null } }, detectDeviceClass()));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const persist = useCallback(
    async (next: VantaContext, until: string | null) => {
      if (!user) return;
      const stored: StoredContext = storedFromContext(next, until);
      const prefs = { ...prefsRef.current, context: stored };
      prefsRef.current = prefs;
      await supabase.from("profiles").update({ preferences: prefs as never }).eq("id", user.id);
    },
    [user],
  );

  const observe = useCallback((patch: VantaContext) => {
    setContext((prev) => mergeContext(prev, patch));
  }, []);

  const remember = useCallback(
    async (patch: VantaContext) => {
      const next = mergeContext(context, patch);
      setContext(next);
      await persist(next, postureUntil);
    },
    [context, persist, postureUntil],
  );

  const setPosture = useCallback(
    async (posture: Posture | null, until?: string | null) => {
      const next = mergeContext(context, {
        posture: posture ?? undefined,
        postureSource: posture ? "manual" : undefined,
      });
      if (!posture) delete (next as Record<string, unknown>).posture;
      const nextUntil = posture ? (until ?? null) : null;
      setContext(next);
      setPostureUntil(nextUntil);
      await persist(next, nextUntil);
    },
    [context, persist],
  );

  const value = useMemo(
    () => ({ context, loading, observe, remember, setPosture, postureUntil }),
    [context, loading, observe, remember, setPosture, postureUntil],
  );

  return <VantaContextCtx.Provider value={value}>{children}</VantaContextCtx.Provider>;
}

export function useVantaContext() {
  const v = useContext(VantaContextCtx);
  if (!v) throw new Error("useVantaContext must be inside VantaContextProvider");
  return v;
}
