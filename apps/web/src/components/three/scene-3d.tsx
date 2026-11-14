"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

const REDUCED = "(prefers-reduced-motion: reduce)";

export function useReducedMotion() {
  return useSyncExternalStore(
    (on) => {
      const mq = window.matchMedia(REDUCED);
      mq.addEventListener("change", on);
      return () => mq.removeEventListener("change", on);
    },
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
}

let webglCache: boolean | null = null;
const noop = () => () => {};

/** null on the server and first paint, so the poster renders until we know. */
function useWebGL(): boolean | null {
  return useSyncExternalStore(
    noop,
    () => (webglCache ??= hasWebGL()),
    () => null,
  );
}

/**
 * Canvas container with fallbacks. Renders the static `poster` on the
 * server, with reduced motion, without WebGL, or before the 3D chunk loads.
 * Passes `active` (in viewport) so off-screen scenes stop rendering.
 * Page text and buttons never wait on this.
 */
export function Scene3D({
  poster,
  className,
  children,
  label,
}: {
  poster: React.ReactNode;
  className?: string;
  label: string;
  children: (active: boolean) => React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const capable = useWebGL();
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: "120px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const show3D = capable && !reduced;
  return (
    <div ref={ref} className={cn("relative", className)} role="img" aria-label={label}>
      {show3D ? children(inView) : poster}
    </div>
  );
}

/** Generic poster: soft glow plus a simple SVG mark, matching the scene. */
export function Poster({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("absolute inset-0 flex items-center justify-center", className)}>
      <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_45%,rgba(255,111,175,0.18),transparent_70%)]" />
      {children}
    </div>
  );
}

export function VaultPoster() {
  return (
    <Poster>
      <svg viewBox="0 0 200 200" className="w-[46%] max-w-[260px] opacity-90" aria-hidden>
        <defs>
          <linearGradient id="vg" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.22" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        <rect x="40" y="58" width="120" height="112" rx="16" fill="url(#vg)" stroke="rgba(255,255,255,0.25)" />
        <rect x="52" y="120" width="96" height="40" rx="6" fill="#FF6FAF" opacity="0.45" />
        <rect x="34" y="44" width="132" height="14" rx="6" fill="#d9d9de" opacity="0.8" />
        <circle cx="100" cy="51" r="6" fill="none" stroke="#FF6FAF" strokeWidth="3" />
        <circle cx="30" cy="110" r="10" fill="#FF8CBF" opacity="0.8" />
        <circle cx="172" cy="90" r="8" fill="#FF8CBF" opacity="0.6" />
      </svg>
    </Poster>
  );
}
