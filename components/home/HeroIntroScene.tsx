"use client";

import { useRef, useState } from "react";
import type { PointerEvent } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { HeroArtifact } from "./HeroArtifact";
import { HeroTypography } from "./HeroTypography";

/**
 * HERO FIRST VIEW · 数字印章展厅首屏
 *
 * 构图（museum exhibition opening，非 marketing hero）：
 *   左侧   克制叙事 —— label + 陈述 + 一行说明 + 单一入口
 *   右侧   印章主体 —— 真实比例、黑暗中被发现（视觉高度 ~40–56%）
 *   背景   巨大 YIN KEDAO 墙面字 —— 低透明度、被印章部分遮挡
 *   底部   极简探索提示 —— 细线缓慢呼吸
 *
 * 入场（slow / quiet / cinematic）：
 *   0–0.8s 黑暗 → 0.8–2.5s 印章显现 → 1.5–3.3s 墙面字 → 1.9–3.3s 叙事 → 2.9s 提示
 *
 * 滚动 = CAMERA MOVE（非页面切换）：印章向前靠近（scale/x/亮度），
 * 墙面字退向黑暗，左侧叙事先退场 —— 之后进入既有 ACT 2–5（未改动）。
 * 鼠标视差仅 1–3px，且仅在 pointer:fine 且未开启"减少动态"时启用。
 */
export function HeroIntroScene() {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  /* CAMERA MOVE —— 用户走近印章 */
  const pieceScale = useTransform(scrollYProgress, [0, 1], [1, 1.25]);
  const pieceX = useTransform(scrollYProgress, [0, 1], ["0vw", "-8vw"]);
  const veilOpacity = useTransform(scrollYProgress, [0, 0.85], [0.32, 0]);
  const glowOpacity = useTransform(scrollYProgress, [0, 1], [1, 0.4]);

  /* 墙面字 / 叙事 / 提示的退场 */
  const wallY = useTransform(scrollYProgress, [0, 1], [0, -80]);
  const wallOpacity = useTransform(scrollYProgress, [0, 1], [1, 0.3]);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.4], [1, 0]);
  const copyY = useTransform(scrollYProgress, [0, 0.4], [0, -36]);
  const hintOpacity = useTransform(scrollYProgress, [0, 0.15], [1, 0]);

  /* 鼠标微视差 —— 归一化指针值 [-1, 1]，位移在子组件内做弹簧 */
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  /* 惰性检测（不进渲染输出，无 hydration mismatch；避免 effect 内同步 setState） */
  const [finePointer] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches,
  );

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (reduce || !finePointer) return;
    const rect = e.currentTarget.getBoundingClientRect();
    pointerX.set(((e.clientX - rect.left) / rect.width) * 2 - 1);
    pointerY.set(((e.clientY - rect.top) / rect.height) * 2 - 1);
  }

  function handlePointerLeave() {
    pointerX.set(0);
    pointerY.set(0);
  }

  return (
    <section ref={ref} className="relative h-[165vh]" aria-label={t("home.chapterLabel")}>
      <div
        className="sticky top-0 h-dvh overflow-hidden"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        {/* 背景层 —— 巨大墙面字 */}
        <HeroTypography y={wallY} opacity={wallOpacity} pointerX={pointerX} />

        {/* 主体层 —— 印章 */}
        <HeroArtifact
          scale={pieceScale}
          x={pieceX}
          veil={veilOpacity}
          glow={glowOpacity}
          pointerX={pointerX}
          pointerY={pointerY}
          alt={t("home.chapterLabel")}
        />

        {/* 前景层 —— 左侧克制叙事（移动端沉底） */}
        <div className="absolute inset-x-8 bottom-[104px] z-20 sm:inset-x-12 lg:inset-x-auto lg:bottom-auto lg:left-16 lg:top-1/2 lg:max-w-[460px] lg:-translate-y-1/2 xl:left-24">
          <motion.div data-motion-scroll="" style={{ opacity: copyOpacity, y: copyY }}>
            <motion.span
              className="act-label block"
              initial={reduce ? false : { opacity: 0, y: 22 }}
              animate={reduce ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 1.9, ease: "easeOut" }}
            >
              {t("home.chapterLabel")}
            </motion.span>
            <motion.h1
              className="hero-statement mt-5"
              initial={reduce ? false : { opacity: 0, y: 22 }}
              animate={reduce ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 2.0, ease: "easeOut" }}
            >
              {t("home.title1")}
              <br />
              {t("home.title2")}
            </motion.h1>
            <motion.p
              className="act-body mt-6 max-w-sm"
              initial={reduce ? false : { opacity: 0, y: 22 }}
              animate={reduce ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 2.15, ease: "easeOut" }}
            >
              {t("home.intro")}
            </motion.p>
            <motion.div
              className="mt-9"
              initial={reduce ? false : { opacity: 0, y: 22 }}
              animate={reduce ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 2.3, ease: "easeOut" }}
            >
              <Link href="/design-interview" className="btn-pill btn-pill-primary">
                {t("common.actions.enterStudio")}
                <ArrowUpRight className="h-4 w-4" strokeWidth={1.5} />
              </Link>
            </motion.div>
          </motion.div>
        </div>

        {/* 提示层 —— 向下探索（细线呼吸） */}
        <motion.div
          data-motion-scroll=""
          style={{ opacity: hintOpacity }}
          className="absolute bottom-8 left-1/2 z-20 -translate-x-1/2 lg:left-16 lg:translate-x-0 xl:left-24"
        >
          <motion.div
            className="flex flex-col items-center gap-3"
            initial={reduce ? false : { opacity: 0 }}
            animate={reduce ? undefined : { opacity: 1 }}
            transition={{ duration: 1.2, delay: 2.9, ease: "easeOut" }}
          >
            <span className="hero-scroll-num" aria-hidden>
              01
            </span>
            <span className="hero-scroll-line" aria-hidden />
            <span className="hero-scroll-text">{t("home.scrollHint")}</span>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
