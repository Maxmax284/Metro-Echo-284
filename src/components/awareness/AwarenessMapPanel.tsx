// AwarenessMapPanel — the map, loaded only when it is needed and fenced off so
// a map problem can never take the room's words down with it. The read comes
// first; this is the picture underneath it.
import { Component, lazy, Suspense, type ReactNode } from "react";
import type { PlaceLike } from "@/lib/placeTruth";

const AwarenessMap = lazy(() =>
  import("@/components/awareness/AwarenessMap").then((m) => ({ default: m.AwarenessMap })),
);

class MapFence extends Component<{ children: ReactNode }, { broken: boolean }> {
  state = { broken: false };
  static getDerivedStateFromError() {
    return { broken: true };
  }
  render() {
    if (this.state.broken) {
      return (
        <div className="vanta-card rounded-xl p-3 text-[11.5px] text-muted-foreground">
          The map didn't load this time. Everything above still holds — it comes from the same place record.
        </div>
      );
    }
    return this.props.children;
  }
}

export function AwarenessMapPanel({
  places,
  onMoved,
  className,
}: {
  places: Array<PlaceLike & { id: string; label: string }>;
  onMoved?: () => void;
  className?: string;
}) {
  return (
    <MapFence>
      <Suspense
        fallback={
          <div className="vanta-card rounded-xl p-3 text-[11.5px] text-muted-foreground">Drawing the map…</div>
        }
      >
        <AwarenessMap places={places} onMoved={onMoved} className={className} />
      </Suspense>
    </MapFence>
  );
}
