import { createContext, useCallback, useContext, useState, ReactNode } from "react";

type Ctx = {
  openCanvasSeed: string | null;
  open: boolean;
  openCanvas: (seedEntityId?: string | null) => void;
  closeCanvas: () => void;
};

const CanvasCtx = createContext<Ctx | null>(null);

export function CanvasProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [openCanvasSeed, setSeed] = useState<string | null>(null);
  const openCanvas = useCallback((seed: string | null = null) => { setSeed(seed); setOpen(true); }, []);
  const closeCanvas = useCallback(() => setOpen(false), []);
  return (
    <CanvasCtx.Provider value={{ open, openCanvasSeed, openCanvas, closeCanvas }}>
      {children}
    </CanvasCtx.Provider>
  );
}

export function useCanvas() {
  const c = useContext(CanvasCtx);
  if (!c) throw new Error("useCanvas must be used within CanvasProvider");
  return c;
}
