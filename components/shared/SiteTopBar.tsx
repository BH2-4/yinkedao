"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { BrandMark } from "@/components/shared/BrandMark";
import { useI18n } from "@/components/i18n/I18nProvider";
import { COLLECTION_URL } from "@/lib/collection-url";
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
    <div className="sticky top-0 z-40 border-b border-[var(--color-line)] bg-[rgba(0,0,0,0.78)] backdrop-blur-md supports-[backdrop-filter]:bg-[rgba(0,0,0,0.62)]">
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

          <div className="journey-menu-panel invisible absolute left-1/2 top-full z-50 w-[340px] -translate-x-1/2 translate-y-2 pt-3 opacity-0 transition-all duration-300 ease-[var(--ease-atelier)] group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
            <div className="border border-[var(--color-line)] bg-[rgba(4,4,5,0.96)] p-2 backdrop-blur-md">
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
                    <span className="font-mono text-[11px] tracking-[0.14em] text-[var(--color-silver-600)] transition-colors duration-300 group-hover/item:text-[var(--color-silver-300)]">
                      {stage.code}
                    </span>
                    <span className="flex flex-col gap-1">
                      <span className="text-[13px] tracking-[0.06em] text-[var(--color-silver-200)] transition-colors duration-300 group-hover/item:text-[var(--color-ivory)]">
                        {t(stage.nameKey)}
                      </span>
                      <span className="text-[11px] leading-relaxed text-[var(--color-silver-600)]">
                        {t(stage.descKey)}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>

        <div className="flex items-center gap-7">
          {/* 成品直购线 —— 跳转独立站，与定制线并行 */}
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
          {/* 关于 —— 指向成品站的工坊介绍页 */}
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
        </div>
      </div>
    </div>
  );
}
