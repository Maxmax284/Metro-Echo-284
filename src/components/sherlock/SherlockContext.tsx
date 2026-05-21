import { createContext, useCallback, useContext, useState, ReactNode } from "react";
import type { SherlockOperation } from "@/hooks/useSherlockCache";

export type SherlockScope = {
  entity_type: "message" | "note" | "action" | "commitment" | "briefing" | "file" | "freeform";
  entity_id?: string | null;
  title?: string;
  text?: string;
  /**
   * Which Sherlock operation to run by default when the overlay opens.
   * Defaults to "investigate" (legacy overlay behavior).
   */
  operation?: SherlockOperation;
};

export type SherlockFindings = {
  summary?: string;
  risks?: Array<{ claim: string; severity?: string; rationale?: string; refs?: string[] }>;
  missing_info?: Array<{ claim: string; rationale?: string }>;
  related?: Array<{ kind: string; id?: string; snippet?: string; why?: string; confidence?: string }>;
  contradictions?: Array<{ claim: string; refs?: string[] }>;
  assumptions?: Array<{ claim: string; rationale?: string }>;
  dependencies?: Array<{ claim: string; refs?: string[] }>;
  blind_spots?: Array<{ claim: string }>;
  confidence?: "low" | "medium" | "high";
  // observe / suggest / extract shapes
  kind?: string;
  salient?: string;
  suggested_route?: string;
  rationale?: string;
  title?: string;
  due_hint?: string;
  risk?: string;
  document_type?: string;
};

type Ctx = {
  open: boolean;
  scope: SherlockScope | null;
  findings: SherlockFindings | null;
  loading: boolean;
  openSherlock: (scope: SherlockScope, prefill?: SherlockFindings) => void;
  closeSherlock: () => void;
  setFindings: (f: SherlockFindings) => void;
  setLoading: (b: boolean) => void;
};

const SherlockCtx = createContext<Ctx | null>(null);

export function SherlockProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<SherlockScope | null>(null);
  const [findings, setFindings] = useState<SherlockFindings | null>(null);
  const [loading, setLoading] = useState(false);

  const openSherlock = useCallback((s: SherlockScope, prefill?: SherlockFindings) => {
    setScope(s);
    setFindings(prefill ?? null);
    setOpen(true);
  }, []);

  const closeSherlock = useCallback(() => setOpen(false), []);

  return (
    <SherlockCtx.Provider value={{ open, scope, findings, loading, openSherlock, closeSherlock, setFindings, setLoading }}>
      {children}
    </SherlockCtx.Provider>
  );
}

export function useSherlock() {
  const ctx = useContext(SherlockCtx);
  if (!ctx) throw new Error("useSherlock must be used inside SherlockProvider");
  return ctx;
}
