"use client";

import { motion, useReducedMotion, useSpring, useTransform } from "motion/react";
import type { MotionValue } from "motion/react";

interface HeroTypographyProps {
  y: MotionValue<number>;
  opacity: MotionValue<number>;
  pointerX: MotionValue<number>;
}

/**
 * HERO WALL TYPOGRAPHY · 巨大背景字
 *
 * "YIN KEDAO" 不再是首屏唯一主角，而是展览墙上的巨型墙面字：
 * 低透明度、轻微 blur、左缘渐隐入黑暗、右缘略微出血到视口外。
 * 印章挂在它前面（z-10 > z-0），部分文字被印章自然遮挡。
 *
 * 纯视觉层：aria-hidden，不承载任何业务文案。
 */
export function HeroTypography({ y, opacity, pointerX }: HeroTypographyProps) {
  const reduce = useReducedMotion();

  /* 远景视差 —— 与印章反向的极小位移，制造前后景深。 */
  const driftX = useSpring(useTransform(pointerX, [-1, 1], [4, -4]), {
    stiffness: 36,
    damping: 26,
    mass: 1.1,
  });

  return (
    <motion.div
      data-motion-scroll=""
      aria-hidden
      style={{ y, opacity }}
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      <motion.div
        style={reduce ? undefined : { x: driftX }}
        className="absolute inset-y-0 right-0"
      >
        <div className="hero-wall flex translate-x-[2%] flex-col items-end justify-center">
          <motion.span
            className="hero-wall-type"
            initial={reduce ? false : { opacity: 0 }}
            animate={reduce ? undefined : { opacity: 1 }}
            transition={{ duration: 1.6, delay: 1.5, ease: "easeOut" }}
          >
            YIN
          </motion.span>
          <motion.span
            className="hero-wall-type"
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={reduce ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 1.6, delay: 1.7, ease: "easeOut" }}
          >
            KEDAO
          </motion.span>
        </div>
      </motion.div>
    </motion.div>
  );
}
