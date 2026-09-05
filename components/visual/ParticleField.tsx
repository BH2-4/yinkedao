"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * STAGE 6 — DYNAMIC VISUAL LAYER · Depth Pass
 *
 * A single global canvas rendering three separate depth layers of silver
 * particles on the black shell. This is the "2.5D digital design space"
 * — not a flat particle canvas — realized entirely on top of the same
 * primitives from earlier rounds:
 *
 *   BACK  — 40% of particles, α × 0.35, radius × 0.7, parallax × 0.18,
 *           speed × 0.55, never connected. Reads as "distance".
 *   MID   — 40% of particles, α × 0.75, radius × 1.0, parallax × 0.55,
 *           speed × 0.9,  sparse lines. Reads as "space".
 *   FRONT — 20% of particles, α × 1.10, radius × 1.15, parallax × 1.00,
 *           speed × 1.15, brighter shimmer + rarer highlight. Reads as
 *           "close".
 *
 * MOUSE INTERACTION has two independent behaviours composed each frame:
 *   1. SPATIAL PARALLAX — the *entire* layer offsets against the mouse's
 *      normalized position, per-depth. Back drifts ~1.4 px, mid ~4.5 px,
 *      front ~8 px. This is what gives the field 2.5D depth; particles
 *      don't chase the cursor, the whole space tilts.
 *   2. LOCAL PERTURBATION — nearby particles (front layer only) get a
 *      soft outward nudge, then return to their baseline. Reads as
 *      "ripple on water", never "swarm following pointer".
 *
 * All four route modes (idle / generating / error / confirmed) and the
 * per-route intensity multipliers stay in place — see routeIntensity.
 *
 * DESIGN INVARIANTS:
 *   · Canvas is `position: fixed; z-index: 0; pointer-events: none;`
 *   · prefers-reduced-motion → one static frame, no loop.
 *   · DPR-aware, resize-safe, RAF cleanup on unmount and hidden tab.
 *   · Disabled entirely when NEXT_PUBLIC_PARTICLE_EFFECT === "false".
 *   · No cultural imagery, no logos, no motifs — ambience only.
 */

type Layer = "back" | "mid" | "front";

interface Particle {
  layer: Layer;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  opacity: number;
  bx: number;
  by: number;
  phase: number;
  phaseRate: number;
  flashIn: number;
  flashTtl: number;
}

/** Per-layer visual + motion tuning. Composed with route intensity. */
const LAYER_TUNE: Record<
  Layer,
  {
    alpha: number;
    radius: number;
    /** How strongly the mouse "tilts" this layer (spatial parallax px). */
    parallaxPx: number;
    /** Scroll parallax multiplier — front lags the least. */
    scrollMul: number;
    /** Base motion multiplier. */
    speedMul: number;
    /** Baseline-return spring strength. */
    returnK: number;
    /** Fraction of the total particle count assigned to this layer. */
    share: number;
    /** Only front + mid participate in the connecting-line pass. */
    canLink: boolean;
    /** Only front layer receives the local mouse perturbation. */
    canPerturb: boolean;
  }
> = {
  back: {
    alpha: 0.35,
    radius: 0.7,
    parallaxPx: 1.4,
    scrollMul: 0.4,
    speedMul: 0.55,
    returnK: 0.006,
    share: 0.4,
    canLink: false,
    canPerturb: false,
  },
  mid: {
    alpha: 0.75,
    radius: 1.0,
    parallaxPx: 4.5,
    scrollMul: 0.75,
    speedMul: 0.9,
    returnK: 0.012,
    share: 0.4,
    canLink: true,
    canPerturb: false,
  },
  front: {
    alpha: 1.1,
    radius: 1.15,
    parallaxPx: 8.0,
    scrollMul: 1.0,
    speedMul: 1.15,
    returnK: 0.018,
    share: 0.2,
    canLink: true,
    canPerturb: true,
  },
};

/** Broadcast contract. Stage 5 / Stage 4 dispatch these. */
export type ParticleMode = "idle" | "generating" | "error" | "confirmed";
export const PARTICLE_MODE_EVENT = "silver-future:particle-mode";

interface RouteIntensity {
  density: number;
  speed: number;
  lines: boolean;
  driftX: number;
  driftY: number;
  /** Multiplier for the spatial-parallax intensity (Home most immersive). */
  parallaxMul: number;
}

function routeIntensity(pathname: string | null): RouteIntensity {
  if (!pathname) return { density: 1.0, speed: 1.0, lines: true, driftX: 0, driftY: 0, parallaxMul: 1.0 };
  if (pathname.startsWith("/design-interview")) return { density: 0.55, speed: 0.7, lines: false, driftX: 0, driftY: 0, parallaxMul: 0.6 };
  if (pathname.startsWith("/global-design")) return { density: 0.7, speed: 0.85, lines: false, driftX: 0, driftY: 0, parallaxMul: 0.75 };
  if (pathname.startsWith("/design-brief")) return { density: 0.9, speed: 1.0, lines: true, driftX: 0, driftY: 0, parallaxMul: 0.95 };
  if (pathname.startsWith("/design-render")) return { density: 1.1, speed: 1.15, lines: true, driftX: 0, driftY: 0, parallaxMul: 1.1 };
  /* Home — biased right-drift + rise, and the deepest parallax feel. */
  return { density: 1.0, speed: 1.0, lines: true, driftX: 0.012, driftY: -0.006, parallaxMul: 1.15 };
}

function baseDensity(width: number, height: number): number {
  const area = width * height;
  /* 22 000 px² per particle → 1440×900 ≈ 59, 1920×1080 ≈ 94, mobile ≈ 30.
     Clamped so nothing crazy renders on ultra-wide or tiny viewports. */
  const count = Math.round(area / 22000);
  return Math.max(24, Math.min(96, count));
}

function makeParticle(layer: Layer, width: number, height: number): Particle {
  const t = LAYER_TUNE[layer];
  const x = Math.random() * width;
  const y = Math.random() * height;
  return {
    layer,
    x,
    y,
    bx: x,
    by: y,
    vx: (Math.random() - 0.5) * 0.05 * t.speedMul,
    vy: (Math.random() - 0.5) * 0.05 * t.speedMul,
    radius: (0.55 + Math.random() * 0.75) * t.radius,
    opacity: (0.32 + Math.random() * 0.32) * t.alpha,
    phase: Math.random() * Math.PI * 2,
    phaseRate: (0.002 + Math.random() * 0.004) * (layer === "front" ? 1.15 : 1.0),
    flashIn: 360 + Math.floor(Math.random() * 900),
    flashTtl: 0,
  };
}

interface AvoidRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pathname = usePathname();
  const intensityRef = useRef(routeIntensity(pathname));

  useEffect(() => {
    intensityRef.current = routeIntensity(pathname);
  }, [pathname]);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_PARTICLE_EFFECT === "false") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    let width = 0;
    let height = 0;
    let dpr = 1;
    let particles: Particle[] = [];
    let rafId: number | null = null;
    const mouse = { x: -1, y: -1, active: false };
    /* Normalized mouse (–1..+1 on each axis) with easing so the space
       "tilts" instead of snapping to the cursor. */
    let mouseNx = 0;
    let mouseNy = 0;
    let easedMouseNx = 0;
    let easedMouseNy = 0;
    let scrollY = 0;
    let easedScrollY = 0;
    let mode: ParticleMode = "idle";
    const ease = { generating: 0, error: 0, confirmed: 0 };
    let avoidRects: AvoidRect[] = [];
    const AVOID_PAD = 18;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas!.width = Math.floor(width * dpr);
      canvas!.height = Math.floor(height * dpr);
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      const total = Math.round(
        baseDensity(width, height) * intensityRef.current.density,
      );
      const perLayer: Record<Layer, number> = {
        back: Math.round(total * LAYER_TUNE.back.share),
        mid: Math.round(total * LAYER_TUNE.mid.share),
        front: Math.max(1, total - Math.round(total * LAYER_TUNE.back.share) - Math.round(total * LAYER_TUNE.mid.share)),
      };

      /* Rebuild deterministically — three passes, back first so the
         iteration order for rendering matches. */
      const rebuilt: Particle[] = [];
      const existing: Record<Layer, Particle[]> = {
        back: particles.filter((p) => p.layer === "back"),
        mid: particles.filter((p) => p.layer === "mid"),
        front: particles.filter((p) => p.layer === "front"),
      };
      (Object.keys(perLayer) as Layer[]).forEach((layer) => {
        const want = perLayer[layer];
        const have = existing[layer];
        if (have.length >= want) {
          rebuilt.push(...have.slice(0, want));
        } else {
          rebuilt.push(...have);
          for (let i = have.length; i < want; i++) {
            rebuilt.push(makeParticle(layer, width, height));
          }
        }
      });
      particles = rebuilt;

      for (const p of particles) {
        if (p.x > width) p.x = Math.random() * width;
        if (p.y > height) p.y = Math.random() * height;
        p.bx = p.x;
        p.by = p.y;
      }
    }

    function refreshAvoidRects() {
      const nodes = document.querySelectorAll<HTMLElement>(
        "h1, [data-particle-avoid]",
      );
      const rects: AvoidRect[] = [];
      for (let i = 0; i < nodes.length; i++) {
        const r = nodes[i].getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        if (r.bottom < -AVOID_PAD || r.top > height + AVOID_PAD) continue;
        if (r.right < -AVOID_PAD || r.left > width + AVOID_PAD) continue;
        rects.push({
          x: r.left - AVOID_PAD,
          y: r.top - AVOID_PAD,
          w: r.width + AVOID_PAD * 2,
          h: r.height + AVOID_PAD * 2,
        });
      }
      avoidRects = rects;
    }

    function avoidFactorAt(x: number, y: number): number {
      let factor = 1;
      for (let i = 0; i < avoidRects.length; i++) {
        const r = avoidRects[i];
        if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) continue;
        const dx = Math.min(x - r.x, r.x + r.w - x);
        const dy = Math.min(y - r.y, r.y + r.h - y);
        const edge = Math.min(dx, dy);
        const depth = Math.min(1, edge / AVOID_PAD);
        const local = 1 - depth * 0.7;
        if (local < factor) factor = local;
      }
      return factor;
    }

    function step() {
      const { speed, lines, driftX, driftY, parallaxMul } = intensityRef.current;

      ease.generating += ((mode === "generating" ? 1 : 0) - ease.generating) * 0.016;
      ease.error += ((mode === "error" ? 1 : 0) - ease.error) * 0.02;
      ease.confirmed += ((mode === "confirmed" ? 1 : 0) - ease.confirmed) * 0.014;

      easedScrollY += (scrollY - easedScrollY) * 0.06;
      easedMouseNx += (mouseNx - easedMouseNx) * 0.05;
      easedMouseNy += (mouseNy - easedMouseNy) * 0.05;

      refreshAvoidRects();

      ctx!.clearRect(0, 0, width, height);

      /* Central generating glow — sits behind everything. */
      if (ease.generating > 0.02) {
        const cx = width / 2;
        const cy = height / 2;
        const gr = Math.max(width, height) * 0.38;
        const glow = ctx!.createRadialGradient(cx, cy, 0, cx, cy, gr);
        glow.addColorStop(0, `rgba(231, 226, 211, ${0.05 * ease.generating})`);
        glow.addColorStop(1, "rgba(231, 226, 211, 0)");
        ctx!.fillStyle = glow;
        ctx!.fillRect(0, 0, width, height);
      }

      /* Cursor glow — behind particles, α ≤ 0.045. */
      if (mouse.active) {
        const gr = 160;
        const glow = ctx!.createRadialGradient(
          mouse.x,
          mouse.y,
          0,
          mouse.x,
          mouse.y,
          gr,
        );
        glow.addColorStop(0, "rgba(255, 255, 255, 0.045)");
        glow.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx!.fillStyle = glow;
        ctx!.fillRect(mouse.x - gr, mouse.y - gr, gr * 2, gr * 2);
      }

      const INFLUENCE = 130;
      const INFLUENCE_SQ = INFLUENCE * INFLUENCE;
      const generatingBoost = 1 + ease.generating * 0.35;
      const confirmedDamp = 1 - ease.confirmed * 0.3;
      const errorJitterBoost = 1 + ease.error * 0.9;
      const speedFactor = speed * generatingBoost * confirmedDamp;
      const globalJitter = 0.002 * speedFactor * errorJitterBoost;
      const globalVCap = 0.09 * speedFactor * (1 + ease.error * 0.35);
      const centerPull = 0.06 * ease.generating;
      const cxV = width / 2;
      const cyV = height / 2;

      /* Physics pass — one traversal covers all layers. */
      for (const p of particles) {
        const t = LAYER_TUNE[p.layer];
        const jitter = globalJitter * t.speedMul;
        const vCap = globalVCap * t.speedMul;

        p.vx += (Math.random() - 0.5) * jitter;
        p.vy += (Math.random() - 0.5) * jitter;
        if (p.vx > vCap) p.vx = vCap;
        if (p.vx < -vCap) p.vx = -vCap;
        if (p.vy > vCap) p.vy = vCap;
        if (p.vy < -vCap) p.vy = -vCap;

        p.x += p.vx + driftX * t.speedMul;
        p.y += p.vy + driftY * t.speedMul;

        if (centerPull > 0) {
          p.x += (cxV - p.x) * centerPull * 0.02;
          p.y += (cyV - p.y) * centerPull * 0.02;
        }

        p.bx += (p.x - p.bx) * 0.0025;
        p.by += (p.y - p.by) * 0.0025;

        if (t.canPerturb && mouse.active) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const distSq = dx * dx + dy * dy;
          if (distSq < INFLUENCE_SQ && distSq > 0.5) {
            const dist = Math.sqrt(distSq);
            const falloff = (1 - dist / INFLUENCE) * 0.35;
            p.x += (dx / dist) * falloff;
            p.y += (dy / dist) * falloff;
          }
        }

        p.x += (p.bx - p.x) * t.returnK;
        p.y += (p.by - p.y) * t.returnK;

        if (p.x < -6) p.x = width + 6;
        if (p.x > width + 6) p.x = -6;
        if (p.y < -6) p.y = height + 6;
        if (p.y > height + 6) p.y = -6;

        p.phase += p.phaseRate;
        if (p.phase > Math.PI * 2) p.phase -= Math.PI * 2;
        if (p.flashTtl > 0) {
          p.flashTtl -= 1;
        } else if (p.flashIn > 0) {
          p.flashIn -= 1;
        } else {
          const gate =
            (p.layer === "front" ? 0.6 : 0.4) -
            ease.confirmed * 0.25 +
            ease.error * 0.1;
          if (Math.random() < gate) {
            p.flashTtl = 14 + Math.floor(Math.random() * 8);
          }
          p.flashIn = 360 + Math.floor(Math.random() * 900);
        }
      }

      /* Render pass — back → mid (+ lines) → front (+ lines).
         The rendered X/Y always composes: physics + scroll parallax +
         mouse parallax (both per-layer). */
      function renderXY(p: Particle): [number, number] {
        const t = LAYER_TUNE[p.layer];
        const scrollAmp = 6 + ease.generating * 4;
        const scrollOff = Math.max(
          -scrollAmp,
          Math.min(scrollAmp, easedScrollY * 0.02),
        ) * t.scrollMul;
        /* Mouse tilts the space — front shifts more, back barely at all.
           Sign is inverted so moving the cursor right nudges the scene
           left (parallax reading, not follow-the-cursor). */
        const mx = -easedMouseNx * t.parallaxPx * parallaxMul;
        const my = -easedMouseNy * t.parallaxPx * parallaxMul;
        return [p.x + mx, p.y + scrollOff + my];
      }

      const drawLayer = (layer: Layer) => {
        for (const p of particles) {
          if (p.layer !== layer) continue;
          const [rx, ry] = renderXY(p);
          const avoid = avoidFactorAt(rx, ry);
          const shimmer = 1 + Math.sin(p.phase) * 0.1;
          const flashPeak = p.flashTtl > 0 ? p.flashTtl / 22 : 0;
          const confirmedLift = 1 + ease.confirmed * 0.15;
          const alpha = Math.min(
            0.95,
            (p.opacity * shimmer * confirmedLift + flashPeak * 0.35) * avoid,
          );

          ctx!.beginPath();
          ctx!.arc(rx, ry, p.radius, 0, Math.PI * 2);
          ctx!.fillStyle = `rgba(232, 232, 236, ${alpha})`;
          ctx!.fill();

          if (flashPeak > 0 && avoid > 0.4) {
            ctx!.beginPath();
            ctx!.arc(
              rx,
              ry,
              Math.max(0.35, p.radius * 0.55),
              0,
              Math.PI * 2,
            );
            ctx!.fillStyle = `rgba(245, 241, 232, ${flashPeak * 0.65 * avoid})`;
            ctx!.fill();
          }
        }
      };

      const drawLinesFor = (layer: Layer, alphaScale: number) => {
        if (!lines) return;
        const LINK = layer === "front" ? 122 : 105;
        const LINK_SQ = LINK * LINK;
        const linkable: Array<[number, number, Particle, number]> = [];
        for (const p of particles) {
          if (p.layer !== layer) continue;
          const [rx, ry] = renderXY(p);
          const a = avoidFactorAt(rx, ry);
          if (a < 0.6) continue;
          linkable.push([rx, ry, p, a]);
        }
        ctx!.lineWidth = 0.5;
        for (let i = 0; i < linkable.length; i++) {
          const [ax, ay, , aA] = linkable[i];
          for (let j = i + 1; j < linkable.length; j++) {
            const [bx, by, , bA] = linkable[j];
            const dx = ax - bx;
            const dy = ay - by;
            const distSq = dx * dx + dy * dy;
            if (distSq >= LINK_SQ) continue;
            const dist = Math.sqrt(distSq);
            const alpha =
              (1 - dist / LINK) * 0.055 * alphaScale * Math.min(aA, bA);
            ctx!.strokeStyle = `rgba(214, 214, 220, ${alpha})`;
            ctx!.beginPath();
            ctx!.moveTo(ax, ay);
            ctx!.lineTo(bx, by);
            ctx!.stroke();
          }
        }
      };

      drawLayer("back");
      drawLinesFor("mid", 0.6);
      drawLayer("mid");
      drawLinesFor("front", 1.0);
      drawLayer("front");

      rafId = window.requestAnimationFrame(step);
    }

    function drawStatic() {
      refreshAvoidRects();
      ctx!.clearRect(0, 0, width, height);
      for (const p of particles) {
        const avoid = avoidFactorAt(p.x, p.y);
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(232, 232, 236, ${p.opacity * 0.7 * avoid})`;
        ctx!.fill();
      }
    }

    function start() {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (reducedMotion.matches) {
        drawStatic();
      } else {
        rafId = window.requestAnimationFrame(step);
      }
    }

    function onPointerMove(e: PointerEvent) {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.active = true;
      /* Normalize to –1..+1 relative to viewport center. */
      mouseNx = (e.clientX / width) * 2 - 1;
      mouseNy = (e.clientY / height) * 2 - 1;
    }

    function onPointerLeave() {
      mouse.active = false;
      /* Ease the tilt back to center when the pointer leaves. */
      mouseNx = 0;
      mouseNy = 0;
    }

    function onScroll() {
      scrollY = window.scrollY || window.pageYOffset || 0;
    }

    function onVisibility() {
      if (document.hidden) {
        if (rafId !== null) {
          window.cancelAnimationFrame(rafId);
          rafId = null;
        }
      } else {
        start();
      }
    }

    function onReducedMotionChange() {
      start();
    }

    function onModeChange(e: Event) {
      const detail = (e as CustomEvent<{ mode?: ParticleMode }>).detail;
      if (
        detail?.mode === "generating" ||
        detail?.mode === "idle" ||
        detail?.mode === "error" ||
        detail?.mode === "confirmed"
      ) {
        mode = detail.mode;
      }
    }

    resize();
    start();

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    reducedMotion.addEventListener("change", onReducedMotionChange);
    window.addEventListener(PARTICLE_MODE_EVENT, onModeChange);

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      reducedMotion.removeEventListener("change", onReducedMotionChange);
      window.removeEventListener(PARTICLE_MODE_EVENT, onModeChange);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event("resize"));
  }, [pathname]);

  return (
    <canvas
      ref={canvasRef}
      id="particle-field"
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
    />
  );
}
