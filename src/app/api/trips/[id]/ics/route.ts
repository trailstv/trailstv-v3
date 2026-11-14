import { getUser } from "@/lib/auth";
import { dayDate, getTrip, tripDays } from "@/lib/trips";

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const ymd = (iso: string) => iso.replace(/-/g, "");

/** GET /api/trips/:id/ics – one all-day calendar event per trip day. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const data = await getTrip((await params).id, (await getUser())?.id ?? null);
  if (!data) return new Response("Not found", { status: 404 });
  const { trip, stops } = data;
  if (!trip.startDate) return new Response("Add dates to this trip to export it to a calendar", { status: 400 });

  const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const events = Array.from({ length: tripDays(trip) }, (_, i) => {
    const day = i + 1;
    const date = dayDate(trip, day)!;
    const next = new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10);
    const dayStops = stops.filter((s) => s.day === day);
    const desc = dayStops.map((s, n) => `${n + 1}. ${s.time ? s.time + " – " : ""}${s.name}${s.notes ? " (" + s.notes + ")" : ""}`).join("\n");
    const first = dayStops.find((s) => s.lat != null);
    return [
      "BEGIN:VEVENT",
      `UID:${trip.id}-day${day}@trailstv`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${ymd(date)}`,
      `DTEND;VALUE=DATE:${ymd(next)}`,
      `SUMMARY:${esc(`${trip.name} – Day ${day}`)}`,
      desc && `DESCRIPTION:${esc(desc)}`,
      first && `GEO:${first.lat};${first.lon}`,
      first && `LOCATION:${esc(first.name)}`,
      "END:VEVENT",
    ].filter(Boolean).join("\r\n");
  });

  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TrailsTV//Trips//EN", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR"].join("\r\n");
  return new Response(ics, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="${trip.name.replace(/[^\w-]+/g, "-")}.ics"`, "Cache-Control": "private, no-store" },
  });
}
