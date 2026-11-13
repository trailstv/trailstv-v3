/**
 * Forecast period labels: "Tue, Nov 10" plus "Today", "Tonight", "Day" or "Night".
 * Uses the date in the forecast's own ISO string (the park's local time), so it's right
 * whatever time zone the visitor is in.
 */
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function forecastDate(startTime: string): string {
  const m = startTime.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return `${WD[d.getUTCDay()]}, ${MO[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** Keep NWS's "Today"/"Tonight"/"This Afternoon"/holiday names; plain weekday names become Day/Night. */
export function forecastPart(name: string, isDaytime: boolean): string {
  const weekday = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)( night)?$/i.test(name.trim());
  return weekday ? (isDaytime ? "Day" : "Night") : name;
}
