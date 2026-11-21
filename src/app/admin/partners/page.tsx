import Link from "next/link";
import { INQUIRY_STATUSES, listInquiries, type InquiryStatus } from "@/lib/partners-server";
import { KIND_LABEL } from "@/lib/partners";
import { Notice } from "../Notice";

const when = (d: Date) => d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Los_Angeles" });
const LABEL: Record<InquiryStatus, string> = { new: "New", contacted: "Contacted", closed: "Closed", spam: "Spam" };

export default async function AdminPartners({ searchParams }: { searchParams: Promise<{ show?: string; notice?: string; error?: string }> }) {
  const { show, notice, error } = await searchParams;
  const filter = (INQUIRY_STATUSES as string[]).includes(show ?? "") ? (show as InquiryStatus) : show === "all" ? "all" : "new";
  const rows = await listInquiries(filter);
  const here = `/admin/partners${filter === "new" ? "" : `?show=${filter}`}`;
  return (
    <>
      <h1>Partners</h1>
      <p className="muted">Messages from the <Link href="/partners">Work with TrailsTV</Link> page. Reply by email, then mark them contacted or closed.</p>
      <Notice notice={notice?.startsWith("marked-") ? `Marked ${LABEL[notice.slice(7) as InquiryStatus]?.toLowerCase() ?? ""}` : notice} error={error} />
      <p className="chips">
        {(["new", "contacted", "closed", "spam", "all"] as const).map((s) => (
          <Link key={s} className={`chip ${filter === s ? "active" : ""}`} href={s === "new" ? "/admin/partners" : `/admin/partners?show=${s}`}>{s === "all" ? "All" : LABEL[s]}</Link>
        ))}
      </p>
      {!rows.length && <p className="muted">Nothing here yet.</p>}
      <div className="inquiries">
        {rows.map((r) => (
          <article key={r.id} className={`card inquiry status-${r.status}`}>
            <header>
              <div>
                <b>{r.name}</b> · {r.organization}
                <div className="small muted">
                  <a href={`mailto:${r.email}?subject=${encodeURIComponent("Working with TrailsTV")}`}>{r.email}</a>
                  {r.website && <> · <a href={r.website} target="_blank" rel="noopener nofollow">{r.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a></>}
                  {" · "}{when(r.createdAt)}
                </div>
              </div>
              <span className="tier">{KIND_LABEL[r.kind] ?? r.kind}</span>
            </header>
            {(r.interests.length > 0 || r.parks || r.budget) && (
              <p className="small" style={{ margin: ".5rem 0 0" }}>
                {r.interests.length > 0 && <><b>Interested in:</b> {r.interests.join(", ")}. </>}
                {r.parks && <><b>Parks:</b> {r.parks}. </>}
                {r.budget && <><b>Budget:</b> {r.budget}.</>}
              </p>
            )}
            <p className="inquiry-msg">{r.message}</p>
            <form method="post" action={`/api/admin/partners/${r.id}`} className="inquiry-actions">
              <input type="hidden" name="returnTo" value={here} />
              <span className="small muted">Status: <b>{LABEL[r.status]}</b></span>
              {INQUIRY_STATUSES.filter((s) => s !== r.status).map((s) => (
                <button key={s} type="submit" name="status" value={s} className="btn-outline">Mark {LABEL[s].toLowerCase()}</button>
              ))}
            </form>
          </article>
        ))}
      </div>
    </>
  );
}
