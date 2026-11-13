/** Deep links into native map apps. Free, no API key, and open the app on phones. */

export interface Place { lat: number; lon: number; name?: string }

const ll = (p: Place) => `${p.lat},${p.lon}`;

/** Google Maps directions from the user's current location (or an origin). */
export function googleDirections(dest: Place, origin?: Place) {
  const q = new URLSearchParams({ api: "1", destination: ll(dest), travelmode: "driving" });
  if (origin) q.set("origin", ll(origin));
  return `https://www.google.com/maps/dir/?${q}`;
}

/** Apple Maps directions (opens Maps on iPhone/Mac). */
export function appleDirections(dest: Place) {
  const q = new URLSearchParams({ daddr: ll(dest), dirflg: "d" });
  if (dest.name) q.set("q", dest.name);
  return `https://maps.apple.com/?${q}`;
}

/**
 * Multi-stop Google Maps route (a day of an itinerary). Google allows up to 9
 * waypoints in a URL, so longer days are split into several legs.
 */
export function googleRoute(stops: Place[]): string[] {
  const pts = stops.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon));
  if (pts.length === 0) return [];
  if (pts.length === 1) return [googleDirections(pts[0])];
  const legs: string[] = [];
  for (let i = 0; i < pts.length - 1; i += 10) {
    const chunk = pts.slice(i, i + 11);
    const q = new URLSearchParams({ api: "1", origin: ll(chunk[0]), destination: ll(chunk[chunk.length - 1]), travelmode: "driving" });
    if (chunk.length > 2) q.set("waypoints", chunk.slice(1, -1).map(ll).join("|"));
    legs.push(`https://www.google.com/maps/dir/?${q}`);
  }
  return legs;
}
