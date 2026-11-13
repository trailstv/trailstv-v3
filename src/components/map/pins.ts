// Leaflet-free so it can render on the server (legend, SSR).
/**
 * Custom map markers: an SVG teardrop pin with a white glyph, built as a
 * Leaflet divIcon (see icons.ts). No image files, so there's no broken-default-icon bug, and
 * you can restyle every marker by editing MARKERS below.
 */

export type MarkerKind =
  | "trailhead" | "campground" | "boatLaunch" | "riverGauge" | "climbing"
  | "ski" | "viewpoint" | "visitorCenter" | "webcam" | "park";

/** 24×24 glyphs drawn in white inside the pin. */
const GLYPHS: Record<MarkerKind, string> = {
  trailhead: '<path d="M13 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm-3 5 3-1 2 3 3 1-.5 1.8-3.8-1.2-1 3 2.3 2.4V22h-2v-4.1L10.5 16 9 22H7l2.2-9.6L8 13v3H6v-4.3L10 9Z"/>',
  campground: '<path d="M12 3 2 21h7l3-6 3 6h7L12 3Zm0 4.2L18.6 19h-2.4L12 11l-4.2 8H5.4L12 7.2Z"/>',
  boatLaunch: '<path d="M11 3v10H5l6-10Zm2 2 5 8h-5V5ZM3 15h18l-2.5 4.5a2 2 0 0 1-1.7 1H7.2a2 2 0 0 1-1.7-1L3 15Z"/>',
  riverGauge: '<path d="M2 15c2 0 2-1.5 4-1.5S8 15 10 15s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5v2c-2 0-2 1.5-4 1.5s-2-1.5-4-1.5-2 1.5-4 1.5-2-1.5-4-1.5-2 1.5-4 1.5v-2Zm0 4c2 0 2-1.5 4-1.5S8 19 10 19s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5v2c-2 0-2 1.5-4 1.5s-2-1.5-4-1.5-2 1.5-4 1.5-2-1.5-4-1.5-2 1.5-4 1.5v-2ZM12 2s5 5.3 5 8.5a5 5 0 0 1-10 0C7 7.3 12 2 12 2Z"/>',
  climbing: '<path d="M8 3h2l1 4 3-1 1 2-3 2 2 5-2 1-2-4-2 2v6H6v-7l2-3-1-3 1-4Zm9 1a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z"/>',
  ski: '<path d="M15 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm-6 5 5 1 2 3 3 .5-.3 2-4-.7-1.2-1.6-1.6 2.6L15 17l-1 1-4-2.3 1.8-3.5L9 11l-2 2-1.5-1.3L9 8ZM2 19.5 21 15l.4 1.8-19 4.6L2 19.5Z"/>',
  viewpoint: '<path d="M12 5c5 0 9 4.5 10 7-1 2.5-5 7-10 7S3 14.5 2 12c1-2.5 5-7 10-7Zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z"/>',
  visitorCenter: '<path d="M11 7h2v2h-2V7Zm0 4h2v6h-2v-6Zm1-9a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z"/>',
  webcam: '<path d="M4 6h11a2 2 0 0 1 2 2v1.5L21 7v10l-4-2.5V16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"/>',
  park: '<path d="M12 2 5 13h4l-4 6h6v3h2v-3h6l-4-6h4L12 2Z"/>',
};

export const MARKERS: Record<MarkerKind, { color: string; label: string }> = {
  trailhead: { color: "#3a6a8c", label: "Trailhead" },
  campground: { color: "#8a5a2b", label: "Campground" },
  boatLaunch: { color: "#2f6f80", label: "Boat launch" },
  riverGauge: { color: "#5e9aa6", label: "River gauge" },
  climbing: { color: "#a2462e", label: "Climbing" },
  ski: { color: "#4a6fa5", label: "Ski / snow" },
  viewpoint: { color: "#c27a3a", label: "Viewpoint" },
  visitorCenter: { color: "#5b4b8a", label: "Visitor center" },
  webcam: { color: "#444", label: "Webcam" },
  park: { color: "#1e3a52", label: "Park" },
};

/** Trailheads are tinted by difficulty, like trail ratings on AllTrails. */
export const DIFFICULTY_COLORS: Record<string, string> = {
  easy: "#3c8d4f", moderate: "#3a6a8c", hard: "#c0563c", "very-hard": "#7d2a1d",
};

export function pinSvg(kind: MarkerKind, color: string, size = 36) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size * 1.25}" viewBox="0 0 36 45" aria-hidden="true">
    <path d="M18 44s15-15.2 15-26A15 15 0 0 0 3 18c0 10.8 15 26 15 26Z" fill="${color}" stroke="#fff" stroke-width="2"/>
    <g transform="translate(8 7) scale(.83)" fill="#fff">${GLYPHS[kind]}</g>
  </svg>`;
}

