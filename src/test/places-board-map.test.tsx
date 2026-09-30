import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlacesBoardMap } from "@/components/awareness/PlacesBoardMap";

describe("PlacesBoardMap guards", () => {
  it("renders nothing when every spot is missing real coordinates", () => {
    const { container } = render(
      <PlacesBoardMap
        spots={[
          { id: "a", name: "Nowhere", lat: NaN, lon: NaN },
          { id: "b", name: "Null Island", lat: 0, lon: 0 },
        ]}
        activeId={null}
        liveId={null}
        onSelect={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("drops the bad spot but keeps the real ones on the map", () => {
    render(
      <PlacesBoardMap
        spots={[
          { id: "a", name: "Nowhere", lat: NaN, lon: 100.5 },
          { id: "b", name: "Bangkok", lat: 13.75, lon: 100.5 },
        ]}
        activeId={null}
        liveId={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText(/tap a pin to read that spot/i)).toBeTruthy();
  });

  it("never flies a zero-size map — jsdom has no layout, and nothing throws", () => {
    // The old code called flyTo blind; on a 0×0 map Leaflet computes NaN
    // internally and throws "Invalid LatLng object: (NaN, NaN)".
    render(
      <PlacesBoardMap
        spots={[{ id: "b", name: "Bangkok", lat: 13.75, lon: 100.5 }]}
        activeId={null}
        liveId="b"
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText(/tap a pin to read that spot/i)).toBeTruthy();
  });
});
