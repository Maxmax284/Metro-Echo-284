// useWhileYouWereOut — reads the gap between visits, scope-filtered.
//
// The clock: a heartbeat writes "you are here" every minute while the tab is
// visible. On the next visit the stored value is the last moment you were
// actually present, so the gap is real instead of guessed from a session cookie.
// The value read at mount is frozen for the visit, otherwise the heartbeat would
// erase the very gap the card is describing.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import {
  actionLine,
  arrivalsLine,
  buildAwayRead,
  calendarChangeLine,
  handledLine,
  nudgeLine,
  shouldSpeak,
  type AwayChange,
  type AwayRead,
} from "@/lib/whileYouWereOut";

const HEARTBEAT_MS = 60_000;

const presenceKey = (scopeKey: string) => `vanta.presence.${scopeKey}`;
const ackKey = (scopeKey: string) => `vanta.presence.ack.${scopeKey}`;

function readPresence(scopeKey: string): number | null {
  try {
    const raw = window.localStorage.getItem(presenceKey(scopeKey));
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writePresence(scopeKey: string, at: number) {
  try {
    window.localStorage.setItem(presenceKey(scopeKey), String(at));
  } catch {
    /* private mode — the card simply stays quiet. */
  }
}

export function useWhileYouWereOut(): { read: AwayRead | null; acknowledge: () => void } {
  const { session } = useAuth();
  const { applyScope, key: scopeKey } = useScope();
  const [read, setRead] = useState<AwayRead | null>(null);
  const [acked, setAcked] = useState(false);
  /* Frozen at mount: the presence heartbeat must not eat the gap. */
  const lastSeen = useRef<number | null>(null);
  const scopeAtMount = useRef<string | null>(null);

  if (scopeAtMount.current !== scopeKey) {
    scopeAtMount.current = scopeKey;
    lastSeen.current = readPresence(scopeKey);
  }

  /* Heartbeat. Presence is written, never read again this visit. */
  useEffect(() => {
    const beat = () => {
      if (document.visibilityState === "visible") writePresence(scopeKey, Date.now());
    };
    beat();
    const timer = window.setInterval(beat, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", beat);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
      beat();
    };
  }, [scopeKey]);

  const load = useCallback(async () => {
    const since = lastSeen.current;
    if (!session?.user?.id || since == null) return;
    const returnedAt = Date.now();
    const awayMs = returnedAt - since;
    if (!shouldSpeak(awayMs)) return;
    /* One acknowledgement per gap — dismissing does not come back on refresh. */
    try {
      if (window.localStorage.getItem(ackKey(scopeKey)) === String(since)) return;
    } catch {
      /* ignore */
    }

    const sinceIso = new Date(since).toISOString();
    const [cal, nudges, actions, arrivals, handled] = await Promise.all([
      applyScope(supabase.from("calendar_changes").select("id,title,change,detected_at"))
        .gte("detected_at", sinceIso)
        .order("detected_at", { ascending: false })
        .limit(10),
      applyScope(supabase.from("nudges").select("id,title,created_at,status"))
        .gte("created_at", sinceIso)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(10),
      applyScope(supabase.from("actions").select("id,title,updated_at,status"))
        .in("status", ["staged", "proposed"])
        .gte("updated_at", sinceIso)
        .order("updated_at", { ascending: false })
        .limit(10),
      applyScope(supabase.from("notes").select("id")).gte("created_at", sinceIso).limit(50),
      applyScope(supabase.from("audit_log").select("id,event,created_at"))
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const changes: AwayChange[] = [];
    for (const row of cal.data ?? []) changes.push(calendarChangeLine(row as never));
    for (const row of nudges.data ?? []) changes.push(nudgeLine(row as never));
    for (const row of actions.data ?? []) changes.push(actionLine(row as never));

    const arrived = arrivalsLine((arrivals.data ?? []).length, new Date(returnedAt).toISOString());
    if (arrived) changes.push(arrived);

    const done = (handled.data ?? []).filter((e: { event: string }) =>
      /executed|completed|delivered|sent/i.test(e.event),
    );
    const handledChange = handledLine(done.length, done[0]?.created_at ?? new Date(returnedAt).toISOString());
    if (handledChange) changes.push(handledChange);

    setRead(buildAwayRead({ awayMs, returnedAt, changes }));
  }, [applyScope, scopeKey, session?.user?.id]);

  useEffect(() => {
    setRead(null);
    setAcked(false);
    void load();
  }, [load]);

  const acknowledge = useCallback(() => {
    try {
      if (lastSeen.current != null) window.localStorage.setItem(ackKey(scopeKey), String(lastSeen.current));
    } catch {
      /* ignore */
    }
    setAcked(true);
  }, [scopeKey]);

  return useMemo(() => ({ read: acked ? null : read, acknowledge }), [acked, read, acknowledge]);
}
