"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { PublicVideo } from "@/lib/videos";
import { VideoPlayer } from "./VideoPlayer";

export interface VideoSet {
  /** The park's (or trail's) general featured video. */
  general: PublicVideo | null;
  /** Activity-specific featured videos, keyed by activity slug. */
  byActivity: Record<string, PublicVideo>;
}

/**
 * The left-hand media area: shows the featured video when there is one,
 * otherwise the map. A Video / Map toggle switches between them.
 * The video follows ?activity= (e.g. Kayaking → the kayaking video), and falls
 * back to the general video.
 */
function Pane({ videos, children }: { videos: VideoSet; children: React.ReactNode }) {
  const activity = useSearchParams().get("activity");
  const video = (activity && videos.byActivity[activity]) || videos.general;
  const [mode, setMode] = useState<"video" | "map">(video ? "video" : "map");
  // Once the map has been shown we keep it mounted, so switching back is instant.
  const [mapMounted, setMapMounted] = useState(!video);

  // A different video (activity changed) → show it; no video → map.
  useEffect(() => {
    setMode(video ? "video" : "map");
    if (!video) setMapMounted(true);
  }, [video?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const show = (m: "video" | "map") => {
    if (m === "map") setMapMounted(true);
    setMode(m);
  };

  return (
    <div className="media-pane">
      {video && (
        <div className="media-toggle" role="tablist" aria-label="Show video or map">
          <button type="button" role="tab" aria-selected={mode === "video"} className={mode === "video" ? "on" : ""} onClick={() => show("video")}>▶ Video</button>
          <button type="button" role="tab" aria-selected={mode === "map"} className={mode === "map" ? "on" : ""} onClick={() => show("map")}>🗺 Map</button>
        </div>
      )}
      {video && mode === "video" && (
        <div className="media-layer">
          {/* key: switching activity swaps the player and stops the previous video */}
          <VideoPlayer key={video.id} video={video} fill priority />
        </div>
      )}
      {mapMounted && (
        <div className="media-layer" hidden={mode !== "map"}>
          {children}
        </div>
      )}
    </div>
  );
}

export function MediaPane({ videos, children }: { videos: VideoSet; children: React.ReactNode }) {
  const fallback = videos.general ? (
    <div className="media-pane"><div className="media-layer"><VideoPlayer video={videos.general} fill /></div></div>
  ) : <div className="media-pane"><div className="media-layer">{children}</div></div>;
  return <Suspense fallback={fallback}><Pane videos={videos}>{children}</Pane></Suspense>;
}
