import { useEffect, useState } from "react";

export type OperationalState = "capturing" | "planning" | "executing" | "moving" | "ambient";

type Signals = {
  hour: number;
  surface: string;
  hasGeo: boolean;
  movedRecently: boolean;
  recentInputs: number;
};

function infer(s: Signals): OperationalState {
  if (s.movedRecently) return "moving";
  if (s.surface === "actions") return "executing";
  if (s.surface === "memory") return "planning";
  if (s.recentInputs > 2) return "capturing";
  return "ambient";
}

export function useOperationalState(surface: string) {
  const [state, setState] = useState<OperationalState>("ambient");
  const [recentInputs, setRecentInputs] = useState(0);

  useEffect(() => {
    const sig: Signals = {
      hour: new Date().getHours(),
      surface,
      hasGeo: typeof navigator !== "undefined" && "geolocation" in navigator,
      movedRecently: false,
      recentInputs,
    };
    setState(infer(sig));
  }, [surface, recentInputs]);

  return { state, registerInput: () => setRecentInputs((n) => n + 1) };
}
