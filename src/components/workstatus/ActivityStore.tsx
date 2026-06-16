// ActivityStore — in-session global Work Status store.
// In-memory only by design (see plan.md risks). Anything that must persist
// is already written by the underlying pipelines (exports, receipts, etc.).
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import {
  humanizeWorkError,
  newWorkId,
  type WorkItem,
  type WorkKind,
  type WorkPrimaryAction,
  type WorkState,
} from "@/lib/workStatus";

type Action =
  | { type: "start"; item: WorkItem }
  | { type: "advance"; id: string; step: number }
  | { type: "patch"; id: string; patch: Partial<WorkItem> }
  | { type: "set_state"; id: string; state: WorkState; extra?: Partial<WorkItem> }
  | { type: "remove"; id: string };

function reducer(state: WorkItem[], a: Action): WorkItem[] {
  switch (a.type) {
    case "start":
      return [a.item, ...state.filter((i) => i.id !== a.item.id)];
    case "advance":
      return state.map((i) =>
        i.id === a.id ? { ...i, currentStep: Math.min(a.step, i.steps.length - 1) } : i,
      );
    case "patch":
      return state.map((i) => (i.id === a.id ? { ...i, ...a.patch } : i));
    case "set_state":
      return state.map((i) =>
        i.id === a.id
          ? {
              ...i,
              state: a.state,
              finishedAt: ["complete", "failed", "canceled"].includes(a.state) ? Date.now() : i.finishedAt,
              ...(a.extra ?? {}),
            }
          : i,
      );
    case "remove":
      return state.filter((i) => i.id !== a.id);
  }
}

export interface StartOpts {
  kind: WorkKind;
  title: string;
  steps: string[];
  projectName?: string;
}

export interface WorkHandle {
  id: string;
  advance: (stepIndex: number) => void;
  patch: (patch: Partial<WorkItem>) => void;
  complete: (opts?: { destination?: string; primaryAction?: WorkPrimaryAction; secondaryAction?: WorkPrimaryAction; tertiaryAction?: WorkPrimaryAction }) => void;
  fail: (opts?: { message?: string; retry?: WorkPrimaryAction }) => void;
  waitForUser: (opts?: { message?: string; primaryAction?: WorkPrimaryAction }) => void;
  cancel: () => void;
}

interface ActivityCtx {
  items: WorkItem[];
  start: (opts: StartOpts) => WorkHandle;
  remove: (id: string) => void;
}

const Ctx = createContext<ActivityCtx | null>(null);

const AUTO_REMOVE_COMPLETE_MS = 8000;

export function ActivityProvider({ children }: { children: ReactNode }) {
  const [items, dispatch] = useReducer(reducer, [] as WorkItem[]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Auto-clear completed items after a moment so the tray doesn't grow forever.
  useEffect(() => {
    const timers = timersRef.current;
    for (const item of items) {
      if (item.state === "complete" && !timers.has(item.id)) {
        const t = setTimeout(() => {
          dispatch({ type: "remove", id: item.id });
          timers.delete(item.id);
        }, AUTO_REMOVE_COMPLETE_MS);
        timers.set(item.id, t);
      }
    }
    // Clean timers for items no longer present.
    for (const id of Array.from(timers.keys())) {
      if (!items.find((i) => i.id === id)) {
        clearTimeout(timers.get(id)!);
        timers.delete(id);
      }
    }
  }, [items]);

  useEffect(() => () => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current.clear();
  }, []);

  const start = useCallback((opts: StartOpts): WorkHandle => {
    const id = newWorkId();
    const item: WorkItem = {
      id,
      kind: opts.kind,
      title: opts.title,
      projectName: opts.projectName,
      steps: opts.steps.length > 0 ? opts.steps : ["Working"],
      currentStep: 0,
      state: "working",
      startedAt: Date.now(),
    };
    dispatch({ type: "start", item });
    return {
      id,
      advance: (step) => dispatch({ type: "advance", id, step }),
      patch: (patch) => dispatch({ type: "patch", id, patch }),
      complete: (o) =>
        dispatch({
          type: "set_state",
          id,
          state: "complete",
          extra: { destination: o?.destination, primaryAction: o?.primaryAction, secondaryAction: o?.secondaryAction, tertiaryAction: o?.tertiaryAction, currentStep: (opts.steps.length || 1) - 1 },
        }),
      fail: (o) =>
        dispatch({
          type: "set_state",
          id,
          state: "failed",
          extra: {
            error: o?.message ?? humanizeWorkError(opts.kind),
            primaryAction: o?.retry,
          },
        }),
      waitForUser: (o) =>
        dispatch({
          type: "set_state",
          id,
          state: "waiting_for_user",
          extra: { error: o?.message, primaryAction: o?.primaryAction },
        }),
      cancel: () => dispatch({ type: "set_state", id, state: "canceled" }),
    };
  }, []);

  const remove = useCallback((id: string) => dispatch({ type: "remove", id }), []);

  const value = useMemo<ActivityCtx>(() => ({ items, start, remove }), [items, start, remove]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useActivity(): ActivityCtx {
  const v = useContext(Ctx);
  if (!v) {
    // Safe no-op fallback so components don't crash if used outside the provider.
    return {
      items: [],
      start: () => ({
        id: "",
        advance: () => {},
        patch: () => {},
        complete: () => {},
        fail: () => {},
        waitForUser: () => {},
        cancel: () => {},
      }),
      remove: () => {},
    };
  }
  return v;
}
