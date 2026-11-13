import type { Metadata } from "next";
import { DATA_SOURCES, MAP_SOURCES } from "@/lib/credits";
import { PageHero } from "@/components/hero/PageHero";
import { allParkHeroes } from "@/lib/hero";

export const metadata: Metadata = { title: "Sources & credits", description: "Where TrailsTV's park, trail, weather and conditions data comes from." };

export default function SourcesPage() {
  return (
    <>
      <PageHero random={allParkHeroes()} eyebrow="About the data" title="Sources & credits" subtitle="TrailsTV is built on public data from federal agencies and the OpenStreetMap community." />
      <div className="container" style={{ maxWidth: 900, marginTop: "1.5rem" }}>
        <h2>Data sources</h2>
        <div className="table-wrap">
          <table className="admin-table">
            <thead><tr><th>Source</th><th>Used for</th><th>License</th></tr></thead>
            <tbody>
              {DATA_SOURCES.map((s) => (
                <tr key={s.name}>
                  <td><a href={s.href} target="_blank" rel="noopener">{s.name}</a></td>
                  <td>{s.what}</td>
                  <td className="small">{s.license}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2>Maps</h2>
        <div className="table-wrap">
          <table className="admin-table">
            <thead><tr><th>Source</th><th>Used for</th></tr></thead>
            <tbody>
              {MAP_SOURCES.map((s) => (
                <tr key={s.name}><td><a href={s.href} target="_blank" rel="noopener">{s.name}</a></td><td>{s.what}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2>Good to know</h2>
        <div className="card">
          <ul style={{ margin: 0, paddingLeft: "1.1rem", display: "grid", gap: ".6rem" }}>
            <li>TrailsTV is independent and not affiliated with or endorsed by the National Park Service.</li>
            <li>Conditions change fast and data can be delayed or incomplete. Always check posted rules, closures and official park alerts before you go.</li>
            <li>Park passes, permits and campsite reservations are sold only through <a href="https://www.recreation.gov" target="_blank" rel="noopener">Recreation.gov</a> and the NPS.</li>
            <li>Trail-use info comes from OpenStreetMap tags. “Not recorded” doesn&apos;t mean allowed; most park trails prohibit bikes and dogs.</li>
            <li>Trail data © OpenStreetMap contributors, available under the <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noopener">Open Database License</a>. Park photos are credited where shown.</li>
          </ul>
        </div>
      </div>
    </>
  );
}
