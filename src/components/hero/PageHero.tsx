import Image from "next/image";
import type { HeroImage } from "@/lib/hero";
import { RandomHeroImage } from "./RandomHeroImage";

/**
 * Full-bleed hero image behind the site header and page title.
 * Pass `image` for a specific photo, or `random` (a list) to pick one per visit.
 * With no image available, a steel-blue mountain backdrop is shown instead.
 */
export function PageHero({
  image, random, eyebrow, title, subtitle, tall, withSplit, children,
}: {
  image?: HeroImage | null;
  random?: HeroImage[];
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  tall?: boolean;
  /** Leave room at the bottom for the map/list panel that overlaps the hero. */
  withSplit?: boolean;
  children?: React.ReactNode;
}) {
  return (
    // All heroes share one size so titles line up across the site (tall/withSplit kept for compatibility).
    <section className="page-hero" data-split={withSplit ? "" : undefined} data-tall={tall ? "" : undefined}>
      <div className="hero-fallback" aria-hidden="true">
        <svg viewBox="0 0 1440 400" preserveAspectRatio="none">
          <path d="M0 400V250l120-70 90 40 150-130 110 90 80-50 170 150 140-110 120 70 160-140 130 100 170-60v260z" fill="#0b1b2a" opacity=".55" />
          <path d="M0 400V310l160-60 130 50 180-90 140 70 200-40 150 60 170-80 150 40 160-30v170z" fill="#0b1b2a" opacity=".8" />
        </svg>
      </div>
      {image ? (
        <>
          <Image className="hero-img" src={image.src} alt="" fill priority sizes="100vw" />
          {image.credit && <span className="hero-credit">{image.credit}</span>}
        </>
      ) : random?.length ? (
        <RandomHeroImage images={random} />
      ) : null}
      <div className="container">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
        {children}
      </div>
    </section>
  );
}
