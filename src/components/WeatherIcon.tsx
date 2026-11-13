/**
 * TrailsTV weather icons, drawn in the site palette and chosen from the NWS
 * forecast text (e.g. "Chance Rain Showers", "Mostly Clear", "Areas Of Smoke").
 */

export type WxKind =
  | "clear" | "partly" | "cloudy" | "fog" | "smoke" | "wind"
  | "rain" | "showers" | "thunder" | "snow" | "sleet" | "hot" | "cold";

export function wxKind(text: string): WxKind {
  const t = text.toLowerCase();
  if (/thunder|t-storm|tstorm/.test(t)) return "thunder";
  if (/sleet|freezing|ice pellets|wintry mix|rain and snow|snow and rain/.test(t)) return "sleet";
  if (/snow|flurr|blizzard/.test(t)) return "snow";
  if (/shower|chance rain|slight chance|scattered|isolated|sprinkles/.test(t) && /rain|shower|drizzle|sprinkle/.test(t)) return "showers";
  if (/rain|drizzle/.test(t)) return "rain";
  if (/smoke|haze|dust|ash/.test(t)) return "smoke";
  if (/fog|mist/.test(t)) return "fog";
  if (/wind|breezy|blustery|gust/.test(t)) return "wind";
  if (/partly|mostly sunny|mostly clear|few clouds|becoming sunny|increasing clouds|decreasing clouds/.test(t)) return "partly";
  if (/cloud|overcast/.test(t)) return "cloudy";
  if (/hot/.test(t)) return "hot";
  if (/cold|frost/.test(t)) return "cold";
  return "clear";
}

const C = { sun: "#e3a13f", sunCore: "#f2c46b", moon: "#c9d6e3", cloud: "#b9c5d1", cloudDark: "#8c9aab", rain: "#3a6a8c", snow: "#5e9aa6", bolt: "#c27a3a", fog: "#9aa8b6", smoke: "#a39582" };

const Sun = ({ x = 24, y = 24, r = 9 }: { x?: number; y?: number; r?: number }) => (
  <g>
    {Array.from({ length: 8 }, (_, i) => {
      const a = (i * Math.PI) / 4;
      return <line key={i} x1={x + Math.cos(a) * (r + 3)} y1={y + Math.sin(a) * (r + 3)} x2={x + Math.cos(a) * (r + 7)} y2={y + Math.sin(a) * (r + 7)} stroke={C.sun} strokeWidth="2.6" strokeLinecap="round" />;
    })}
    <circle cx={x} cy={y} r={r} fill={C.sunCore} stroke={C.sun} strokeWidth="2.2" />
  </g>
);
const Moon = ({ x = 24, y = 22 }: { x?: number; y?: number }) => (
  <path d={`M${x + 4} ${y - 12}a12 12 0 1 0 9 17a10 10 0 0 1 -9 -17z`} fill={C.moon} stroke="#8c9aab" strokeWidth="1.8" strokeLinejoin="round" />
);
const Cloud = ({ dx = 0, dy = 0, fill = C.cloud }: { dx?: number; dy?: number; fill?: string }) => (
  <path transform={`translate(${dx} ${dy})`} d="M14 34h21a8 8 0 0 0 .6-16a11 11 0 0 0-21 2.5A7 7 0 0 0 14 34z" fill={fill} stroke="#7d8b9b" strokeWidth="1.6" strokeLinejoin="round" />
);
const Drops = ({ color = C.rain, n = 3, dy = 0 }: { color?: string; n?: number; dy?: number }) => (
  <g stroke={color} strokeWidth="2.6" strokeLinecap="round">
    {Array.from({ length: n }, (_, i) => <line key={i} x1={17 + i * 7} y1={38 + dy} x2={15 + i * 7} y2={44 + dy} />)}
  </g>
);
const Flakes = () => (
  <g stroke={C.snow} strokeWidth="2" strokeLinecap="round">
    {[16, 24, 32].map((x) => (
      <g key={x} transform={`translate(${x} 41)`}>
        <line x1="-3" y1="0" x2="3" y2="0" /><line x1="-1.5" y1="-2.6" x2="1.5" y2="2.6" /><line x1="1.5" y1="-2.6" x2="-1.5" y2="2.6" />
      </g>
    ))}
  </g>
);

export function WeatherIcon({ forecast, isDaytime = true, className = "wx" }: { forecast: string; isDaytime?: boolean; className?: string }) {
  const kind = wxKind(forecast);
  const Celestial = isDaytime ? <Sun x={18} y={17} r={7} /> : <Moon x={16} y={16} />;
  let body: React.ReactNode;
  switch (kind) {
    case "clear": case "hot": body = isDaytime ? <Sun /> : <Moon />; break;
    case "cold": body = <>{isDaytime ? <Sun /> : <Moon />}<g stroke={C.snow} strokeWidth="2" strokeLinecap="round"><line x1="38" y1="34" x2="38" y2="44" /><line x1="33.7" y1="36.5" x2="42.3" y2="41.5" /><line x1="42.3" y1="36.5" x2="33.7" y2="41.5" /></g></>; break;
    case "partly": body = <>{Celestial}<Cloud dx={2} dy={4} /></>; break;
    case "cloudy": body = <><Cloud dx={-4} dy={-4} fill={C.cloudDark} /><Cloud dx={2} dy={2} /></>; break;
    case "rain": body = <><Cloud dy={-4} fill={C.cloudDark} /><Drops /></>; break;
    case "showers": body = <>{Celestial}<Cloud dx={2} dy={-2} /><Drops n={2} dy={-1} /></>; break;
    case "thunder": body = <><Cloud dy={-6} fill={C.cloudDark} /><path d="M25 30l-6 9h5l-3 8 9-11h-5l3-6z" fill={C.bolt} stroke="#8e5420" strokeWidth="1" strokeLinejoin="round" /></>; break;
    case "snow": body = <><Cloud dy={-5} /><Flakes /></>; break;
    case "sleet": body = <><Cloud dy={-5} /><g stroke={C.rain} strokeWidth="2.4" strokeLinecap="round"><line x1="16" y1="38" x2="14" y2="43" /><line x1="30" y1="38" x2="28" y2="43" /></g><circle cx="23" cy="42" r="2" fill={C.snow} /><circle cx="36" cy="41" r="2" fill={C.snow} /></>; break;
    case "fog": body = <><Cloud dy={-8} /><g stroke={C.fog} strokeWidth="2.6" strokeLinecap="round"><line x1="9" y1="33" x2="39" y2="33" /><line x1="13" y1="39" x2="43" y2="39" /><line x1="7" y1="45" x2="33" y2="45" /></g></>; break;
    case "smoke": body = <><circle cx="24" cy="22" r="10" fill="#e7b86a" opacity=".55" /><g stroke={C.smoke} strokeWidth="2.6" strokeLinecap="round" fill="none"><path d="M8 30c5-3 9 3 14 0s9-3 14 0 6 2 6 2" /><path d="M6 37c5-3 9 3 14 0s9-3 14 0 8 2 8 2" /><path d="M10 44c5-3 9 3 14 0s9-3 14 0" /></g></>; break;
    case "wind": body = <g stroke={C.cloudDark} strokeWidth="2.8" strokeLinecap="round" fill="none"><path d="M6 18h22a5 5 0 1 0-5-5" /><path d="M6 26h32a5 5 0 1 1-5 5" /><path d="M6 34h18" /></g>; break;
  }
  return (
    <svg className={className} viewBox="0 0 48 48" role="img" aria-label={forecast}>
      <title>{forecast}</title>
      {body}
    </svg>
  );
}
