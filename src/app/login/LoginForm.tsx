"use client";

import { useEffect, useRef, useState } from "react";
import { signIn, signUp } from "@/lib/auth-client";
import { Turnstile, type TurnstileHandle } from "@/components/Turnstile";

export function LoginForm({ next, google, initialMode, turnstileSiteKey }: { next: string; google: boolean; initialMode: "signin" | "signup"; turnstileSiteKey?: string | null }) {
  const [mode, setMode] = useState(initialMode);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const shownAt = useRef(0);
  const turnstile = useRef<TurnstileHandle>(null);
  // Spam check: when the form appeared (restarts when switching sign in ↔ sign up).
  useEffect(() => { shownAt.current = Date.now(); }, [mode]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email"));
    const password = String(f.get("password"));
    if (turnstileSiteKey && !token) {
      setBusy(false);
      return setError("Just a second: checking you're not a robot. Try again in a moment.");
    }
    // Spam checks read by the server (src/lib/bot-guard.ts) + the Turnstile token.
    const headers: Record<string, string> = {
      "x-tt-hp": String(f.get("website") ?? ""),
      "x-tt-age": String(Date.now() - shownAt.current),
      ...(token ? { "x-captcha-response": token } : {}),
    };
    const res =
      mode === "signup"
        ? await signUp.email({ email, password, name: String(f.get("name") || email.split("@")[0]) }, { headers })
        : await signIn.email({ email, password }, { headers });
    turnstile.current?.reset(); // tokens are single-use
    setBusy(false);
    if (res.error) {
      if (res.error.status === 429) return setError("Too many attempts. Please wait a minute and try again.");
      return setError(res.error.message ?? "Something went wrong");
    }
    // Full navigation so server components re-render with the new session.
    window.location.href = next;
  }

  return (
    <div className="card" style={{ marginTop: "1rem" }}>
      {google && (
        <>
          <button type="button" className="btn-outline" style={{ width: "100%" }} onClick={() => signIn.social({ provider: "google", callbackURL: next })}>
            Continue with Google
          </button>
          <p className="muted small" style={{ textAlign: "center" }}>or</p>
        </>
      )}
      <form className="report" onSubmit={submit}>
        {mode === "signup" && <input name="name" placeholder="Your name" autoComplete="name" maxLength={60} />}
        <input name="email" type="email" placeholder="Email" required autoComplete="email" />
        <input name="password" type="password" placeholder="Password (8+ characters)" required minLength={8} autoComplete={mode === "signup" ? "new-password" : "current-password"} />
        {/* Trap for bots: hidden from people and screen readers, never filled in by a real person. */}
        <div className="hp-field" aria-hidden="true">
          <label>Website <input name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" /></label>
        </div>
        {turnstileSiteKey && <Turnstile siteKey={turnstileSiteKey} onToken={setToken} ref={turnstile} />}
        <button disabled={busy}>{busy ? "…" : mode === "signup" ? "Create account" : "Sign in"}</button>
        {error && <p className="small" style={{ color: "var(--danger)" }}>{error}</p>}
      </form>
      <p className="small" style={{ marginTop: "1rem" }}>
        {mode === "signup" ? "Already have an account? " : "New to TrailsTV? "}
        <button type="button" className="linkish" onClick={() => setMode(mode === "signup" ? "signin" : "signup")}>
          {mode === "signup" ? "Sign in" : "Create an account"}
        </button>
      </p>
    </div>
  );
}
