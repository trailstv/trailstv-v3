import fs from "node:fs";
import path from "node:path";

type Network = "instagram" | "tiktok" | "youtube";
const NETWORKS: { key: Network; label: string; icon: React.ReactNode }[] = [
  {
    key: "instagram", label: "Instagram",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    key: "tiktok", label: "TikTok",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5 2.6 2.6 0 0 1-2.6-2.6 2.6 2.6 0 0 1 3.4-2.47V9.67a5.68 5.68 0 0 0-.8-.06 5.69 5.69 0 0 0-5.69 5.69A5.69 5.69 0 0 0 9.86 21a5.69 5.69 0 0 0 5.69-5.69V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3a4.3 4.3 0 0 1-3.25-1.48z" />
      </svg>
    ),
  },
  {
    key: "youtube", label: "YouTube",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M21.58 7.19a2.5 2.5 0 0 0-1.76-1.77C18.25 5 12 5 12 5s-6.25 0-7.82.42a2.5 2.5 0 0 0-1.76 1.77C2 8.77 2 12 2 12s0 3.23.42 4.81a2.5 2.5 0 0 0 1.76 1.77C5.75 19 12 19 12 19s6.25 0 7.82-.42a2.5 2.5 0 0 0 1.76-1.77C22 15.23 22 12 22 12s0-3.23-.42-4.81zM10 15V9l5.2 3L10 15z" />
      </svg>
    ),
  },
];

function readLinks(): Partial<Record<Network, string>> {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "content", "social.json"), "utf8")); } catch { return {}; }
}

/** Instagram, TikTok and YouTube icons. URLs come from content/social.json. */
export function SocialLinks() {
  const links = readLinks();
  return (
    <ul className="social" aria-label="TrailsTV on social media">
      {NETWORKS.map(({ key, label, icon }) => {
        const url = links[key]?.trim();
        return (
          <li key={key}>
            {url ? (
              <a href={url} target="_blank" rel="noopener me" aria-label={`TrailsTV on ${label}`} title={label}>{icon}</a>
            ) : (
              <span aria-label={`${label} (coming soon)`} title={`${label} (coming soon)`}>{icon}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
