"use client";

import Image from "next/image";
import { motion, useReducedMotion, useSpring, useTransform } from "motion/react";
import type { MotionValue } from "motion/react";

const EASE_EMERGE = [0.16, 1, 0.3, 1] as const;

interface HeroArtifactProps {
  scale: MotionValue<number>;
  x: MotionValue<string>;
  veil: MotionValue<number>;
  glow: MotionValue<number>;
  pointerX: MotionValue<number>;
  pointerY: MotionValue<number>;
  alt: string;
}

/**
 * HERO ARTIFACT · 首屏印章主体
 *
 * 一件被放在黑色博物馆展柜里的真实印章（黑底棚拍）：
 *   - 完整形态、真实比例（原图 3119×3200）
 *   - 径向 mask 让边缘融入黑暗，保留呼吸空间
 *   - 极微弱的环境光（无光圈、无描边、无 glow）
 *   - 入场：从极暗状态缓慢显现（0.8s 起，1.7s 长）
 *   - 鼠标微视差：1–3px + 极小 rotateY —— "有生命"，不"跟着跑"
 */
export function HeroArtifact({
  scale,
  x,
  veil,
  glow,
  pointerX,
  pointerY,
  alt,
}: HeroArtifactProps) {
  const reduce = useReducedMotion();

  const spring = { stiffness: 42, damping: 24, mass: 1.1 };
  const parallaxX = useSpring(useTransform(pointerX, [-1, 1], [-3, 3]), spring);
  const parallaxY = useSpring(useTransform(pointerY, [-1, 1], [-2, 2]), spring);
  const parallaxRotateY = useSpring(
    useTransform(pointerX, [-1, 1], [-1, 1.2]),
    spring,
  );

  return (
    <div className="absolute left-1/2 top-[36%] -translate-x-1/2 -translate-y-1/2 lg:left-auto lg:right-[13%] lg:top-1/2 lg:translate-x-0">
      <motion.div
        aria-hidden
        style={{ opacity: glow }}
        className="pointer-events-none absolute -inset-[28%]"
      >
        <div
          className="h-full w-full"
          style={{
            background:
              "radial-gradient(closest-side, rgba(231,226,211,0.10), transparent 72%)",
          }}
        />
      </motion.div>

      <motion.div
        data-motion-scroll=""
        style={{ scale, x }}
        className="exhibition-plinth relative z-10"
      >
        <motion.div
          style={
            reduce
              ? undefined
              : {
                  x: parallaxX,
                  y: parallaxY,
                  rotateY: parallaxRotateY,
                  transformPerspective: 900,
                }
          }
        >
          <motion.div
            initial={
              reduce
                ? false
                : { opacity: 0, scale: 1.05, filter: "blur(10px) brightness(0.3)" }
            }
            animate={
              reduce
                ? undefined
                : { opacity: 1, scale: 1, filter: "blur(0px) brightness(1)" }
            }
            transition={{ duration: 1.7, delay: 0.8, ease: EASE_EMERGE }}
          >
            <div
              className="relative aspect-[9/16] h-[40vh] sm:h-[46vh] lg:h-[56vmin]"
              style={{
                maskImage:
                  "radial-gradient(115% 88% at 50% 50%, black 52%, transparent 90%)",
                WebkitMaskImage:
                  "radial-gradient(115% 88% at 50% 50%, black 52%, transparent 90%)",
              }}
            >
              <Image
                src="/atelier/hero-seal.jpg"
                alt={alt}
                fill
                priority
                sizes="(min-width: 1024px) 56vmin, 90vw"
                className="object-contain"
              />
              <motion.div
                aria-hidden
                style={{ opacity: veil }}
                className="absolute inset-0 bg-black"
              />
            </div>
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
}
