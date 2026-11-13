import { getVideos, toPublic, type Video } from "@/lib/videos";
import { VideoPlayer } from "./VideoPlayer";

/**
 * Drop-in video area. Renders nothing if no videos are assigned to it, so
 * slots can sit on every park page and only light up where content exists.
 *
 *   <VideoSlot parkCode="zion" slot="hero" layout="feature" />
 *   <VideoSlot parkCode="zion" slot="overview" title="Watch" layout="grid" />
 */
export async function VideoSlot({
  parkCode, slot, trailId, title, layout = "grid", limit,
}: { parkCode?: string; slot?: string; trailId?: string; title?: string; layout?: "feature" | "grid" | "row"; limit?: number }) {
  const videos = getVideos({ parkCode, slot, trailId }).slice(0, limit);
  if (!videos.length) return null;
  const items = await Promise.all(videos.map(toPublic));

  return (
    <section className={`video-slot video-${layout}`} data-slot={slot}>
      {title && <h2>{title}</h2>}
      <div className="video-list">
        {items.map((v, i) => <VideoPlayer key={v.id} video={v} priority={layout === "feature" && i === 0} />)}
      </div>
      <VideoJsonLd videos={videos} posters={items.map((i) => i.poster)} />
    </section>
  );
}

/** schema.org VideoObject markup so free videos can appear in Google video results. */
function VideoJsonLd({ videos, posters }: { videos: Video[]; posters: (string | null)[] }) {
  const data = videos
    .map((v, i) => ({ v, poster: posters[i] }))
    .filter(({ v, poster }) => v.access === "free" && poster)
    .map(({ v, poster }) => ({
      "@context": "https://schema.org",
      "@type": "VideoObject",
      name: v.title,
      description: v.description ?? v.title,
      thumbnailUrl: poster,
      uploadDate: v.publishedAt,
      embedUrl: v.source.provider === "youtube" ? `https://www.youtube.com/embed/${v.source.videoId}` : `https://player.vimeo.com/video/${v.source.videoId}`,
    }));
  if (!data.length) return null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
