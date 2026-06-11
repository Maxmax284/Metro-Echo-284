// TutorialProvider — persistent first-run state via localStorage (no schema
// changes). Provides startTutorial(), dismissTutorial(), and a context flag
// so other components can mount once auth is settled.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type TutorialState = {
  completed: boolean;
  dismissed: boolean;
  step: number;
};

const KEY = "vanta.tutorial.state.v1";
const DEFAULT: TutorialState = { completed: false, dismissed: false, step: 0 };

function load(): TutorialState {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    return DEFAULT;
  }
}

function save(s: TutorialState) {
  try { window.localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* noop */ }
}

type Ctx = {
  open: boolean;
  step: number;
  setStep: (n: number) => void;
  startTutorial: () => void;
  closeTutorial: (markCompleted?: boolean) => void;
};

const TutorialContext = createContext<Ctx | null>(null);

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<TutorialState>(() => load());
  const [open, setOpen] = useState(false);

  // Do NOT auto-open the blocking walkthrough on first run — the Daily
  // Bulletin is the front door now. Users can open the tutorial from the
  // header "What is this?" / Settings → Replay tutorial. We just mark
  // dismissed-without-completion so the soft welcome chip can show once.
  useEffect(() => {
    if (state.completed || state.dismissed) return;
    // No-op: leave `open` false. Soft welcome surfaces elsewhere.
  }, [state.completed, state.dismissed]);


  const setStep = useCallback((n: number) => {
    setState((s) => {
      const next = { ...s, step: n };
      save(next);
      return next;
    });
  }, []);

  const startTutorial = useCallback(() => {
    setState((s) => {
      const next = { ...s, dismissed: false, step: 0 };
      save(next);
      return next;
    });
    setOpen(true);
  }, []);

  const closeTutorial = useCallback((markCompleted?: boolean) => {
    setState((s) => {
      const next = { ...s, dismissed: true, completed: markCompleted ? true : s.completed };
      save(next);
      return next;
    });
    setOpen(false);
  }, []);

  const value = useMemo<Ctx>(() => ({
    open, step: state.step, setStep, startTutorial, closeTutorial,
  }), [open, state.step, setStep, startTutorial, closeTutorial]);

  return <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>;
}

export function useTutorial() {
  const ctx = useContext(TutorialContext);
  if (!ctx) throw new Error("useTutorial must be used inside TutorialProvider");
  return ctx;
}
