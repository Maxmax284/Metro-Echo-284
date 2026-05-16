import { createContext, useContext, useMemo, useState, useCallback, ReactNode } from "react";

export type CurrentContext = {
  surface: string;
  selected_entity?: { type: string; id: string } | null;
  visible_card_ids?: string[];
  hint?: string;
};

type Ctx = {
  context: CurrentContext;
  setContext: (patch: Partial<CurrentContext>) => void;
};

const CurrentContextCtx = createContext<Ctx | null>(null);

export function CurrentContextProvider({ children }: { children: ReactNode }) {
  const [context, setRaw] = useState<CurrentContext>({ surface: "command" });
  const setContext = useCallback((patch: Partial<CurrentContext>) => {
    setRaw((prev) => ({ ...prev, ...patch }));
  }, []);
  const value = useMemo(() => ({ context, setContext }), [context, setContext]);
  return <CurrentContextCtx.Provider value={value}>{children}</CurrentContextCtx.Provider>;
}

export function useCurrentContext() {
  const v = useContext(CurrentContextCtx);
  if (!v) throw new Error("useCurrentContext must be inside CurrentContextProvider");
  return v;
}
