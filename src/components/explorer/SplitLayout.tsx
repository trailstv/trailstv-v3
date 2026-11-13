import { ExplorerProvider } from "./Explorer";

/**
 * The TrailsTV page layout: map on the left, scrollable options/list on the right.
 * It overlaps the bottom of the hero image (use <PageHero withSplit>).
 * On phones it stacks: map first, list underneath.
 */
export function SplitLayout({ map, head, children }: { map: React.ReactNode; head?: React.ReactNode; children: React.ReactNode }) {
  return (
    <ExplorerProvider>
      <div className="container">
        <div className="split">
          <div className="split-map">{map}</div>
          <aside className="split-side">
            {head && <div className="split-head">{head}</div>}
            <div className="split-scroll">{children}</div>
          </aside>
        </div>
      </div>
    </ExplorerProvider>
  );
}
