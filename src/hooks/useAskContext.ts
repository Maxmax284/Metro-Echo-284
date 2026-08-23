// useAskContext — the one way any surface hands work to Ask.
//
// A surface never invents thread state and never pushes raw text into a chat.
// It says "this is what I'm looking at" plus an optional opening question, and
// the thread engine either reuses the thread already bound to that record or
// starts one bound to it. Nothing executes here; Ask only reads and drafts.
import { useCallback } from "react";
import { useCompanion } from "@/components/companion/CompanionContext";
import { useAskThreads } from "@/providers/AskThreadProvider";
import type { ThreadContext, ThreadContextKind } from "@/lib/askThreads";

export type AskContextRequest = ThreadContext & {
  /** Opening question. Prefilled, never sent for the user. */
  question?: string;
  /** Open the full Ask room instead of the dock. */
  expand?: boolean;
};

export function useAskContext() {
  const { ensureThread, bindContext } = useAskThreads();
  const { openWithPrefill, open, expand } = useCompanion();

  /** Open Ask carrying a record's context, so the user never re-explains it. */
  const openAskWithContext = useCallback(
    async (req: AskContextRequest) => {
      const context: ThreadContext = { kind: req.kind, id: req.id ?? null, label: req.label };
      const id = await ensureThread(context);
      if (id) await bindContext(id, context);
      if (req.question) openWithPrefill(req.question);
      else open();
      if (req.expand) expand();
      return id;
    },
    [ensureThread, bindContext, openWithPrefill, open, expand],
  );

  return { openAskWithContext };
}

export type AskContextApi = ReturnType<typeof useAskContext>;
export type { ThreadContextKind };
