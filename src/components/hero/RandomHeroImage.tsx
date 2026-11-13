"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { HeroImage } from "@/lib/hero";

/**
 * Picks a random park photo on each visit. The choice happens in the browser,
 * so the page itself stays static and cached; the image fades in once chosen.
 */
export function RandomHeroImage({ images }: { images: HeroImage[] }) {
  const [img, setImg] = useState<HeroImage | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => setImg(images[Math.floor(Math.random() * images.length)]), [images]);
  if (!img) return null;
  return (
    <>
      <Image className="hero-img" src={img.src} alt="" fill priority sizes="100vw" onLoad={() => setLoaded(true)} style={{ opacity: loaded ? 1 : 0 }} />
      {img.credit && <span className="hero-credit">{img.credit}</span>}
    </>
  );
}
