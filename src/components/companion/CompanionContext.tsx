import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from "react";

type Mode = "closed" | "panel" | "full";

type Ctx = {
  mode: Mode;
  open: () => void;
  close: () => void;
  toggle: () => void;
  expand: () => void;
  collapse: () => void;
  /** Stage 6 — pending dock prefill (consumed once by ConversationSurface). */
  prefill: string | null;
  setPrefill: (text: string | null) => void;
  /** Convenience: open the companion panel with a prefilled message. */
  openWithPrefill: (text: string) => void;
};

const CompanionCtx = createContext<Ctx | null>(null);

export function CompanionProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>("closed");
  const [prefill, setPrefill] = useState<string | null>(null);
  const open = useCallback(() => setMode("panel"), []);
  const close = useCallback(() => setMode("closed"), []);
  const toggle = useCallback(() => setMode((m) => (m === "closed" ? "panel" : "closed")), []);
  const expand = useCallback(() => setMode("full"), []);
  const collapse = useCallback(() => setMode("panel"), []);
  const openWithPrefill = useCallback((text: string) => {
    setPrefill(text);
    setMode((m) => (m === "closed" ? "panel" : m));
  }, []);
  const value = useMemo(
    () => ({ mode, open, close, toggle, expand, collapse, prefill, setPrefill, openWithPrefill }),
    [mode, open, close, toggle, expand, collapse, prefill, openWithPrefill],
  );
  return <CompanionCtx.Provider value={value}>{children}</CompanionCtx.Provider>;
}

export function useCompanion() {
  const v = useContext(CompanionCtx);
  if (!v) throw new Error("useCompanion must be inside CompanionProvider");
  return v;
}
