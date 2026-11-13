import { MARKERS, DIFFICULTY_COLORS, pinSvg, type MarkerKind } from "./pins";

const SHOWN: MarkerKind[] = ["campground", "riverGauge", "boatLaunch"];

export function MapLegend() {
  const Pin = ({ kind, color }: { kind: MarkerKind; color: string }) => (
    <span className="legend-pin" dangerouslySetInnerHTML={{ __html: pinSvg(kind, color, 16) }} />
  );
  return (
    <div className="legend small">
      {Object.entries(DIFFICULTY_COLORS).map(([d, c]) => (
        <span key={d}><Pin kind="trailhead" color={c} /> {d.replace("-", " ")}</span>
      ))}
      {SHOWN.map((k) => (
        <span key={k}><Pin kind={k} color={MARKERS[k].color} /> {MARKERS[k].label}</span>
      ))}
    </div>
  );
}
