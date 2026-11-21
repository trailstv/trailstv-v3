"use client";

import { useEffect, useRef, useState } from "react";
import { BUDGETS, INTERESTS, KIND_LABEL, type PartnerKind } from "@/lib/partners";
import { Turnstile, type TurnstileHandle } from "@/components/Turnstile";

/** The "Work with TrailsTV" form. Opens preset to a partner type when a card's button is used. */
export function PartnerForm({ turnstileSiteKey }: { turnstileSiteKey?: string | null }) {
  const [kind, setKind] = useState<PartnerKind | "other" | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const [sent, setSent] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const shownAt = useRef(0);
  const turnstile = useRef<TurnstileHandle>(null);

  useEffect(() => {
    shownAt.current = Date.now();
    // "#contact-brand" etc. from the cards preselects the type.
    const pick = () => {
      const m = window.location.hash.match(/^#contact-(brand|outfitter|nonprofit|creator)$/);
      if (m) setKind(m[1] as PartnerKind);
    };
    pick();
    window.addEventListener("hashchange", pick);
    return () => window.removeEventListener("hashchange", pick);
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget; // React clears currentTarget after an await
    const f = new FormData(form);
    if (turnstileSiteKey && !token) return setError({ text: "Just a second: checking you're not a robot. Try again in a moment." });
    setBusy(true);
    const payload = {
      name: f.get("name"), email: f.get("email"), organization: f.get("organization"), website: f.get("website") || undefined,
      kind: f.get("kind"), interests: f.getAll("interests"), parks: f.get("parks") || undefined, budget: f.get("budget") || undefined,
      message: f.get("message"),
      fax: f.get("fax") ?? "", formAgeMs: Date.now() - shownAt.current, turnstileToken: token,
    };
    try {
      const r = await fetch("/api/partners", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; field?: string };
      if (r.ok && j.ok) { setSent(true); return; }
      setError({ text: j.error ?? "Something went wrong. Please try again.", field: j.field });
      if (j.field) (form.elements.namedItem(j.field) as HTMLElement | null)?.focus?.();
    } catch {
      setError({ text: "Couldn't reach TrailsTV. Check your connection and try again." });
    } finally {
      turnstile.current?.reset();
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="partner-sent" role="status">
        <div className="partner-sent-icon" aria-hidden="true">✓</div>
        <h3>Thanks, we&apos;ve got it.</h3>
        <p>Your message is with the TrailsTV team. We&apos;ll reply to the email you gave us.</p>
      </div>
    );
  }

  const bad = (name: string) => (error?.field === name ? true : undefined);

  return (
    <form className="partner-form" onSubmit={onSubmit} noValidate>
      <div className="pf-grid">
        <label>Your name<input name="name" autoComplete="name" required maxLength={120} aria-invalid={bad("name")} /></label>
        <label>Email<input name="email" type="email" autoComplete="email" required maxLength={200} aria-invalid={bad("email")} /></label>
        <label>Organization<input name="organization" autoComplete="organization" required maxLength={160} aria-invalid={bad("organization")} /></label>
        <label><span>Website <span className="muted">(optional)</span></span><input name="website" type="url" inputMode="url" placeholder="example.com" maxLength={300} /></label>
        <label>I&apos;m a…
          <select name="kind" required value={kind} onChange={(e) => setKind(e.target.value as PartnerKind | "other")} aria-invalid={bad("kind")}>
            <option value="" disabled>Choose one</option>
            {(Object.keys(KIND_LABEL) as (PartnerKind | "other")[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <label><span>Budget <span className="muted">(optional)</span></span>
          <select name="budget" defaultValue="">
            <option value="">Prefer not to say</option>
            {BUDGETS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
      </div>

      <fieldset className="pf-interests">
        <legend>Interested in <span className="muted">(pick any)</span></legend>
        {INTERESTS.map((i) => (
          <label key={i} className="pf-chip"><input type="checkbox" name="interests" value={i} /><span>{i}</span></label>
        ))}
      </fieldset>

      <label><span>Parks or regions <span className="muted">(optional)</span></span><input name="parks" placeholder="e.g. Yosemite, the Utah parks, Pacific Northwest" maxLength={400} /></label>
      <label>Tell us about your idea<textarea name="message" required rows={5} maxLength={4000} placeholder="What you'd like to do together, timing, and anything we should know." aria-invalid={bad("message")} /></label>

      {/* Bot trap: hidden from people and screen readers. */}
      <div className="hp-field" aria-hidden="true"><label>Fax <input name="fax" type="text" tabIndex={-1} autoComplete="off" defaultValue="" /></label></div>
      {turnstileSiteKey && <Turnstile siteKey={turnstileSiteKey} onToken={setToken} ref={turnstile} />}

      {error && <p className="err" role="alert">{error.text}</p>}
      <div className="pf-actions">
        <button type="submit" disabled={busy}>{busy ? "Sending…" : "Send message"}</button>
        <span className="small muted">We only use your details to reply to you.</span>
      </div>
    </form>
  );
}
