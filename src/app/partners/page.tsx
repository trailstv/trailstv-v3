import { titleCase } from "@/lib/title-case";
import type { Metadata } from "next";
import { getActivities, getParks, getVisitation, parkCount } from "@/lib/content";
import { DATA_SOURCES } from "@/lib/credits";
import { allParkHeroes } from "@/lib/hero";
import { PARTNER_TYPES } from "@/lib/partners";
import { PageHero } from "@/components/hero/PageHero";
import { PartnerForm } from "@/components/partners/PartnerForm";

export const metadata: Metadata = {
  title: "Work with TrailsTV",
  description: "Partner with TrailsTV: brands and sponsors, outfitters and guides, nonprofits and tourism boards, filmmakers and creators.",
};

const STEPS = [
  { title: "Tell us about you", text: "Send the form below with your idea, the parks you care about and your timing." },
  { title: "We reply by email", text: "Someone from TrailsTV reads every message and gets back to you personally." },
  { title: "Plan it together", text: "We agree on placements, content and dates that fit the parks and the season." },
  { title: "Launch and review", text: "Your partnership goes live on TrailsTV, and we review how it went together." },
];

export default async function PartnersPage() {
  const parks = getParks();
  const v = getVisitation();
  const visits = Object.values(v.visits).reduce((a, b) => a + b, 0);
  const stats = [
    { value: String(parkCount(parks)), label: "national parks" },
    { value: `${Math.round(visits / 1e6)}M`, label: `park visits in ${v.year}` },
    { value: String(getActivities().length), label: "activities covered" },
    { value: String(DATA_SOURCES.length), label: "live public data sources" },
  ];
  const siteKey = process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY ? process.env.TURNSTILE_SITE_KEY : null;

  return (
    <>
      <PageHero
        random={await allParkHeroes()}
        eyebrow="Partners"
        title="Work with TrailsTV"
        subtitle="Reach people planning national park trips, on the pages they use to decide where to go."
      />

      <div className="container partners">
        <section className="partner-stats" aria-label="TrailsTV at a glance">
          {stats.map((s) => (
            <div key={s.label}><b>{s.value}</b><span>{s.label}</span></div>
          ))}
        </section>
        <p className="small muted partner-stats-note">Park visits are the National Park Service&apos;s {v.year} recreation visit figures for the parks TrailsTV covers.</p>

        <section aria-labelledby="partner-types">
          <h2 id="partner-types">Who We Work With</h2>
          <div className="partner-grid">
            {PARTNER_TYPES.map((t) => (
              <article key={t.kind} className="partner-card">
                <div className="partner-icon" aria-hidden="true">{t.icon}</div>
                <h3>{titleCase(t.title)}</h3>
                <p className="muted">{t.who}</p>
                <ul>{t.offers.map((o) => <li key={o}>{o}</li>)}</ul>
                <a className="partner-cta" href={`#contact-${t.kind}`}>Start a conversation →</a>
              </article>
            ))}
          </div>
        </section>

        <section className="partner-promise" aria-labelledby="promise">
          <h2 id="promise">How We Keep It Trustworthy</h2>
          <ul>
            <li><b>Labeled clearly.</b> Every sponsored placement is marked as sponsored.</li>
            <li><b>Parks come first.</b> We don&apos;t run anything that encourages going off-trail, ignoring closures or disturbing wildlife.</li>
            <li><b>Credit where it&apos;s due.</b> Creators and photographers are always named on their work.</li>
          </ul>
        </section>

        <section aria-labelledby="how">
          <h2 id="how">How It Works</h2>
          <ol className="partner-steps">
            {STEPS.map((s, i) => (
              <li key={s.title}><span className="partner-step-n" aria-hidden="true">{i + 1}</span><div><b>{s.title}</b><p>{s.text}</p></div></li>
            ))}
          </ol>
        </section>

        <section className="partner-contact" aria-labelledby="contact-title">
          {/* Anchors the cards link to; the form picks the matching type. */}
          {PARTNER_TYPES.map((t) => <span key={t.kind} id={`contact-${t.kind}`} className="partner-anchor" />)}
          <div className="partner-contact-intro">
            <h2 id="contact-title">Let&apos;s Talk</h2>
            <p>Tell us a little about your organization and what you have in mind. No proposal needed: a few sentences is plenty.</p>
          </div>
          <PartnerForm turnstileSiteKey={siteKey} />
        </section>
      </div>
    </>
  );
}
