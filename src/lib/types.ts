export type ConditionKey =
  | "weather"
  | "alerts"
  | "air"
  | "fire"
  | "sun"
  | "rivers"
  | "snow"
  | "avalanche"
  | "tides"
  | "campgrounds"
  | "boatLaunches"
  | "climbingClosures"
  | "webcams";

export interface Activity {
  slug: string;
  name: string;
  icon: string;
  season: "all" | "summer" | "winter";
  npsActivities: string[];
  conditions: ConditionKey[];
  description: string;
}

export interface Park {
  code: string;
  name: string;
  states: string[];
  lat: number;
  lon: number;
  radiusKm: number;
  tagline: string;
  activities: string[];
  highlights: string[];
  url: string;
  /** NOAA CO-OPS station id for coastal parks */
  tideStation?: string;
  /** avalanche.org center id (e.g. CAIC, NWAC) */
  avalancheCenter?: string;
  /** IANA zone, used to show sun times etc. in park-local time */
  timeZone: string;
  image?: string;
  /** True until `npm run sync:nps` fills in activities and description. */
  stub?: boolean;
}

export type TrailUseKey = "hike" | "bike" | "horse" | "dog" | "wheelchair" | "snowshoe" | "ski" | "paddle";

export interface Trail {
  id: string;
  parkCode: string;
  name: string;
  distanceMi: number;
  /** null until measured (hand-entered, or `npm run sync:trails -- --elevation`) */
  gainFt: number | null;
  routeType: "loop" | "out-and-back" | "point-to-point" | null;
  difficulty: "easy" | "moderate" | "hard" | "very-hard" | null;
  trailhead: { name: string; lat: number; lon: number };
  permit: string | null;
  activities: string[];
  hazards: string[];
  summary: string;
  usgsSite?: string;
  /** Allowed uses (NPS TRLUSE, OSM tags), e.g. ["hike", "horse"] */
  uses?: TrailUseKey[];
  /** "curated" = hand-written featured trail; "nps" = imported from NPS Public Trails */
  source?: "curated" | "nps";
  /** NPS trail type: standard (terra), snow or water */
  trailType?: "terra" | "snow" | "water";
  surface?: string | null;
  trailClass?: string | null;
  seasonal?: boolean;
  closed?: boolean;
  /** Imported as a maintained trail (FMSS asset or trail class ≥ 2) */
  maintained?: boolean;
  /** Optional inline route [lon, lat][] (curated trails). Imported routes live in content/trail-geometry/. */
  geometry?: [number, number][];
  verified: boolean;
}

/** Uniform envelope every live-data source returns. */
export interface SourceResult<T> {
  source: string;
  ok: boolean;
  fetchedAt: string;
  data?: T;
  error?: string;
  attribution: string;
}
