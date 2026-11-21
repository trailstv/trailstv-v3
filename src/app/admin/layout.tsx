import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminPage } from "@/lib/admin";
import { countNewInquiries } from "@/lib/partners-server";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdminPage();
  const newPartners = await countNewInquiries().catch(() => 0);
  return (
    <div className="container admin">
      <div className="admin-bar">
        <b>TrailsTV Admin</b>
        <nav>
          <Link href="/admin">Overview</Link>
          <Link href="/admin/users">Users</Link>
          <Link href="/admin/grants">Complimentary access</Link>
          <Link href="/admin/partners">Partners{newPartners ? ` (${newPartners})` : ""}</Link>
          <Link href="/admin/audit">Audit log</Link>
        </nav>
        <span className="small muted">{admin.email}</span>
      </div>
      {children}
    </div>
  );
}
