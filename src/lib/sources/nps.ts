import "server-only";
import { fetchSource, missingKey } from "./http";

// National Park Service API – free key: https://www.nps.gov/subjects/developer/
const BASE = "https://developer.nps.gov/api/v1";
const ATTR = "National Park Service (nps.gov)";

function npsUrl(endpoint: string, params: Record<string, string>) {
  const q = new URLSearchParams({ ...params, api_key: process.env.NPS_API_KEY ?? "" });
  return `${BASE}/${endpoint}?${q}`;
}

interface NpsList<T> { total: string; data: T[] }

export interface NpsAlert { id: string; title: string; description: string; category: string; url: string; lastIndexedDate: string }

export function getParkAlerts(parkCode: string) {
  if (!process.env.NPS_API_KEY) return Promise.resolve(missingKey<NpsAlert[]>("nps-alerts", ATTR, "NPS_API_KEY"));
  return fetchSource<NpsList<NpsAlert>, NpsAlert[]>(
    "nps-alerts", ATTR, npsUrl("alerts", { parkCode, limit: "50" }),
    { revalidate: 900 },
    (r) => r.data.map(({ id, title, description, category, url, lastIndexedDate }) => ({ id, title, description, category, url, lastIndexedDate })),
  );
}

/** Climbing closures are published as NPS alerts – filter by keyword. */
export async function getClimbingClosures(parkCode: string) {
  const alerts = await getParkAlerts(parkCode);
  if (!alerts.ok || !alerts.data) return { ...alerts, source: "nps-climbing" };
  const re = /climb|raptor|peregrine|falcon|nesting|route closure/i;
  return { ...alerts, source: "nps-climbing", data: alerts.data.filter((a) => re.test(a.title + " " + a.description)) };
}

export interface Campground {
  id: string; name: string; description: string; url: string; reservationUrl: string;
  latitude: string; longitude: string;
  numberOfSitesReservable: string; numberOfSitesFirstComeFirstServe: string;
  campsites: { totalSites: string; tentOnly: string; rvOnly: string; group: string; walkBoatTo: string };
  operatingHours?: { description: string }[];
}

export function getCampgrounds(parkCode: string) {
  if (!process.env.NPS_API_KEY) return Promise.resolve(missingKey<Campground[]>("nps-campgrounds", ATTR, "NPS_API_KEY"));
  return fetchSource<NpsList<Campground>, Campground[]>(
    "nps-campgrounds", ATTR, npsUrl("campgrounds", { parkCode, limit: "100" }),
    { revalidate: 21600 }, (r) => r.data,
  );
}

export interface Webcam { id: string; title: string; description: string; url: string; isStreaming: boolean; status: string; images: { url: string; altText: string }[] }

export function getWebcams(parkCode: string) {
  if (!process.env.NPS_API_KEY) return Promise.resolve(missingKey<Webcam[]>("nps-webcams", ATTR, "NPS_API_KEY"));
  return fetchSource<NpsList<Webcam>, Webcam[]>(
    "nps-webcams", ATTR, npsUrl("webcams", { parkCode, limit: "50" }),
    { revalidate: 21600 },
    (r) => r.data.map(({ id, title, description, url, isStreaming, status, images }) => ({ id, title, description, url, isStreaming, status, images })),
  );
}

export interface ThingToDo { id: string; title: string; shortDescription: string; url: string; activities: { name: string }[]; duration: string; images: { url: string; altText: string }[] }

export function getThingsToDo(parkCode: string) {
  if (!process.env.NPS_API_KEY) return Promise.resolve(missingKey<ThingToDo[]>("nps-thingstodo", ATTR, "NPS_API_KEY"));
  return fetchSource<NpsList<ThingToDo>, ThingToDo[]>(
    "nps-thingstodo", ATTR, npsUrl("thingstodo", { parkCode, limit: "200" }),
    { revalidate: 86400 }, (r) => r.data,
  );
}
