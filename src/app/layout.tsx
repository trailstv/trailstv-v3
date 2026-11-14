import type { Metadata } from "next";
import Link from "next/link";
import localFont from "next/font/local";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";
import { UserMenu } from "@/components/UserMenu";
import { SiteSearch } from "@/components/search/SiteSearch";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: { default: "TrailsTV – Viewing America's National Parks", template: "%s · TrailsTV" },
  description: "Viewing America's national parks",
  applicationName: "TrailsTV",
  openGraph: { siteName: "TrailsTV", description: "Viewing America's national parks", type: "website" },
};

/**
 * Playfair Display (Google Fonts, SIL Open Font License) for page titles and headings.
 * Self-hosted from src/fonts so builds never depend on reaching Google; same font as fonts.google.com.
 */
const playfair = localFont({
  src: [
    { path: "../fonts/playfair-display/PlayfairDisplay-Variable.woff2", weight: "400 900", style: "normal" },
    { path: "../fonts/playfair-display/PlayfairDisplay-Variable-Italic.woff2", weight: "400 900", style: "italic" },
  ],
  variable: "--font-heading",
  display: "swap",
  fallback: ["Georgia", "Times New Roman", "serif"],
});

/** TrailsTV GA4 property. NEXT_PUBLIC_GA_ID in Vercel overrides it (e.g. a test property). */
const GA_ID = process.env.NEXT_PUBLIC_GA_ID?.trim() || "G-56EE9VXWVM";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={playfair.variable}>
      <body>
        <header className="site-header">
          <div className="container">
            <Link href="/" className="brand">Trails<span>TV</span></Link>
            <SiteSearch />
            <nav className="nav">
              <Link href="/parks">Parks</Link>
              <Link href="/activities">Activities</Link>
              <Link href="/pricing">TrailsTV+</Link>
              <UserMenu />
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <SiteFooter />
      </body>
      {/* Google Analytics 4 (G-56EE9VXWVM). Loads after the page is interactive
          and records page views on every navigation. Off in local dev and when the ID isn't set. */}
      {GA_ID && process.env.NODE_ENV === "production" && <GoogleAnalytics gaId={GA_ID} />}
    </html>
  );
}
