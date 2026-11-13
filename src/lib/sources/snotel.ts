import "server-only";
import { fetchSource } from "./http";
import { distanceKm } from "../geo";
import type { SourceResult } from "../types";

// NRCS Air & Water Database REST API – SNOTEL snowpack. No key.
// Swagger: https://wcc.sc.egov.usda.gov/awdbRestApi/swagger-ui/index.html
const BASE = "https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1";
const ATTR = "USDA NRCS SNOTEL";

interface StationRaw { stationTriplet: string; name: string; latitude: number; longitude: number; elevation: number }
interface DataRaw {
  stationTriplet: string;
  data: { stationElement: { elementCode: string; storedUnitCode?: string }; values: { date: string; value: number | null }[] }[];
}

export interface SnowStation {
  triplet: string; name: string; elevationFt: number; distanceKm: number;
  snowDepthIn: number | null; sweIn: number | null; airTempF: number | null; date: string | null;
}

export async function getSnowNear(lat: number, lon: number, states: string[], radiusKm: number): Promise<SourceResult<SnowStation[]>> {
  const triplets = states.map((s) => `*:${s}:SNTL`).join(",");
  const stations = await fetchSource<StationRaw[], StationRaw[]>(
    "snotel-stations", ATTR, `${BASE}/stations?stationTriplets=${encodeURIComponent(triplets)}&returnStationElements=false&activeOnly=true`,
    { revalidate: 604800, timeoutMs: 12000 }, (r) => r,
  );
  if (!stations.ok || !stations.data) return { ...stations, data: undefined } as SourceResult<SnowStation[]>;

  const near = stations.data
    .map((s) => ({ ...s, d: distanceKm(lat, lon, s.latitude, s.longitude) }))
    .filter((s) => s.d <= radiusKm * 1.5)
    .sort((a, b) => a.d - b.d)
    .slice(0, 8);
  if (near.length === 0) return { ...stations, source: "snotel", data: [] };

  const end = new Date();
  const begin = new Date(end.getTime() - 3 * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const q = new URLSearchParams({
    stationTriplets: near.map((s) => s.stationTriplet).join(","),
    elements: "SNWD,WTEQ,TOBS",
    duration: "DAILY",
    beginDate: fmt(begin),
    endDate: fmt(end),
  });

  return fetchSource<DataRaw[], SnowStation[]>("snotel", ATTR, `${BASE}/data?${q}`, { revalidate: 3600, timeoutMs: 12000 }, (rows) =>
    near.map((s) => {
      const row = rows.find((r) => r.stationTriplet === s.stationTriplet);
      const latest = (code: string) => {
        const vals = row?.data.find((d) => d.stationElement.elementCode === code)?.values ?? [];
        const v = [...vals].reverse().find((x) => x.value !== null);
        return { value: v?.value ?? null, date: v?.date ?? null };
      };
      const depth = latest("SNWD");
      return {
        triplet: s.stationTriplet, name: s.name, elevationFt: s.elevation, distanceKm: Math.round(s.d),
        snowDepthIn: depth.value, sweIn: latest("WTEQ").value, airTempF: latest("TOBS").value, date: depth.date,
      };
    }),
  );
}
