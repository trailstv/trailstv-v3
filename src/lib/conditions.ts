import "server-only";
import type { ConditionKey, Park, SourceResult } from "./types";
import { getForecast, getWeatherAlerts } from "./sources/nws";
import { getParkAlerts, getCampgrounds, getWebcams, getClimbingClosures } from "./sources/nps";
import { getGaugesNear } from "./sources/usgs";
import { getSnowNear } from "./sources/snotel";
import { getAirQuality, getFiresNear, getTides, getAvalanche, getRecFacilities } from "./sources/misc";
import { getSunTimes } from "./sources/sun";
import { getCampgroundsForPark, campMeta, closedNow } from "./campgrounds";

export const ALL_CONDITIONS: ConditionKey[] = [
  "weather", "alerts", "air", "fire", "sun", "rivers", "snow", "avalanche",
  "tides", "campgrounds", "boatLaunches", "climbingClosures", "webcams",
];

const unavailable = (source: string, why: string): SourceResult<never> => ({
  source, ok: false, fetchedAt: new Date().toISOString(), attribution: "", error: why,
});

/** Fetch one live condition for a park. */
export async function getCondition(park: Park, key: ConditionKey): Promise<SourceResult<unknown>> {
  const { lat, lon, radiusKm, code } = park;
  switch (key) {
    case "weather": return getForecast(lat, lon);
    case "alerts": {
      const [nps, nws] = await Promise.all([getParkAlerts(code), getWeatherAlerts(lat, lon)]);
      return {
        source: "alerts", ok: nps.ok || nws.ok, fetchedAt: new Date().toISOString(),
        attribution: "National Park Service; National Weather Service",
        data: { park: nps.data ?? [], weather: nws.data ?? [] },
        error: [nps.error, nws.error].filter(Boolean).join("; ") || undefined,
      };
    }
    case "air": return getAirQuality(lat, lon);
    case "fire": return getFiresNear(lat, lon, radiusKm);
    case "sun": return { source: "sun", ok: true, fetchedAt: new Date().toISOString(), attribution: "Computed (NOAA solar equations)", data: getSunTimes(lat, lon) };
    case "rivers": return getGaugesNear(lat, lon, radiusKm);
    case "snow": return getSnowNear(lat, lon, park.states, radiusKm);
    case "avalanche": return park.avalancheCenter ? getAvalanche(park.avalancheCenter) : unavailable("avalanche", "No avalanche center mapped for this park");
    case "tides": return park.tideStation ? getTides(park.tideStation) : unavailable("noaa-tides", "Not a coastal park");
    case "campgrounds": {
      // Imported campgrounds live on TrailsTV pages; fall back to the live NPS list until they're imported.
      const camps = getCampgroundsForPark(code);
      if (camps.length) return {
        source: "campgrounds", ok: true, fetchedAt: new Date().toISOString(), attribution: "National Park Service",
        data: camps.map((c) => ({ id: c.id, name: c.name, href: `/campgrounds/${c.id}`, meta: campMeta(c), closed: closedNow(c) })),
      };
      const live = await getCampgrounds(code);
      return { ...live, data: live.data?.map((c) => ({ id: c.id, name: c.name, meta: c.campsites?.totalSites ? `${c.campsites.totalSites} sites` : "" })) };
    }
    case "boatLaunches": return getRecFacilities(lat, lon, radiusKm, "boat ramp");
    case "climbingClosures": return getClimbingClosures(code);
    case "webcams": return getWebcams(code);
  }
}

/** Fetch many conditions in parallel; failures are isolated per source. */
export async function getConditions(park: Park, keys: ConditionKey[]) {
  const unique = [...new Set(keys)];
  const results = await Promise.all(unique.map((k) => getCondition(park, k)));
  return Object.fromEntries(unique.map((k, i) => [k, results[i]])) as Record<ConditionKey, SourceResult<unknown>>;
}
