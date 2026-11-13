import Link from "next/link";
import { SocialLinks } from "./SocialLinks";

/** Slim footer. Full data credits, licenses and notices live on /sources. */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-bar">
        <div className="footer-left">
          <Link href="/" className="brand">Trails<span>TV</span></Link>
          <nav className="footer-links" aria-label="Footer">
            <Link href="/parks">Parks</Link>
            <Link href="/activities">Activities</Link>
            <Link href="/pricing">TrailsTV+</Link>
            <Link href="/sources">Sources &amp; credits</Link>
          </nav>
          <SocialLinks />
        </div>
        <p className="footer-small">
          © {new Date().getFullYear()} TrailsTV · Not affiliated with the National Park Service · Data: NPS, NWS, USGS, NOAA, © OpenStreetMap contributors &amp; <Link href="/sources">more</Link>
        </p>
      </div>
    </footer>
  );
}
