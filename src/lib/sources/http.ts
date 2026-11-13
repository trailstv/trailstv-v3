import "server-only";
import type { SourceResult } from "../types";

interface Opts {
  /** Seconds Next.js / Vercel Data Cache keeps the upstream response. */
  revalidate: number;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * Fetch JSON with caching, a timeout, and a uniform result envelope so one
 * flaky government API never takes down the whole conditions panel.
 */
export async function fetchSource<Raw, Out>(
  source: string,
  attribution: string,
  url: string,
  opts: Opts,
  transform: (raw: Raw) => Out,
): Promise<SourceResult<Out>> {
  const fetchedAt = new Date().toISOString();
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", ...opts.headers },
      next: { revalidate: opts.revalidate, tags: [source] },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = (await res.json()) as Raw;
    return { source, ok: true, fetchedAt, attribution, data: transform(raw) };
  } catch (e) {
    return { source, ok: false, fetchedAt, attribution, error: (e as Error).message };
  }
}

export function missingKey<T>(source: string, attribution: string, key: string): SourceResult<T> {
  return {
    source,
    ok: false,
    fetchedAt: new Date().toISOString(),
    attribution,
    error: `${key} not configured`,
  };
}
