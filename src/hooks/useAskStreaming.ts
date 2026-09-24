// useAskStreaming — is this thread mid-turn right now?
// Reads the volatile Ask session store so the thread list can show a live
// marker even when the conversation surface for that thread isn't mounted.
import { useEffect, useState } from "react";
import { getAskSession, subscribeAskSession } from "@/lib/askSession";

export function useAskStreaming(threadId: string | null | undefined): boolean {
  const [streaming, setStreaming] = useState(() =>
    threadId ? getAskSession(threadId).streaming : false,
  );

  useEffect(() => {
    if (!threadId) { setStreaming(false); return; }
    setStreaming(getAskSession(threadId).streaming);
    return subscribeAskSession(threadId, (s) => setStreaming(s.streaming));
  }, [threadId]);

  /* The alley neon leans in while Echo is working. Light only. */
  useEffect(() => {
    if (!streaming) return;
    document.documentElement.setAttribute("data-thinking", "1");
    return () => document.documentElement.removeAttribute("data-thinking");
  }, [streaming]);

  return streaming;
}
