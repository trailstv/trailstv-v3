"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id: string) => void;
    };
    __ttTurnstileLoad?: Promise<void>;
  }
}

export interface TurnstileHandle { reset: () => void }

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  window.__ttTurnstileLoad ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Turnstile failed to load"));
    document.head.appendChild(s);
  });
  return window.__ttTurnstileLoad;
}

/**
 * Cloudflare Turnstile. Usually invisible: it only shows a checkbox when it's unsure.
 * Tokens are single-use, so call ref.reset() after every submit.
 */
export function Turnstile({ siteKey, onToken, ref }: { siteKey: string; onToken: (token: string | null) => void; ref?: Ref<TurnstileHandle> }) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const cb = useRef(onToken);
  cb.current = onToken;

  useImperativeHandle(ref, () => ({
    reset: () => { cb.current(null); if (widget.current) window.turnstile?.reset(widget.current); },
  }), []);

  useEffect(() => {
    let cancelled = false;
    loadScript().then(() => {
      if (cancelled || !box.current || !window.turnstile) return;
      widget.current = window.turnstile.render(box.current, {
        sitekey: siteKey,
        appearance: "interaction-only",
        size: "flexible",
        theme: "light",
        callback: (t: string) => cb.current(t),
        "expired-callback": () => cb.current(null),
        "error-callback": () => cb.current(null),
      });
    }).catch(() => cb.current(null));
    return () => {
      cancelled = true;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey]);

  return <div ref={box} className="turnstile" />;
}
