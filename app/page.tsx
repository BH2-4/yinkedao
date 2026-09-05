"use client";

import { useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { motion, useScroll, useTransform } from "motion/react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { HeroIntroScene } from "@/components/home/HeroIntroScene";
import { JourneySection } from "@/components/journey/JourneySection";
import { COLLECTION_URL } from "@/lib/collection-url";
import { SEAL_3D_URL } from "@/lib/story-url";

/**
 * HOME — 印可道 · AI 篆刻定制工作室
 *
 * 五幕滚动叙事：滚动不是"向下移动页面"，而是"控制设计过程"。
 *
 *   ACT 1  HERO FIRST VIEW       数字印章展厅首屏（HeroIntroScene）：
 *                                 左侧克制叙事 + 右侧印章主体 + 巨大
 *                                 墙面字沉入黑暗，滚动 = 走近印章
 *   ACT 2  FROM HERITAGE        印章靠近——scale 随滚动增长
 *   ACT 3  MATERIAL & CRAFT     石材与刻工的局部放大
 *   ACT 4  CULTURE              文化来源（档案馆意象）
 *   ACT 5  YOUR MEMORY          纯黑，记忆成印——进入 Stage 0
 *
 * 每幕一个视觉主角（ONE HERO OBJECT），由 useScroll 驱动缓动
 * transform；所有动效 slow / precise / cinematic。移动端与
 * prefers-reduced-motion 自动退化为静态排版（MotionReveal 兜底）。
 *
 * 图片资产为博物馆展陈语境的真实印章棚拍——只作为氛围与品牌
 * 视觉，不代表任何具体文化结论。
 */

export default function Home() {
  const { t } = useI18n();

  return (
    <main className="relative">
      <HeroIntroScene />
      <ActTwo />
      <ActThree />
      <ActFour />
      <ActFive />
      <JourneySection />
      <AtelierFooter />
      <span className="sr-only">{t("home.coCreationNote")}</span>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*  ACT 2 — FROM HERITAGE, TO POSSIBILITY · 印章靠近                            */
/* -------------------------------------------------------------------------- */

function ActTwo() {
  const { t } = useI18n();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const imgScale = useTransform(scrollYProgress, [0.1, 0.9], [1.14, 1.34]);
  const imgX = useTransform(scrollYProgress, [0.1, 0.9], ["8%", "-6%"]);
  const textOpacity = useTransform(scrollYProgress, [0.22, 0.45, 0.75, 0.95], [0, 1, 1, 0]);
  const textY = useTransform(scrollYProgress, [0.22, 0.95], [40, -40]);

  return (
    <section ref={ref} className="relative h-[170vh]">
      <div className="sticky top-0 flex h-dvh items-center overflow-hidden">
        {/* 印章持续放大 —— 已进入局部 */}
        <motion.div
          data-motion-scroll=""
          style={{ scale: imgScale, x: imgX }}
          className="absolute inset-0 flex items-center justify-center"
        >
          <div
            className="relative h-[86vmin] w-[86vmin]"
            style={{
              maskImage:
                "radial-gradient(closest-side, black 46%, transparent 96%)",
              WebkitMaskImage:
                "radial-gradient(closest-side, black 46%, transparent 96%)",
            }}
          >
            <Image
              src="/atelier/hero-seal.jpg"
              alt=""
              aria-hidden
              fill
              sizes="90vw"
              className="object-cover"
            />
          </div>
        </motion.div>

        {/* 左侧文字 —— 不对称排版 */}
        <motion.div
          style={{ opacity: textOpacity, y: textY }}
          className="relative z-10 mx-auto w-full max-w-[1400px] px-8 sm:px-12 lg:px-16"
        >
          <div className="max-w-xl">
            <span className="act-label">{t("home.act2Label")}</span>
            <h2 className="act-title mt-5">{t("home.act2Title")}</h2>
            <p className="act-body mt-6 max-w-md">{t("home.act2Body")}</p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  ACT 3 — MATERIAL & CRAFT · 石材与刻工的局部                                 */
/* -------------------------------------------------------------------------- */

function ActThree() {
  const { t } = useI18n();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const imgScale = useTransform(scrollYProgress, [0.1, 0.9], [1.06, 1.18]);
  const imgOpacity = useTransform(scrollYProgress, [0.05, 0.3, 0.8, 0.98], [0, 1, 1, 0.2]);
  const textOpacity = useTransform(scrollYProgress, [0.28, 0.5, 0.78, 0.95], [0, 1, 1, 0]);

  return (
    <section ref={ref} className="relative h-[170vh]">
      <div className="sticky top-0 h-dvh overflow-hidden">
        {/* 材质局部 —— 全幅，慢速放大 */}
        <motion.div data-motion-scroll="" style={{ scale: imgScale, opacity: imgOpacity }} className="absolute inset-0">
          <div
            className="absolute inset-0"
            style={{
              maskImage:
                "radial-gradient(120% 90% at 50% 50%, black 40%, transparent 92%)",
              WebkitMaskImage:
                "radial-gradient(120% 90% at 50% 50%, black 40%, transparent 92%)",
            }}
          >
            <Image
              src="/atelier/detail-seal.jpg"
              alt=""
              aria-hidden
              fill
              sizes="100vw"
              className="object-cover"
            />
          </div>
          {/* 压暗层 —— 保证文字可读 */}
          <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.78),rgba(0,0,0,0.25)_55%,rgba(0,0,0,0.55))]" />
        </motion.div>

        {/* 文字 —— 居中沉底 */}
        <motion.div
          style={{ opacity: textOpacity }}
          className="relative z-10 mx-auto flex h-full max-w-[1400px] flex-col items-start justify-end px-8 pb-24 sm:px-12 lg:px-16"
        >
          <div className="max-w-xl">
            <span className="act-label">{t("home.act3Label")}</span>
            <h2 className="act-title mt-5">{t("home.act3Title")}</h2>
            <p className="act-body mt-6 max-w-md">{t("home.act3Body")}</p>
            {/* 3D 篆章展厅 —— 外链独立 3D 站；未配置地址时入口整体隐藏 */}
            {SEAL_3D_URL && (
              <a
                href={`${SEAL_3D_URL}?utm_source=engine&utm_medium=act3-link&utm_campaign=3d-seal`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-7 inline-flex items-center gap-1.5 text-[12px] tracking-[0.16em] uppercase underline decoration-[var(--color-line-strong)] underline-offset-8 transition-colors duration-300 hover:text-[var(--color-silver-300)]"
              >
                {t("home.act3StoryLink")}
                <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.5} />
              </a>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  ACT 4 — CULTURE IS NOT DECORATION · 文化档案馆                             */
/* -------------------------------------------------------------------------- */

function ActFour() {
  const { t } = useI18n();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const imgX = useTransform(scrollYProgress, [0.1, 0.9], ["-6%", "6%"]);
  const imgOpacity = useTransform(scrollYProgress, [0.05, 0.3, 0.8, 0.98], [0, 1, 1, 0.2]);
  const textOpacity = useTransform(scrollYProgress, [0.28, 0.5, 0.78, 0.95], [0, 1, 1, 0]);

  return (
    <section ref={ref} className="relative h-[170vh]">
      <div className="sticky top-0 h-dvh overflow-hidden">
        {/* 文化意象 —— 侧向缓移（视差） */}
        <motion.div data-motion-scroll="" style={{ x: imgX, opacity: imgOpacity }} className="absolute inset-0">
          <div
            className="absolute inset-0"
            style={{
              maskImage:
                "radial-gradient(110% 85% at 50% 50%, black 42%, transparent 94%)",
              WebkitMaskImage:
                "radial-gradient(110% 85% at 50% 50%, black 42%, transparent 94%)",
            }}
          >
            <Image
              src="/atelier/culture-seal.jpg"
              alt=""
              aria-hidden
              fill
              sizes="100vw"
              className="object-cover"
            />
          </div>
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.82),rgba(0,0,0,0.3)_50%,rgba(0,0,0,0.66))]" />
        </motion.div>

        {/* 文字 —— 右侧 */}
        <motion.div
          style={{ opacity: textOpacity }}
          className="relative z-10 mx-auto flex h-full max-w-[1400px] items-center px-8 sm:px-12 lg:px-16"
        >
          <div className="ml-auto max-w-xl text-left">
            <span className="act-label">{t("home.act4Label")}</span>
            <h2 className="act-title mt-5">{t("home.act4Title")}</h2>
            <p className="act-body mt-6 max-w-md">{t("home.act4Body")}</p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  ACT 5 — YOUR MEMORY BECOMES FORM · 进入工坊                                */
/* -------------------------------------------------------------------------- */

function ActFive() {
  const { t } = useI18n();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end end"],
  });

  const textOpacity = useTransform(scrollYProgress, [0.15, 0.45], [0, 1]);
  const textY = useTransform(scrollYProgress, [0.15, 0.6], [60, 0]);
  const textScale = useTransform(scrollYProgress, [0.15, 0.6], [0.97, 1]);

  return (
    <section ref={ref} className="relative flex min-h-dvh items-center">
      <motion.div
        data-motion-scroll=""
        style={{ opacity: textOpacity, y: textY, scale: textScale }}
        className="mx-auto w-full max-w-[1400px] px-8 py-32 sm:px-12 lg:px-16"
      >
        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          <span className="act-label">{t("home.act5Label")}</span>
          <h2 className="act-title mt-6">{t("home.act5Title")}</h2>
          <p className="act-body mt-7 max-w-md">{t("home.act5Body")}</p>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
            <Link href="/design-interview" className="btn-pill btn-pill-primary">
              {t("common.actions.enterStudio")}
              <ArrowUpRight className="h-4 w-4" strokeWidth={1.5} />
            </Link>
            {/* 成品直购线 —— 跳转独立站，与定制线并行 */}
            <a
              href={COLLECTION_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-pill btn-pill-secondary"
            >
              {t("home.shopCollection")}
              <ArrowUpRight className="h-4 w-4" strokeWidth={1.5} />
            </a>
          </div>
          <a
            href="#journey"
            className="mt-8 text-[12px] tracking-[0.18em] text-[var(--color-silver-500)] uppercase underline decoration-[var(--color-line-strong)] underline-offset-8 transition-colors duration-300 hover:text-[var(--color-silver-300)]"
          >
            {t("home.exploreProcess")}
          </a>
        </div>
      </motion.div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  FOOTER                                                                     */
/* -------------------------------------------------------------------------- */

function AtelierFooter() {
  const { t } = useI18n();
  return (
    <footer className="border-t border-[var(--color-line)]">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-3 px-8 py-10 text-[12px] tracking-[0.08em] text-[var(--color-silver-600)] sm:flex-row sm:items-center sm:justify-between sm:px-12 lg:px-16">
        <span>{t("home.footer1")}</span>
        {SEAL_3D_URL && (
          <a
            href={`${SEAL_3D_URL}?utm_source=engine&utm_medium=footer&utm_campaign=3d-seal`}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors duration-300 hover:text-[var(--color-silver-300)]"
          >
            {t("home.footer3dStory")}
          </a>
        )}
        <span>{t("home.footer2")}</span>
      </div>
    </footer>
  );
}
