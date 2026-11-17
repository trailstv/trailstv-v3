import "server-only";
import { fetchSource, missingKey } from "./http";
import { bbox } from "../geo";

/* ---------------- AirNow (air quality / wildfire smoke) ---------------- */
export interface AirReading { parameter: string; aqi: number; category: string; reportingArea: string; observedAt: string }

export function getAirQuality(lat: number, lon: number) {
  const ATTR = "U.S. EPA AirNow";
  const key = process.env.AIRNOW_API_KEY;
  if (!key) return Promise.resolve(missingKey<AirReading[]>("airnow", ATTR, "AIRNOW_API_KEY"));
  // AirNow retired /aq/observation/latLong/current/ on 2026-09-30 (it now answers HTTP 410).
  // Replacement: /aq/observation/current/ziplatlong/ — one row per monitor and pollutant, flat camelCase fields.
  const q = new URLSearchParams({ format: "application/json", latitude: lat.toFixed(4), longitude: lon.toFixed(4), distance: "75", API_KEY: key });
  type Row = { parameterName?: string; nowcastAQI?: number | string; aqiCategoryName?: string; reportingAreaName?: string; siteName?: string; dateObserved?: string; hourObserved?: string | number; localTimeZone?: string };
  type Raw = Row[] | { WebServiceError?: unknown };
  return fetchSource<Raw, AirReading[]>("airnow", ATTR, `https://www.airnowapi.org/aq/observation/current/ziplatlong/?${q}`, { revalidate: 1800 }, (r) => {
    if (!Array.isArray(r)) return []; // {"WebServiceError": [...]} = no monitor reporting near this point
    // Keep the highest reading per pollutant across nearby monitors.
    const best = new Map<string, AirReading>();
    for (const x of r) {
      const aqi = Number(x.nowcastAQI);
      if (!x.parameterName || !Number.isFinite(aqi) || aqi < 0) continue;
      const parameter = POLLUTANT[x.parameterName.toUpperCase()] ?? x.parameterName;
      const reading: AirReading = {
        parameter, aqi, category: x.aqiCategoryName || aqiCategory(aqi),
        reportingArea: x.reportingAreaName || x.siteName || "",
        observedAt: [x.dateObserved?.trim(), typeof x.hourObserved === "number" ? `${x.hourObserved}:00` : x.hourObserved, x.localTimeZone].filter(Boolean).join(" "),
      };
      const prev = best.get(parameter);
      if (!prev || reading.aqi > prev.aqi) best.set(parameter, reading);
    }
    return [...best.values()].sort((a, b) => b.aqi - a.aqi);
  });
}

const POLLUTANT: Record<string, string> = { OZONE: "O3", O3: "O3", "PM2.5": "PM2.5", PM25: "PM2.5", PM10: "PM10" };

/** EPA AQI categories (the new AirNow rows sometimes omit the name). */
export function aqiCategory(aqi: number): string {
  if (aqi <= 50) return "Good";
  if (aqi <= 100) return "Moderate";
  if (aqi <= 150) return "Unhealthy for Sensitive Groups";
  if (aqi <= 200) return "Unhealthy";
  if (aqi <= 300) return "Very Unhealthy";
  return "Hazardous";
}

/* ---------------- NIFC wildfire perimeters ---------------- */
export interface Fire { name: string; acres: number | null; containment: number | null; discovered: string | null }

export function getFiresNear(lat: number, lon: number, radiusKm: number) {
  const ATTR = "National Interagency Fire Center (WFIGS)";
  const [minX, minY, maxX, maxY] = bbox(lat, lon, radiusKm * 1.5);
  const q = new URLSearchParams({
    where: "1=1", geometry: `${minX},${minY},${maxX},${maxY}`, geometryType: "esriGeometryEnvelope",
    inSR: "4326", spatialRel: "esriSpatialRelIntersects", outFields: "*", returnGeometry: "false", f: "json",
  });
  type Raw = { features?: { attributes: Record<string, unknown> }[] };
  const url = `https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query?${q}`;
  return fetchSource<Raw, Fire[]>("nifc-fires", ATTR, url, { revalidate: 1800 }, (r) =>
    (r.features ?? []).map(({ attributes: a }) => ({
      name: String(a.poly_IncidentName ?? a.attr_IncidentName ?? "Unnamed fire"),
      acres: (a.poly_GISAcres ?? a.attr_IncidentSize ?? null) as number | null,
      containment: (a.attr_PercentContained ?? null) as number | null,
      discovered: a.attr_FireDiscoveryDateTime ? new Date(a.attr_FireDiscoveryDateTime as number).toISOString() : null,
    })),
  );
}

/* ---------------- NOAA CO-OPS tides ---------------- */
export interface Tide { time: string; heightFt: number; type: "H" | "L" }

export function getTides(station: string) {
  const ATTR = "NOAA Tides & Currents";
  const q = new URLSearchParams({
    product: "predictions", station, begin_date: new Date().toISOString().slice(0, 10).replace(/-/g, ""), range: "48",
    datum: "MLLW", time_zone: "lst_ldt", interval: "hilo", units: "english", format: "json", application: "TrailsTV",
  });
  type Raw = { predictions?: { t: string; v: string; type: "H" | "L" }[] };
  return fetchSource<Raw, Tide[]>("noaa-tides", ATTR, `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?${q}`, { revalidate: 21600 }, (r) =>
    (r.predictions ?? []).map((p) => ({ time: p.t, heightFt: Number(p.v), type: p.type })),
  );
}

/* ---------------- avalanche.org forecasts ---------------- */
export interface AvalancheZone { zone: string; center: string; dangerLevel: number; danger: string; travelAdvice: string; link: string; offSeason: boolean }

export function getAvalanche(centerId: string) {
  const ATTR = "avalanche.org / regional avalanche centers";
  type Raw = { features: { properties: { name: string; center: string; center_id: string; danger: string; danger_level: number; travel_advice: string; link: string; off_season: boolean } }[] };
  return fetchSource<Raw, AvalancheZone[]>("avalanche", ATTR, "https://api.avalanche.org/v2/public/products/map-layer", { revalidate: 1800 }, (r) =>
    r.features
      .filter((f) => f.properties.center_id === centerId)
      .map(({ properties: p }) => ({ zone: p.name, center: p.center, dangerLevel: p.danger_level, danger: p.danger, travelAdvice: p.travel_advice, link: p.link, offSeason: p.off_season })),
  );
}

/* ---------------- Recreation.gov RIDB (boat launches etc.) ---------------- */
export interface RecFacility { id: string; name: string; type: string; lat: number; lon: number; reservable: boolean; url: string }

export function getRecFacilities(lat: number, lon: number, radiusKm: number, query: string) {
  const ATTR = "Recreation.gov RIDB";
  const key = process.env.RIDB_API_KEY;
  if (!key) return Promise.resolve(missingKey<RecFacility[]>("ridb", ATTR, "RIDB_API_KEY"));
  const q = new URLSearchParams({ query, latitude: String(lat), longitude: String(lon), radius: String(Math.round(radiusKm / 1.609)), limit: "50" });
  type Raw = { RECDATA: { FacilityID: string; FacilityName: string; FacilityTypeDescription: string; FacilityLatitude: number; FacilityLongitude: number; Reservable: boolean }[] };
  return fetchSource<Raw, RecFacility[]>("ridb", ATTR, `https://ridb.recreation.gov/api/v1/facilities?${q}`, { revalidate: 86400, headers: { apikey: key } }, (r) =>
    r.RECDATA.map((f) => ({
      id: f.FacilityID, name: f.FacilityName, type: f.FacilityTypeDescription, lat: f.FacilityLatitude, lon: f.FacilityLongitude,
      reservable: f.Reservable, url: `https://www.recreation.gov/camping/campgrounds/${f.FacilityID}`,
    })),
  );
}
