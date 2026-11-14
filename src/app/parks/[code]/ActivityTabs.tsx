"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Suspense } from "react";
import { ConditionsPanel } from "@/components/ConditionsPanel";

type A = { slug: string; name: string; icon: string };

/** Activity selector for the right-hand panel. Sets ?activity=…, which drives Live Conditions and the featured video. */
function Chips({ activities }: { activities: A[] }) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const current = sp.get("activity") ?? undefined;
  const select = (slug?: string) => router.replace(slug ? `${pathname}?activity=${slug}` : pathname, { scroll: false });
  return (
    <div className="chips" style={{ margin: 0 }}>
      <button type="button" className={`chip ${!current ? "active" : ""}`} onClick={() => select()}>Overview</button>
      {activities.map((a) => (
        <button type="button" key={a.slug} className={`chip ${current === a.slug ? "active" : ""}`} onClick={() => select(a.slug)}>
          {a.icon} {a.name}
        </button>
      ))}
    </div>
  );
}

function Conditions({ parkCode, timeZone, activities }: { parkCode: string; timeZone: string; activities: A[] }) {
  const current = useSearchParams().get("activity") ?? undefined;
  const label = activities.find((a) => a.slug === current);
  return (
    <>
      <h2>Live conditions{label && <span className="muted" style={{ fontWeight: 400 }}> · {label.icon} {label.name}</span>}</h2>
      <ConditionsPanel parkCode={parkCode} activity={current} timeZone={timeZone} />
    </>
  );
}

export function ActivityChips(props: { activities: A[] }) {
  return <Suspense fallback={null}><Chips {...props} /></Suspense>;
}

export function LiveConditions(props: { parkCode: string; timeZone: string; activities: A[] }) {
  return <Suspense fallback={<p className="muted">Loading live conditions…</p>}><Conditions {...props} /></Suspense>;
}
