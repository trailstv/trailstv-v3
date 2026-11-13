const NOTICES: Record<string, string> = {
  granted: "Access granted. It's active immediately.",
  revoked: "Access revoked.",
  "made-admin": "User is now an admin.",
  "removed-admin": "Admin role removed.",
};

export function Notice({ notice, error }: { notice?: string; error?: string }) {
  if (error) return <div className="notice warn">⚠️ {error}</div>;
  if (notice && NOTICES[notice]) return <div className="notice">✓ {NOTICES[notice]}</div>;
  return null;
}
