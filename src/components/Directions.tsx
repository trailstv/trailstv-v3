"use client";

import { useEffect, useState } from "react";
import { appleDirections, googleDirections, type Place } from "@/lib/directions";

/** "Directions" button that opens the platform's maps app; Apple devices get Apple Maps first. */
export function Directions({ place, compact }: { place: Place; compact?: boolean }) {
  const [apple, setApple] = useState(false);
  useEffect(() => setApple(/iPhone|iPad|Macintosh/.test(navigator.userAgent)), []);
  const primary = apple ? appleDirections(place) : googleDirections(place);
  const alt = apple ? googleDirections(place) : appleDirections(place);

  if (compact) return <a href={primary} target="_blank" rel="noopener">Directions ↗</a>;
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <a className="act" href={primary} target="_blank" rel="noopener">🧭 Directions</a>
      <a className="small" href={alt} target="_blank" rel="noopener">{apple ? "Google Maps" : "Apple Maps"}</a>
    </span>
  );
}
