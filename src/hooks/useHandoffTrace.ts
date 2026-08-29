// useHandoffTrace — leave a pointer so the next body knows where you were.
//
// Doctrine: a trace is a pointer, not a permission. It records what you were on
// and what you last did, stamped with the current scope so it can never surface
// in a different one. It never records an approval and never triggers work.
import { useCallback } from "react";
import { useVantaContext } from "@/providers/VantaContextProvider";
import { useScope } from "@/hooks/useScope";

export type HandoffTrace = {
  /** Plain-English last step: "reviewed booking drift". */
  step: string;
  /** What it was about: a project title, a thread name. */
  label?: string | null;
  /** Which surface to reopen. */
  surface?: string | null;
  projectId?: string | null;
  threadId?: string | null;
};

export function useHandoffTrace() {
  const { remember } = useVantaContext();
  const { key } = useScope();

  return useCallback(
    (trace: HandoffTrace) =>
      remember(
        {
          lastStep: trace.step,
          lastAnchorLabel: trace.label ?? null,
          lastAnchorSurface: trace.surface ?? null,
          projectId: trace.projectId ?? null,
          threadId: trace.threadId ?? null,
        },
        { scopeKey: key },
      ),
    [remember, key],
  );
}
