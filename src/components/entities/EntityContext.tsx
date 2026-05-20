import { createContext, useCallback, useContext, useState, ReactNode } from "react";

type Ctx = {
  openEntityId: string | null;
  openEntity: (id: string) => void;
  closeEntity: () => void;
};

const EntityCtx = createContext<Ctx | null>(null);

export function EntityProvider({ children }: { children: ReactNode }) {
  const [openEntityId, setOpenEntityId] = useState<string | null>(null);
  const openEntity = useCallback((id: string) => setOpenEntityId(id), []);
  const closeEntity = useCallback(() => setOpenEntityId(null), []);
  return (
    <EntityCtx.Provider value={{ openEntityId, openEntity, closeEntity }}>
      {children}
    </EntityCtx.Provider>
  );
}

export function useEntitySheet() {
  const c = useContext(EntityCtx);
  if (!c) throw new Error("useEntitySheet must be used within EntityProvider");
  return c;
}
