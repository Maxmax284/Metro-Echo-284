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
  /** True when the prefill was a finished question, not a starting point:
      the dock should send it instead of waiting for a second tap. */
  prefillSend: boolean;
  /** Convenience: open the companion panel with a prefilled message.
      Pass { send: true } when the text is already the whole question. */
  openWithPrefill: (text: string, opts?: { send?: boolean }) => void;
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
  const [prefillSend, setPrefillSend] = useState(false);
  const openWithPrefill = useCallback((text: string, opts?: { send?: boolean }) => {
    setPrefillSend(opts?.send === true);
    setPrefill(text);
    setMode((m) => (m === "closed" ? "panel" : m));
  }, []);
  const value = useMemo(
    () => ({ mode, open, close, toggle, expand, collapse, prefill, setPrefill, prefillSend, openWithPrefill }),
    [mode, open, close, toggle, expand, collapse, prefill, prefillSend, openWithPrefill],
  );
  return <CompanionCtx.Provider value={value}>{children}</CompanionCtx.Provider>;
}

export function useCompanion() {
  const v = useContext(CompanionCtx);
  if (!v) throw new Error("useCompanion must be inside CompanionProvider");
  return v;
}
