"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";

/**
 * Header for the Design Render studio. States the pipeline lineage with
 * Stage 05 (this page) as the current step, and links back to the confirmed
 * proposal — Stage 5 never stands alone.
 */
export function RenderHeader() {
  const { t } = useI18n();

  return (
    <header className="relative flex flex-col gap-10 py-16 sm:py-24">
      {/* 展厅编号水印 */}
      <span aria-hidden className="stage-numeral">
        05
      </span>


      <div className="hairline" aria-hidden />

      <div className="relative z-10 flex flex-col gap-9 pt-2">
        <Link
          href="/design-brief"
          className="inline-flex items-center gap-2 text-[12px] tracking-[0.16em] text-[var(--color-silver-500)] uppercase transition-colors hover:text-[var(--color-silver-200)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
          {t("designRender.backToProposal")}
        </Link>
        <span className="stage-index">05 / Render</span>
        <div className="max-w-3xl animate-fade-in">
          <h1 className="act-title">
            {t("designRender.headerTitle")}
          </h1>
          <p className="act-body mt-7 max-w-xl">
            {t("designRender.headerSubtitle")}
          </p>
        </div>
      </div>
    </header>
  );
}
