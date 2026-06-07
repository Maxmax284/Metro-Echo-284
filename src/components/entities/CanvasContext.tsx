import { createContext, useCallback, useContext, useState, ReactNode } from "react";

type OpenOptions = { projectId?: string | null };

type Ctx = {
  openCanvasSeed: string | null;
  seedProjectId: string | null;
  open: boolean;
  /** Backward-compatible: openCanvas(entityId?) still works; pass options to scope to a project. */
  openCanvas: (seedEntityId?: string | null, options?: OpenOptions) => void;
  closeCanvas: () => void;
};

const CanvasCtx = createContext<Ctx | null>(null);

export function CanvasProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [openCanvasSeed, setSeed] = useState<string | null>(null);
  const [seedProjectId, setProjectSeed] = useState<string | null>(null);
  const openCanvas = useCallback((seed: string | null = null, options?: OpenOptions) => {
    setSeed(seed);
    setProjectSeed(options?.projectId ?? null);
    setOpen(true);
  }, []);
  const closeCanvas = useCallback(() => setOpen(false), []);
  return (
    <CanvasCtx.Provider value={{ open, openCanvasSeed, seedProjectId, openCanvas, closeCanvas }}>
      {children}
    </CanvasCtx.Provider>
  );
}

export function useCanvas() {
  const c = useContext(CanvasCtx);
  if (!c) throw new Error("useCanvas must be used within CanvasProvider");
  return c;
}
