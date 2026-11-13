import L from "leaflet";
import { MARKERS, DIFFICULTY_COLORS, pinSvg, type MarkerKind } from "./pins";

export { MARKERS, DIFFICULTY_COLORS, pinSvg, type MarkerKind };

const cache = new Map<string, L.DivIcon>();

export function markerIcon(kind: MarkerKind, opts: { difficulty?: string; selected?: boolean } = {}) {
  const color = (kind === "trailhead" && opts.difficulty && DIFFICULTY_COLORS[opts.difficulty]) || MARKERS[kind].color;
  const size = opts.selected ? 46 : 36;
  const key = `${kind}|${color}|${size}`;
  if (!cache.has(key)) {
    cache.set(
      key,
      L.divIcon({
        className: "pt-marker",
        html: pinSvg(kind, color, size),
        iconSize: [size, size * 1.25],
        iconAnchor: [size / 2, size * 1.25 - 1],
        popupAnchor: [0, -size * 1.1],
      }),
    );
  }
  return cache.get(key)!;
}
