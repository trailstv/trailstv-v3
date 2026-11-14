"use client";

import { useState } from "react";
import { signOut } from "@/lib/auth-client";

export function SignOutButton({ className = "btn-outline" }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className={className} disabled={busy}
      onClick={async () => { setBusy(true); await signOut(); window.location.href = "/"; }}>
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
