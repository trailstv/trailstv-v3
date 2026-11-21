import { titleCase } from "@/lib/title-case";
import Link from "next/link";

/** "Unlock with TrailsTV+" box shown over locked content. Works in server and client components. */
export function UpgradeBox({ title, text, signedIn = true, next, trialDays = 7, compact }: {
  title: string; text: string; signedIn?: boolean; next?: string; trialDays?: number; compact?: boolean;
}) {
  const pricing = `/pricing${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  return (
    <div className={`upgrade-box${compact ? " compact" : ""}`} role="region" aria-label="TrailsTV+ required">
      <div className="upgrade-badge" aria-hidden="true">TrailsTV+</div>
      <h3>{titleCase(title)}</h3>
      <p>{text}</p>
      <div className="upgrade-actions">
        <Link href={pricing} className="btn-upgrade">{trialDays ? `Start ${trialDays}-day free trial` : "See plans"}</Link>
        {!signedIn && <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="small">Already a member? Sign in</Link>}
      </div>
      {trialDays > 0 && <p className="small upgrade-fine">Free for {trialDays} days for new members. Cancel anytime.</p>}
    </div>
  );
}

/** Content that free visitors see faded out under an upgrade box. `children` is the teaser. */
export function Teaser({ children, box }: { children: React.ReactNode; box: React.ReactNode }) {
  return (
    <div className="teaser">
      <div className="teaser-content" aria-hidden="true" inert>{children}</div>
      <div className="teaser-box">{box}</div>
    </div>
  );
}
