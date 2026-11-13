"use client";

import { useState } from "react";
import type { PublicVideo } from "@/lib/videos";

/**
 * Click-to-play: shows a poster first and loads the YouTube/Vimeo iframe only
 * on click. This keeps park pages fast (no third-party JS until needed) and
 * means members-only videos never reach the browser until /play approves.
 */
export function VideoPlayer({ video, priority, fill }: { video: PublicVideo; priority?: boolean; /** Fill the parent (e.g. the map area) with the title overlaid. */ fill?: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  const [gate, setGate] = useState<null | { msg: string; href: string; cta: string }>(null);
  const [busy, setBusy] = useState(false);
  const locked = video.access === "plus";

  async function play() {
    if (video.embedUrl) return setSrc(video.embedUrl);
    setBusy(true);
    const r = await fetch(`/api/videos/${video.id}/play`);
    setBusy(false);
    if (r.ok) return setSrc((await r.json()).embedUrl);
    if (r.status === 401) return setGate({ msg: "Sign in to watch this TrailsTV+ video.", href: `/login?next=${encodeURIComponent(location.pathname)}`, cta: "Sign in" });
    if (r.status === 402) return setGate({ msg: "This video is for TrailsTV+ members.", href: "/pricing", cta: "Join TrailsTV+" });
    setGate({ msg: "This video couldn't load. Try again.", href: location.pathname, cta: "Reload" });
  }

  return (
    <figure className={`video${fill ? " video-fill" : ""}`}>
      <div className="video-frame">
        {src ? (
          <iframe
            src={src}
            title={video.title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : gate ? (
          <div className="video-gate">
            <p>🔒 {gate.msg}</p>
            <a className="act on" href={gate.href}>{gate.cta}</a>
          </div>
        ) : (
          <button type="button" className="video-poster" onClick={play} disabled={busy} aria-label={`Play ${video.title}`}
            style={video.poster ? { backgroundImage: `url(${video.poster})` } : undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {video.poster && priority && <img src={video.poster} alt="" fetchPriority="high" style={{ display: "none" }} />}
            <span className="video-play">{busy ? "…" : "▶"}</span>
            {fill && (
              <span className="video-overlay-title">
                <b>{video.title}</b>
                {video.description && <span>{video.description}</span>}
              </span>
            )}
            {locked && <span className="video-badge">TrailsTV+</span>}
            {video.duration && <span className="video-duration">{video.duration}</span>}
          </button>
        )}
      </div>
      {!fill && <figcaption>
        <b>{video.title}</b>
        {video.description && <span className="small muted"> {video.description}</span>}
      </figcaption>}
    </figure>
  );
}
