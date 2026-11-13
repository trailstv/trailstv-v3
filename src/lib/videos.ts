import "server-only";
import fs from "node:fs";
import path from "node:path";
import { cache } from "react";
import { z } from "zod";

/**
 * Park videos live in flat files: content/videos/<parkCode>.json
 * Each entry is a YouTube or Vimeo link plus where it appears (slot) and who can watch (access).
 * Files are validated at build time, so a typo fails the deploy with a clear message.
 */

const VideoEntry = z.object({
  /** Unique across the whole site, e.g. "zion-angels-landing-flyover" */
  id: z.string().regex(/^[a-z0-9-]+$/, "id must be lowercase letters, numbers and dashes"),
  title: z.string().min(1).max(140),
  /** Paste any YouTube or Vimeo URL (watch, share, shorts, embed, unlisted Vimeo with hash). */
  url: z.string().url(),
  /** Where on the page it appears, e.g. "hero", "overview", "trails". Slots are added to pages as we place them. */
  slot: z.string().regex(/^[a-z0-9-]+$/).default("overview"),
  access: z.enum(["free", "plus"]).default("free"),
  description: z.string().max(2000).optional(),
  /** e.g. "4:32", shown on the poster */
  duration: z.string().max(10).optional(),
  /** Optional custom poster image URL. Recommended for members-only videos (see below). */
  poster: z.string().url().optional(),
  /** Optional: tie a video to a trail or activity so it can appear on those pages too. */
  trailId: z.string().optional(),
  activity: z.string().optional(),
  /** ISO date, used for sorting and SEO */
  publishedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  order: z.number().int().default(0),
});
export type VideoEntry = z.infer<typeof VideoEntry>;

export interface ParsedSource {
  provider: "youtube" | "vimeo";
  videoId: string;
  /** Vimeo unlisted hash */
  hash?: string;
  start?: number;
}

/** Recognises every common YouTube / Vimeo URL shape. */
export function parseVideoUrl(raw: string): ParsedSource | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  const t = u.searchParams.get("t") ?? u.searchParams.get("start");
  const start = t ? parseTime(t) : undefined;

  if (host === "youtu.be") return ytId(u.pathname.slice(1), start);
  if (host === "youtube.com" || host === "youtube-nocookie.com" || host === "music.youtube.com") {
    if (u.searchParams.get("v")) return ytId(u.searchParams.get("v")!, start);
    const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/);
    return m ? ytId(m[1], start) : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const m = u.pathname.match(/(?:\/video)?\/(\d+)(?:\/([0-9a-f]+))?/);
    if (!m) return null;
    return { provider: "vimeo", videoId: m[1], hash: m[2] ?? u.searchParams.get("h") ?? undefined, start };
  }
  return null;
}

function ytId(id: string, start?: number): ParsedSource | null {
  return /^[\w-]{11}$/.test(id) ? { provider: "youtube", videoId: id, start } : null;
}

function parseTime(t: string): number | undefined {
  if (/^\d+$/.test(t)) return Number(t);
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : undefined;
}

/** The iframe URL. Privacy-friendly hosts; autoplay because it loads on click. */
export function embedUrl(s: ParsedSource) {
  if (s.provider === "youtube") {
    const q = new URLSearchParams({ autoplay: "1", rel: "0", modestbranding: "1", playsinline: "1" });
    if (s.start) q.set("start", String(s.start));
    return `https://www.youtube-nocookie.com/embed/${s.videoId}?${q}`;
  }
  const q = new URLSearchParams({ autoplay: "1", dnt: "1", title: "0", byline: "0", portrait: "0" });
  if (s.hash) q.set("h", s.hash);
  return `https://player.vimeo.com/video/${s.videoId}?${q}${s.start ? `#t=${s.start}s` : ""}`;
}

export type Video = VideoEntry & { parkCode: string; source: ParsedSource };

const DIR = path.join(process.cwd(), "content", "videos");

export const getAllVideos = cache((): Video[] => {
  if (!fs.existsSync(DIR)) return [];
  const out: Video[] = [];
  const seen = new Set<string>();
  for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith(".json") && !f.startsWith("_"))) {
    const parkCode = file.replace(/\.json$/, "");
    const parsed = z.array(VideoEntry).safeParse(JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8")));
    if (!parsed.success) throw new Error(`content/videos/${file}: ${parsed.error.issues.map((i) => `[${i.path.join(".")}] ${i.message}`).join("; ")}`);
    for (const v of parsed.data) {
      const source = parseVideoUrl(v.url);
      if (!source) throw new Error(`content/videos/${file}: "${v.id}" has a URL that isn't a recognised YouTube or Vimeo link: ${v.url}`);
      if (seen.has(v.id)) throw new Error(`content/videos/${file}: duplicate video id "${v.id}"`);
      seen.add(v.id);
      out.push({ ...v, parkCode, source });
    }
  }
  return out.sort((a, b) => a.order - b.order || (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
});

export const getVideo = (id: string) => getAllVideos().find((v) => v.id === id);

export function getVideos(filter: { parkCode?: string; slot?: string; trailId?: string; activity?: string }) {
  return getAllVideos().filter(
    (v) =>
      (!filter.parkCode || v.parkCode === filter.parkCode) &&
      (!filter.slot || v.slot === filter.slot) &&
      (!filter.trailId || v.trailId === filter.trailId) &&
      (!filter.activity || v.activity === filter.activity),
  );
}

/**
 * The park's one large "featured" video, optionally for an activity.
 * Lookup order: featured video for that activity → the park's general featured
 * video (no activity) → null.
 */
export function pickFeatured(parkCode: string, activity?: string): Video | null {
  const featured = getVideos({ parkCode, slot: "featured" });
  return (activity && featured.find((v) => v.activity === activity)) || featured.find((v) => !v.activity) || null;
}

/**
 * What the browser is allowed to see. Members-only videos never ship their
 * YouTube/Vimeo id; the player asks /api/videos/:id/play, which checks TrailsTV+.
 */
export interface PublicVideo {
  id: string; title: string; description?: string; duration?: string; access: "free" | "plus";
  provider: "youtube" | "vimeo"; poster: string | null; embedUrl: string | null;
}

export async function toPublic(v: Video): Promise<PublicVideo> {
  const free = v.access === "free";
  let poster = v.poster ?? null;
  if (!poster && free) poster = await defaultPoster(v.source);
  return {
    id: v.id, title: v.title, description: v.description, duration: v.duration, access: v.access, provider: v.source.provider,
    poster, embedUrl: free ? embedUrl(v.source) : null,
  };
}

async function defaultPoster(s: ParsedSource): Promise<string | null> {
  if (s.provider === "youtube") return `https://i.ytimg.com/vi/${s.videoId}/hqdefault.jpg`;
  // Vimeo thumbnails come from oEmbed (cached for a day; works for unlisted links with the hash).
  try {
    const url = `https://vimeo.com/${s.videoId}${s.hash ? "/" + s.hash : ""}`;
    const r = await fetch(`https://vimeo.com/api/oembed.json?width=1280&url=${encodeURIComponent(url)}`, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(4000) });
    return r.ok ? ((await r.json()) as { thumbnail_url?: string }).thumbnail_url ?? null : null;
  } catch {
    return null;
  }
}

/** Featured videos for a park, general + per activity, safe to send to the browser. */
export async function featuredVideoSet(parkCode: string, activities: string[]) {
  const general = pickFeatured(parkCode);
  const byActivity: Record<string, PublicVideo> = {};
  for (const v of getVideos({ parkCode, slot: "featured" })) {
    if (v.activity && activities.includes(v.activity)) byActivity[v.activity] = await toPublic(v);
  }
  return { general: general ? await toPublic(general) : null, byActivity };
}

/** A trail's video: one tagged with its trailId (featured slot preferred). */
export async function trailVideoSet(trailId: string) {
  const vids = getVideos({ trailId });
  const v = vids.find((x) => x.slot === "featured") ?? vids[0];
  return { general: v ? await toPublic(v) : null, byActivity: {} as Record<string, PublicVideo> };
}
