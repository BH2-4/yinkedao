"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { BrandMark } from "@/components/shared/BrandMark";
import { useI18n } from "@/components/i18n/I18nProvider";
import { COLLECTION_URL, SHOW_LEGACY_COLLECTION } from "@/lib/collection-url";
import {
  JOURNEY_STAGES,
  stageIndexFromPathname,
} from "@/components/journey/journey-stages";

/**
 * 全局顶部导航条 — 博物馆 / 高级设计工作室风。
 *
 * 左品牌字标 / 中 JOURNEY（hover 展开旅程站点下拉）/ 右成品系列、
 * 关于与语言切换。极轻、极静，不与页面内容争夺注意力。
 */
export function SiteTopBar() {
  const pathname = usePathname();
  const { t } = useI18n();
  const journeyIndex = stageIndexFromPathname(pathname);

  return (
    <div className="sticky top-0 z-40 border-b border-[var(--color-line)] bg-[rgba(255,255,255,0.82)] backdrop-blur-md supports-[backdrop-filter]:bg-[rgba(255,255,255,0.7)]">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-8 px-8 py-5 sm:px-12 lg:px-16">
        <BrandMark />

        {/* JOURNEY —— 一处入口，展开整条旅程 */}
        <nav
          aria-label={t("common.navAria")}
          className="journey-menu group relative hidden lg:block"
        >
          <button
            type="button"
            aria-haspopup="true"
            className={`flex items-center gap-2 py-2 text-[13px] tracking-[0.16em] uppercase transition-colors duration-300 ${
              journeyIndex >= 0
                ? "text-[var(--color-ivory)]"
                : "text-[var(--color-silver-300)] hover:text-[var(--color-ivory)]"
            }`}
          >
            {t("common.navJourney")}
            <ChevronDown
              className="h-3 w-3 transition-transform duration-500 group-hover:rotate-180"
              strokeWidth={1.5}
              aria-hidden
            />
          </button>

          {/* 宣纸底面板：与触发词左对齐，浅色描边 + 柔投影，180ms ease-out 展开 */}
          <div className="journey-menu-panel invisible absolute left-0 top-full z-50 w-[440px] translate-y-[-4px] pt-3 opacity-0 transition-[opacity,transform] duration-[180ms] ease-out group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
            <div className="border border-[rgba(20,20,20,0.12)] bg-[#FAF8F2] px-8 py-7 shadow-[0_16px_40px_rgba(20,20,20,0.10)]">
              {JOURNEY_STAGES.map((stage, i) => {
                const active = i === journeyIndex;
                return (
                  <Link
                    key={stage.code}
                    href={stage.href}
                    aria-current={active ? "page" : undefined}
                    data-active={active || undefined}
                    data-prologue={stage.prologue || undefined}
                    className="journey-menu-item group/item"
                  >
                    {/* 编号 —— 朱砂红衬线，印章编号的朱批笔意 */}
                    <span className="font-editorial text-[12px] leading-[1.6] tracking-[0.14em] text-[#9E2B22]">
                      {stage.code}
                    </span>
                    <span className="flex flex-col gap-1">
                      <span className="font-editorial text-[15px] tracking-[0.06em] text-[#1A1A1A]">
                        {t(stage.nameKey)}
                      </span>
                      <span className="text-[13px] leading-relaxed text-[#6B6B66]">
                        {t(stage.descKey)}
                      </span>
                    </span>
                  </Link>
                );
              })}

              {/* 面板脚注 —— 回首页 THE JOURNEY 区块 */}
              <div className="mt-3 border-t border-[rgba(20,20,20,0.08)] pt-4">
                <Link
                  href="/#journey"
                  className="inline-block border-b border-transparent py-1 text-[12px] tracking-[0.08em] text-[#6B6B66] transition-colors duration-[180ms] ease-out hover:border-[#9E2B22] hover:text-[#9E2B22] focus-visible:text-[#9E2B22] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#9E2B22]"
                >
                  {t("journey.viewAll")}
                </Link>
              </div>
            </div>
          </div>
        </nav>

        <div className="flex items-center gap-7">
          {/* 成品直购线 —— 跳转独立站，与定制线并行。
              苗银残留下线中（SHOW_LEGACY_COLLECTION=false），恢复时改回 true */}
          {SHOW_LEGACY_COLLECTION && (
            <a
              href={COLLECTION_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group hidden items-center gap-1.5 border-b border-transparent pb-0.5 text-[13px] tracking-[0.16em] text-[var(--color-silver-300)] uppercase transition-colors duration-300 hover:border-[var(--color-silver-300)] hover:text-[var(--color-ivory)] sm:inline-flex"
            >
              {t("common.collectionLabel")}
              <ArrowUpRight
                className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                strokeWidth={1.5}
              />
            </a>
          )}
          {/* 关于 —— 指向成品站的工坊介绍页（苗银残留，同开关下线） */}
          {SHOW_LEGACY_COLLECTION && (
            <a
              href="/collection/about/"
              target="_blank"
              rel="noopener noreferrer"
              className="group hidden items-center gap-1.5 border-b border-transparent pb-0.5 text-[13px] tracking-[0.16em] text-[var(--color-silver-300)] uppercase transition-colors duration-300 hover:border-[var(--color-silver-300)] hover:text-[var(--color-ivory)] sm:inline-flex"
            >
              {t("common.navAbout")}
              <ArrowUpRight
                className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                strokeWidth={1.5}
              />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
