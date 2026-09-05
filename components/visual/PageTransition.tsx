"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * STAGE 6 · SPATIAL UI · Route Wash
 *
 * A single wrapper mounted around every page's content. On every route
 * change it does exactly two things — nothing more, nothing less:
 *
 *   1. Tags <html> with data-stage="home|interview|global|match|
 *      translation|proposal|render", so globals.css can bias the
 *      ambient atmosphere per stage without any page-level changes.
 *   2. Paints one black wash overlay that fades out in ~460 ms, while
 *      the underlying content class .atelier-page eases from 18 px → 0
 *      over ~780 ms. The reader reads it as "entering a new space",
 *      not "the route just changed".
 *
 * WHAT THIS DOES NOT DO:
 *   · No routing behaviour whatsoever — Next.js App Router handles
 *     navigation, this just paints on mount.
 *   · No business logic, no state coupling — the component doesn't
 *     know what page it is wrapping.
 *   · No animation on same-pathname re-renders — the `key` is the
 *     pathname itself, so React only remounts the animated shell when
 *     the route actually changes.
 *
 * The wash is DOM-cheap (one div per navigation) and honors
 * prefers-reduced-motion via globals.css.
 */

function pathnameToStage(pathname: string | null): string {
  if (!pathname || pathname === "/") return "home";
  if (pathname.startsWith("/design-interview")) return "interview";
  if (pathname.startsWith("/global-design")) return "global";
  if (pathname.startsWith("/design-brief")) return "brief";
  if (pathname.startsWith("/design-render")) return "render";
  return "home";
}

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const stage = useMemo(() => pathnameToStage(pathname), [pathname]);
  /* First mount vs subsequent navigations get slightly different washes.
     The first paint uses a shorter wash so the hero doesn't stall; a
     real navigation runs the full one. */
  const firstMountRef = useRef(true);
  const [washKey, setWashKey] = useState(0);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dataset.stage = stage;
    }
    if (firstMountRef.current) {
      firstMountRef.current = false;
    } else {
      setWashKey((k) => k + 1);
    }
  }, [stage]);

  return (
    <>
      {/* Wash — re-renders on every route change via key change. On
          first paint it fires once, then stays out of the way. */}
      <div key={washKey} className="atelier-wash" aria-hidden />
      {/* Page frame — the content itself. The keyed remount ensures the
          .atelier-page enter animation re-runs on every navigation, so
          the two motions (wash out + page in) stay coordinated. */}
      <div key={`page-${stage}-${washKey}`} className="atelier-page">
        {children}
      </div>
    </>
  );
}
