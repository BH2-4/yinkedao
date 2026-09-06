"use client";

import { useEffect, useRef } from "react";

/**
 * STAGE 6 · SPATIAL UI · Scroll Choreography
 *
 * Wraps a fragment of the page so it recedes into `translateY(14px) + α 0`
 * until it enters the viewport, then eases forward. Uses one
 * IntersectionObserver per instance, disconnects on first trigger, and
 * respects prefers-reduced-motion automatically (globals.css neutralizes
 * the transform for reduce users, so the fallback is a pure fade).
 *
 * The observer only sets `data-reveal="ready"` — the actual keyframes
 * live in globals.css so every reveal shares the same easing / duration.
 *
 * IMPORTANT: does NOT wrap or intercept business children. It is a plain
 * <div> that adds no accessibility semantics; if the immediate content
 * needs a semantic tag, use the `as` prop.
 */

interface MotionRevealProps {
  children: React.ReactNode;
  /** Element tag — default <div>. Use "section" / "article" for semantics. */
  as?: keyof React.JSX.IntrinsicElements;
  /** Delay (ms) before the reveal starts once the element is in view. */
  delay?: number;
  /** IntersectionObserver threshold (0..1). Default 0.12 = "peeking in". */
  threshold?: number;
  /** Extra classes forwarded to the wrapper. */
  className?: string;
}

export function MotionReveal({
  children,
  as = "div",
  delay = 0,
  threshold = 0.12,
  className,
}: MotionRevealProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    /* Instantly ready when the browser can't observe. */
    if (typeof IntersectionObserver === "undefined") {
      el.dataset.reveal = "ready";
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).dataset.reveal = "ready";
            io.unobserve(entry.target);
          }
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  /* R3F v9 扩展全局 JSX 后 ElementType 联合会退化为 children: never
     （动态标签组件的已知冲突）——cast 到具体标签类型，运行时不变 */
  const Tag = as as "div";
  return (
    <Tag
      ref={ref as never}
      data-reveal=""
      style={{ ["--reveal-delay" as never]: `${delay}ms` }}
      className={className}
    >
      {children}
    </Tag>
  );
}
