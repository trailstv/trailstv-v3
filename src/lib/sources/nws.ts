import "server-only";
import { fetchSource } from "./http";
import type { SourceResult } from "../types";

// National Weather Service – free, no key, requires a User-Agent.
const BASE = "https://api.weather.gov";
const ATTR = "National Weather Service (weather.gov)";
const headers = () => ({
  "User-Agent": process.env.NWS_USER_AGENT ?? "TrailsTV (dev@example.com)",
  Accept: "application/geo+json",
});

export interface ForecastPeriod {
  name: string;
  startTime: string;
  isDaytime: boolean;
  temperature: number;
  temperatureUnit: string;
  windSpeed: string;
  windDirection: string;
  shortForecast: string;
  detailedForecast: string;
  icon: string;
  precipChance: number | null;
}

interface PointsRaw {
  properties: { forecast: string; forecastHourly: string; relativeLocation?: { properties: { city: string; state: string } } };
}
interface ForecastRaw {
  properties: {
    updated: string;
    periods: (Omit<ForecastPeriod, "precipChance"> & { probabilityOfPrecipitation?: { value: number | null } })[];
  };
}

export async function getForecast(lat: number, lon: number): Promise<SourceResult<{ updated: string; periods: ForecastPeriod[] }>> {
  // /points is stable for a location, so cache it for a week.
  const points = await fetchSource<PointsRaw, PointsRaw>(
    "nws-points", ATTR, `${BASE}/points/${lat.toFixed(4)},${lon.toFixed(4)}`,
    { revalidate: 604800, headers: headers() }, (r) => r,
  );
  if (!points.ok || !points.data?.properties?.forecast) return { ...points, ok: false, error: points.error ?? "No forecast for this point", data: undefined } as SourceResult<never>;

  return fetchSource<ForecastRaw, { updated: string; periods: ForecastPeriod[] }>(
    "nws-forecast", ATTR, points.data.properties.forecast,
    { revalidate: 1800, headers: headers() },
    (r) => ({
      updated: r.properties.updated,
      periods: r.properties.periods.slice(0, 14).map((p) => ({
        name: p.name, startTime: p.startTime, isDaytime: p.isDaytime,
        temperature: p.temperature, temperatureUnit: p.temperatureUnit,
        windSpeed: p.windSpeed, windDirection: p.windDirection,
        shortForecast: p.shortForecast, detailedForecast: p.detailedForecast, icon: p.icon,
        precipChance: p.probabilityOfPrecipitation?.value ?? null,
      })),
    }),
  );
}

export interface WeatherAlert {
  id: string;
  event: string;
  severity: string;
  headline: string;
  description: string;
  instruction: string | null;
  effective: string;
  expires: string;
}

interface AlertsRaw {
  features: { id: string; properties: WeatherAlert }[];
}

export function getWeatherAlerts(lat: number, lon: number) {
  return fetchSource<AlertsRaw, WeatherAlert[]>(
    "nws-alerts", ATTR, `${BASE}/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`,
    { revalidate: 300, headers: headers() },
    (r) => r.features.map((f) => ({
      id: f.id, event: f.properties.event, severity: f.properties.severity,
      headline: f.properties.headline, description: f.properties.description,
      instruction: f.properties.instruction, effective: f.properties.effective, expires: f.properties.expires,
    })),
  );
}
