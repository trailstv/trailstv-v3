import type { Metadata } from "next";
import { PageHero } from "@/components/hero/PageHero";
import { allParkHeroes } from "@/lib/hero";
import { redirect } from "next/navigation";
import { getUser, googleEnabled } from "@/lib/auth";
import { db } from "@/lib/db";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

/** Only allow same-site relative redirects. */
const safeNext = (n?: string) => (n && n.startsWith("/") && !n.startsWith("//") ? n : "/me");

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; mode?: string }> }) {
  const { next, mode } = await searchParams;
  if (await getUser()) redirect(safeNext(next));

  return (
    <>
    <PageHero random={allParkHeroes()} eyebrow="TrailsTV" title={mode === "signup" ? "Create your account" : "Welcome back"} subtitle="Save favorites, plan trips, and track the parks you've visited." />
    <div className="container" style={{ maxWidth: 440 }}>
      {!db ? (
        <div className="notice warn">Connect Neon (DATABASE_URL) to enable accounts.</div>
      ) : (
        <LoginForm
          next={safeNext(next)}
          google={googleEnabled()}
          initialMode={mode === "signup" ? "signup" : "signin"}
          // Only show Turnstile when the server will also check it.
          turnstileSiteKey={process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY ? process.env.TURNSTILE_SITE_KEY : null}
        />
      )}
    </div>
    </>
  );
}
