import Link from "next/link";
import { STATUS_TYPES, type StatusType } from "@/lib/park-status";

/** Pill links to /conditions/<type>: current conditions across every park. */
export function ConditionPills({ active, title = true }: { active?: StatusType | "all"; title?: boolean }) {
  return (
    <nav className="cond-pills" aria-label="Current conditions in all parks">
      {title && <span className="cond-pills-title">Current conditions</span>}
      <Link href="/conditions" className={`chip${active === "all" ? " active" : ""}`}>📋 All</Link>
      {(Object.keys(STATUS_TYPES) as StatusType[]).map((t) => (
        <Link key={t} href={`/conditions/${t}`} className={`chip${active === t ? " active" : ""}`} aria-current={active === t ? "page" : undefined}>
          <span aria-hidden="true">{STATUS_TYPES[t].icon}</span> {STATUS_TYPES[t].label}
        </Link>
      ))}
    </nav>
  );
}
