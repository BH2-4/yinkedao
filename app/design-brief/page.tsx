import type { Metadata } from "next";
import { BriefStudio } from "@/components/design-brief/BriefStudio";
import { translate } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Stage 1 · 参数单确认 — 印可道",
  description: translate(DEFAULT_LOCALE, "designBrief.headerSubtitle"),
};

/**
 * Stage 1 — 参数单确认页（三站流程第 2 站）。
 * URL 持久化：参数单序列化在 query 中，刷新可恢复、链接可分享。
 */
export default function DesignBriefPage() {
  return (
    <main className="stage-space relative min-h-dvh">
      <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-6 pb-24 sm:px-10">
        <header className="relative flex flex-col gap-10 pt-16 sm:pt-24">
          <span aria-hidden className="stage-numeral">
            01
          </span>
          <div className="flex items-center justify-end">
            <span className="eyebrow hidden sm:inline">
              {translate(DEFAULT_LOCALE, "designBrief.stageLabel")}
            </span>
          </div>
          <div className="hairline" aria-hidden />
          <div className="relative z-10 flex flex-col gap-8 pt-2">
            <span className="stage-index">
              {translate(DEFAULT_LOCALE, "designBrief.pageEyebrow")}
            </span>
            <h1 className="act-title">
              {translate(DEFAULT_LOCALE, "designBrief.title1")}
              <br />
              <span className="text-[var(--color-silver-400)]">
                {translate(DEFAULT_LOCALE, "designBrief.title2")}
              </span>
            </h1>
            <p className="act-body max-w-xl">
              {translate(DEFAULT_LOCALE, "designBrief.headerSubtitle")}
            </p>
          </div>
        </header>
        <div className="flex flex-1 flex-col py-12">
          <BriefStudio />
        </div>
      </div>
    </main>
  );
}
