// ProjectsMap — the map behind the list, fenced off so a map problem can never
// take the list of projects down with it. The names come first; this confirms
// where they are.
import { Component, lazy, Suspense, type ReactNode } from "react";
import type { MapPin } from "./ProjectsMapInner";

const Inner = lazy(() =>
  import("./ProjectsMapInner").then((m) => ({ default: m.ProjectsMapInner })),
);

class MapFence extends Component<{ children: ReactNode }, { broken: boolean }> {
  state = { broken: false };
  static getDerivedStateFromError() {
    return { broken: true };
  }
  render() {
    if (this.state.broken) {
      return (
        <div className="rounded-xl border border-border/60 p-3 text-[11.5px] text-muted-foreground">
          The map didn't load this time. Every project below still holds — the places come from the projects
          themselves.
        </div>
      );
    }
    return this.props.children;
  }
}

export function ProjectsMap({
  pins,
  center,
  onPick,
  onOpen,
  height = 220,
}: {
  pins: MapPin[];
  center?: [number, number] | null;
  onPick?: (lat: number, lon: number) => void;
  onOpen?: (id: string) => void;
  height?: number;
}) {
  return (
    <MapFence>
      <Suspense
        fallback={
          <div
            className="rounded-xl border border-border/60 p-3 text-[11.5px] text-muted-foreground"
            style={{ height }}
          >
            Drawing the map…
          </div>
        }
      >
        <div style={{ height }} className="overflow-hidden rounded-xl border border-border/60">
          <Inner pins={pins} center={center} onPick={onPick} onOpen={onOpen} className="h-full w-full" />
        </div>
      </Suspense>
    </MapFence>
  );
}

export type { MapPin };
