import { APIError, createAuthMiddleware } from "better-auth/api";

/**
 * Spam check 1: the sign-in / sign-up form sends two headers.
 *   x-tt-hp    – the value of a hidden "website" field. People never see it; form-filling bots fill it in.
 *   x-tt-age   – milliseconds between the form appearing and being submitted.
 * Requests without them (bots posting straight to the API) are refused too.
 * Kept vague on purpose: the error never says which check failed.
 */
export const MIN_SIGNUP_MS = 2500; // nobody types a name, email and password this fast
export const MIN_SIGNIN_MS = 800; // password managers can fill sign-in very quickly

const REFUSED = "We couldn't process that. Please wait a moment and try again.";

export function checkBotHeaders(path: string, headers: Headers | undefined): string | null {
  if (path !== "/sign-up/email" && path !== "/sign-in/email") return null;
  const honeypot = headers?.get("x-tt-hp");
  const age = Number(headers?.get("x-tt-age"));
  if (honeypot == null || !Number.isFinite(age)) return "missing";
  if (honeypot.trim() !== "") return "honeypot";
  if (age < (path === "/sign-up/email" ? MIN_SIGNUP_MS : MIN_SIGNIN_MS)) return "too-fast";
  if (age > 1000 * 60 * 60 * 24) return "stale";
  return null;
}

export const botGuard = createAuthMiddleware(async (ctx) => {
  const reason = checkBotHeaders(ctx.path, ctx.headers);
  if (reason) {
    console.warn(`[bot-guard] blocked ${ctx.path}: ${reason}`);
    throw new APIError("BAD_REQUEST", { message: REFUSED });
  }
});
