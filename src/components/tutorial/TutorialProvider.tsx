// TutorialProvider — persistent first-run state via localStorage (no schema
// changes). Provides startTutorial(), startTutorialAt(), resumeTutorial() and
// a context flag so other components can mount once auth is settled.
//
// Position is durable: the slide index, the oriented check and whether the
// walkthrough was left open all survive a refresh or a new login on the same
// device, so "continue where I left off" is real and not a reset.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type TutorialState = {
  completed: boolean;
  dismissed: boolean;
  step: number;
  /** Was the walkthrough open when the page went away? */
  resume: boolean;
  /** The final-slide check, persisted so a refresh doesn't undo it. */
  oriented: boolean;
};

const KEY = "vanta.tutorial.state.v1";
const DEFAULT: TutorialState = {
  completed: false,
  dismissed: false,
  step: 0,
  resume: false,
  oriented: false,
};

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
  /** True when the walkthrough opened at a saved position, not at slide one. */
  resumed: boolean;
  oriented: boolean;
  setOriented: (v: boolean) => void;
  setStep: (n: number) => void;
  /** Restart from the first slide. */
  startTutorial: () => void;
  /** Open the walkthrough at a specific slide (used by "Start from here"). */
  startTutorialAt: (n: number) => void;
  /** Open at the last saved slide. */
  resumeTutorial: () => void;
  closeTutorial: (markCompleted?: boolean) => void;
};

const TutorialContext = createContext<Ctx | null>(null);

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<TutorialState>(() => load());
  const [open, setOpen] = useState(false);
  const [resumed, setResumed] = useState(false);

  // Do NOT auto-open the blocking walkthrough on first run — the Daily
  // Bulletin is the front door. The one exception: the user was mid-orientation
  // when the page reloaded, so we put them back where they were.
  useEffect(() => {
    if (state.completed) return;
    if (state.resume && state.step > 0) {
      setResumed(true);
      setOpen(true);
    }
    // Intentionally mount-only: this is a restore, not a reaction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = useCallback((p: Partial<TutorialState>) => {
    setState((s) => {
      const next = { ...s, ...p };
      save(next);
      return next;
    });
  }, []);

  const setStep = useCallback((n: number) => patch({ step: n, resume: true }), [patch]);
  const setOriented = useCallback((v: boolean) => patch({ oriented: v }), [patch]);

  const startTutorial = useCallback(() => {
    patch({ dismissed: false, step: 0, resume: true, oriented: false });
    setResumed(false);
    setOpen(true);
  }, [patch]);

  const startTutorialAt = useCallback((n: number) => {
    patch({ dismissed: false, step: Math.max(0, n), resume: true });
    setResumed(false);
    setOpen(true);
  }, [patch]);

  const resumeTutorial = useCallback(() => {
    patch({ dismissed: false, resume: true });
    setResumed(true);
    setOpen(true);
  }, [patch]);

  const closeTutorial = useCallback((markCompleted?: boolean) => {
    patch({
      dismissed: true,
      completed: markCompleted ? true : state.completed,
      // Finishing clears the saved position; skipping keeps it for next time.
      resume: markCompleted ? false : true,
      step: markCompleted ? 0 : state.step,
    });
    setResumed(false);
    setOpen(false);
  }, [patch, state.completed, state.step]);

  const value = useMemo<Ctx>(() => ({
    open,
    step: state.step,
    resumed,
    oriented: state.oriented,
    setOriented,
    setStep,
    startTutorial,
    startTutorialAt,
    resumeTutorial,
    closeTutorial,
  }), [open, state.step, state.oriented, resumed, setOriented, setStep, startTutorial, startTutorialAt, resumeTutorial, closeTutorial]);

  return <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>;
}

export function useTutorial() {
  const ctx = useContext(TutorialContext);
  if (!ctx) throw new Error("useTutorial must be used inside TutorialProvider");
  return ctx;
}
