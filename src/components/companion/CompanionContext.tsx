import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from "react";

type Mode = "closed" | "panel" | "full";

type Ctx = {
  mode: Mode;
  open: () => void;
  close: () => void;
  toggle: () => void;
  expand: () => void;
  collapse: () => void;
};

const CompanionCtx = createContext<Ctx | null>(null);

export function CompanionProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>("closed");
  const open = useCallback(() => setMode("panel"), []);
  const close = useCallback(() => setMode("closed"), []);
  const toggle = useCallback(() => setMode((m) => (m === "closed" ? "panel" : "closed")), []);
  const expand = useCallback(() => setMode("full"), []);
  const collapse = useCallback(() => setMode("panel"), []);
  const value = useMemo(() => ({ mode, open, close, toggle, expand, collapse }), [mode, open, close, toggle, expand, collapse]);
  return <CompanionCtx.Provider value={value}>{children}</CompanionCtx.Provider>;
}

export function useCompanion() {
  const v = useContext(CompanionCtx);
  if (!v) throw new Error("useCompanion must be inside CompanionProvider");
  return v;
}
