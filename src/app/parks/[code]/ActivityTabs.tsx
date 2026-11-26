"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Suspense } from "react";
import { ConditionsPanel } from "@/components/ConditionsPanel";
import { DEFAULT_CONDITIONS } from "@/lib/condition-keys";
import type { ConditionKey } from "@/lib/types";

type A = { slug: string; name: string; icon: string; conditions: ConditionKey[] };

/** Activity selector for the right-hand panel. Sets ?activity=…, which drives Live Conditions and the featured video. */
function Chips({ activities: own, all }: { activities: A[]; all: A[] }) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const current = sp.get("activity") ?? undefined;
  // Linked here with an activity the park's list doesn't name? Show it as a chip anyway.
  const extra = current && !own.some((a) => a.slug === current) ? all.find((a) => a.slug === current) : undefined;
  const activities = extra ? [...own, extra] : own;
  const select = (slug?: string) => router.replace(slug ? `${pathname}?activity=${slug}` : pathname, { scroll: false });
  const label = activities.find((a) => a.slug === current);
  return (
    <div className="chips" style={{ margin: 0 }}>
      <button type="button" className={`chip ${!current ? "active" : ""}`} onClick={() => select()}>Overview</button>
      {activities.map((a) => (
        <button type="button" key={a.slug} className={`chip ${current === a.slug ? "active" : ""}`} onClick={() => select(a.slug)}>
          {a.icon} {a.name}
        </button>
      ))}
      <p className="small muted" style={{ margin: ".4rem 0 0", width: "100%" }}>
        {label ? <>Trails, map and conditions now show {label.name.toLowerCase()}. </> : null}
        <a href="#live-conditions">See live conditions ↓</a>
      </p>
    </div>
  );
}

function Conditions({ parkCode, timeZone, activities }: { parkCode: string; timeZone: string; activities: A[] }) {
  const current = useSearchParams().get("activity") ?? undefined;
  const label = activities.find((a) => a.slug === current);
  return (
    <>
      <h2 id="live-conditions" style={{ scrollMarginTop: 80 }}>Live Conditions{label && <span className="muted" style={{ fontWeight: 400 }}> · {label.icon} {label.name}</span>}</h2>
      <ConditionsPanel parkCode={parkCode} keys={label?.conditions ?? DEFAULT_CONDITIONS} timeZone={timeZone} />
    </>
  );
}

export function ActivityChips(props: { activities: A[]; all: A[] }) {
  return <Suspense fallback={null}><Chips {...props} /></Suspense>;
}

export function LiveConditions(props: { parkCode: string; timeZone: string; activities: A[] }) {
  return <Suspense fallback={<p className="muted">Loading live conditions…</p>}><Conditions {...props} /></Suspense>;
}
