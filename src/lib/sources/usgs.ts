import "server-only";
import { fetchSource } from "./http";
import { bbox } from "../geo";

// USGS Water Data OGC API (replaces legacy waterservices.usgs.gov, which is
// being degraded from Nov 2026 and shut down Feb 2027). Anonymous works; an
// api.data.gov key in X-Api-Key raises the rate limit.
const BASE = "https://api.waterdata.usgs.gov/ogcapi/v1/collections";
const ATTR = "U.S. Geological Survey Water Data for the Nation";

export const PARAMS = { discharge: "00060", gageHeight: "00065", waterTemp: "00010" } as const;

export interface GaugeReading {
  siteId: string;
  parameter: "discharge" | "gageHeight" | "waterTemp";
  value: number;
  unit: string;
  time: string;
  lat?: number;
  lon?: number;
}

interface Raw {
  features: {
    geometry?: { coordinates: [number, number] } | null;
    properties: { monitoring_location_id: string; parameter_code: string; value: string; unit_of_measure: string; time: string };
  }[];
}

const byCode = Object.fromEntries(Object.entries(PARAMS).map(([k, v]) => [v, k])) as Record<string, GaugeReading["parameter"]>;

function transform(r: Raw): GaugeReading[] {
  return r.features
    .map((f) => ({
      siteId: f.properties.monitoring_location_id,
      parameter: byCode[f.properties.parameter_code],
      value: Number(f.properties.value),
      unit: f.properties.unit_of_measure,
      time: f.properties.time,
      lon: f.geometry?.coordinates?.[0],
      lat: f.geometry?.coordinates?.[1],
    }))
    .filter((g) => g.parameter && Number.isFinite(g.value));
}

const headers = () => (process.env.USGS_API_KEY ? { "X-Api-Key": process.env.USGS_API_KEY } : undefined);

/** Latest flow / stage / temp for every gauge inside the park's bounding box. */
export function getGaugesNear(lat: number, lon: number, radiusKm: number) {
  const q = new URLSearchParams({
    f: "json",
    bbox: bbox(lat, lon, radiusKm).join(","),
    parameter_code: Object.values(PARAMS).join(","),
    limit: "200",
  });
  return fetchSource<Raw, GaugeReading[]>("usgs-gauges", ATTR, `${BASE}/latest-continuous/items?${q}`, { revalidate: 900, headers: headers() }, transform);
}

/** Latest readings for one specific gauge (e.g. Virgin River for The Narrows). */
export function getGauge(siteId: string) {
  const q = new URLSearchParams({ f: "json", monitoring_location_id: siteId, parameter_code: Object.values(PARAMS).join(",") });
  return fetchSource<Raw, GaugeReading[]>("usgs-gauge", ATTR, `${BASE}/latest-continuous/items?${q}`, { revalidate: 900, headers: headers() }, transform);
}
