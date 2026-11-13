// Sunrise / sunset / civil twilight computed locally (NOAA solar equations).
// No network call needed.

const rad = Math.PI / 180;

function solarEvent(date: Date, lat: number, lon: number, zenith: number, rising: boolean): Date | null {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const N = Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start) / 86400000);
  const lngHour = lon / 15;
  const t = N + ((rising ? 6 : 18) - lngHour) / 24;
  const M = 0.9856 * t - 3.289;
  let L = M + 1.916 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 282.634;
  L = (L + 360) % 360;
  let RA = Math.atan(0.91764 * Math.tan(L * rad)) / rad;
  RA = (RA + 360) % 360;
  RA += Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90;
  RA /= 15;
  const sinDec = 0.39782 * Math.sin(L * rad);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.cos(zenith * rad) - sinDec * Math.sin(lat * rad)) / (cosDec * Math.cos(lat * rad));
  if (cosH > 1 || cosH < -1) return null;
  let H = rising ? 360 - Math.acos(cosH) / rad : Math.acos(cosH) / rad;
  H /= 15;
  const T = H + RA - 0.06571 * t - 6.622;
  const UT = (((T - lngHour) % 24) + 24) % 24;
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return new Date(d.getTime() + UT * 3600000);
}

export function getSunTimes(lat: number, lon: number, date = new Date()) {
  const iso = (d: Date | null) => d?.toISOString() ?? null;
  const sunrise = solarEvent(date, lat, lon, 90.833, true);
  // In the Americas, evening events fall on the next UTC day – roll them forward.
  const after = (d: Date | null) => (d && sunrise && d < sunrise ? new Date(d.getTime() + 86400000) : d);
  const sunset = after(solarEvent(date, lat, lon, 90.833, false));
  return {
    civilDawn: iso(solarEvent(date, lat, lon, 96, true)),
    sunrise: iso(sunrise),
    sunset: iso(sunset),
    civilDusk: iso(after(solarEvent(date, lat, lon, 96, false))),
    daylightHours: sunrise && sunset ? Math.round(((((sunset.getTime() - sunrise.getTime()) / 3600000) % 24) + 24) % 24 * 10) / 10 : null,
  };
}
