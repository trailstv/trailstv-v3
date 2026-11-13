import { pickFeatured, toPublic } from "@/lib/videos";
import { VideoPlayer } from "@/components/video/VideoPlayer";

/**
 * The home page overview video. Add it to content/videos/home.json as
 * { "id": "parks-overview", "title": "...", "url": "<YouTube or Vimeo>", "slot": "featured" }.
 * Until then nothing is shown.
 */
export async function HomeVideo() {
  const video = pickFeatured("home");
  const pub = video ? await toPublic(video) : null;

  // No video yet → render nothing (the section only appears once home.json has one).
  if (!pub) return null;

  return (
    <section className="home-video" aria-label="Overview video">
      <VideoPlayer video={pub} fill priority />
    </section>
  );
}
