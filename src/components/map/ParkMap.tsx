"use client";

import dynamic from "next/dynamic";
import type { LeafletMapProps } from "./LeafletMap";
import { MapLegend } from "./MapLegend";

// Leaflet touches `window` on import, so it must never render on the server.
const LeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => <div className="map map-loading">Loading map…</div>,
});

export function ParkMap(props: LeafletMapProps & { legend?: boolean }) {
  const { legend = true, ...rest } = props;
  return (
    <>
      <LeafletMap {...rest} />
      {legend && <MapLegend />}
    </>
  );
}

export type { MapMarker } from "./LeafletMap";
