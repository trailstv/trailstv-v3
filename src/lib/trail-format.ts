import type { Trail } from "./types";

/** "5.4 mi · 1,488 ft · hard · permit", skipping anything not known yet. */
export function trailMeta(t: Pick<Trail, "distanceMi" | "gainFt" | "difficulty" | "permit">, opts: { permit?: boolean } = {}) {
  return [
    `${t.distanceMi} mi`,
    t.gainFt != null ? `${t.gainFt.toLocaleString()} ft` : null,
    t.difficulty ? t.difficulty.replace("-", " ") : null,
    opts.permit !== false && t.permit ? "permit" : null,
  ].filter(Boolean).join(" · ");
}

export const difficultyLabel = (d: Trail["difficulty"]) => (d ? d.replace("-", " ") : "not rated");
export const DIFF_ICON: Record<string, string> = { easy: "🟢", moderate: "🔵", hard: "🟠", "very-hard": "🔴" };
export const diffIcon = (d: Trail["difficulty"]) => (d ? DIFF_ICON[d] : "🥾");
