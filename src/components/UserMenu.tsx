"use client";

import Link from "next/link";
import { useSession, signOut } from "@/lib/auth-client";

export function UserMenu() {
  const { data, isPending } = useSession();
  if (isPending) return <span style={{ opacity: 0.6 }}>…</span>;
  if (!data?.user) return <Link href="/login">Sign in</Link>;
  return (
    <>
      <Link href="/trips">Trips</Link>
      <Link href="/me">My Parks</Link>
      {(data.user as { role?: string }).role === "admin" && <Link href="/admin">Admin</Link>}
      <button type="button" className="linkish" style={{ color: "#fff" }} onClick={() => signOut().then(() => (window.location.href = "/"))}>
        Sign out
      </button>
    </>
  );
}
