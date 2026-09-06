"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, RefreshCw } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/I18nProvider";
import { decodeSealOrder, encodeSealOrder } from "@/lib/design/seal-order";
import type { SealOrder } from "@/lib/design/seal-order";
import type { SealRenderApiResponse } from "@/types/design-render";
import { SealFaceProof } from "./SealFaceProof";

/**
 * 效果图工作室（三站流程第 3 站 · 印章质感层）。
 *
 * 数据来源：URL query（参数单持久化——刷新可恢复、链接可分享）。
 * 渲染：POST /api/design-render → 质感层图（mock SVG 章型 / gpt-image-2）。
 * 「重新生成」＝ 换 seed（换参考图组合产生变体）。
 * 印面文字由字体引擎另行叠加——本页展示的是无文字素坯质感层。
 */
export function RenderStudio() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const order: SealOrder | null = useMemo(
    () => decodeSealOrder(searchParams.toString()),
    [searchParams],
  );

  const [phase, setPhase] = useState<"idle" | "generating" | "done" | "error">(
    "idle",
  );
  const [result, setResult] = useState<
    Extract<SealRenderApiResponse, { success: true }> | null
  >(null);
  const [seed, setSeed] = useState(1);

  const generate = useCallback(
    async (nextSeed: number) => {
      if (!order) return;
      setPhase("generating");
      try {
        const res = await fetch("/api/design-render", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ order, seed: nextSeed }),
        });
        const body = (await res.json()) as SealRenderApiResponse;
        if (!body.success) throw new Error(body.error);
        setResult(body);
        setSeed(nextSeed);
        setPhase("done");
      } catch {
        setPhase("error");
      }
    },
    [order],
  );

  /* 空态：URL 无有效参数单 → 回参数单确认页 */
  if (!order) {
    return (
      <section className="animate-fade-in flex flex-col items-start gap-6 border-t border-[var(--color-line)] pt-16">
        <span className="stage-index">{t("designRender.emptyLabel")}</span>
        <h2 className="act-title max-w-xl">{t("designRender.emptyTitle")}</h2>
        <p className="act-body max-w-lg">{t("designRender.emptyBody")}</p>
        <Link href="/design-brief" className="btn-pill btn-pill-primary">
          {t("designRender.emptyCta")}
          <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
        </Link>
      </section>
    );
  }

  const orderQuery = encodeSealOrder(order);

  return (
    <section className="animate-fade-in flex flex-col gap-12">
      {/* 参数单摘要条（可追溯：每个视觉参数来自这里） */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-[var(--color-line)] py-4 font-mono text-[12px] tracking-[0.12em] text-[var(--color-silver-400)] uppercase">
        <span>FORM · {t(`interview.values.sealForm.${order.seal_form}`)}</span>
        <span>FINIAL · {t(`interview.values.finialType.${order.finial_type}`)}</span>
        <span>STONE · {t(`interview.values.stone.${order.stone_type}`)}</span>
        <span>DECOR · {t(`interview.values.decorationLevel.${order.decoration_level}`)}</span>
      </div>

      {/* 生成区 */}
      {phase === "idle" && (
        <div className="flex flex-col items-start gap-6">
          <p className="act-body max-w-xl">{t("designRender.introBody")}</p>
          <button
            type="button"
            onClick={() => generate(seed)}
            className="btn-pill btn-pill-primary"
          >
            {t("designRender.generateCta")}
            <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
      )}

      {phase === "generating" && (
        <div className="flex flex-col items-center justify-center gap-6 py-24">
          <div
            className="h-7 w-7 animate-spin rounded-full border border-[rgba(26,26,26,0.12)] border-t-[var(--color-silver-300)]"
            role="status"
            aria-label={t("designRender.generatingTitle")}
          />
          <p className="font-sans text-[15px] tracking-[0.06em] text-[var(--color-silver-400)]">
            {t("designRender.generatingStages.stage3")}
          </p>
          <p className="max-w-md text-[12px] leading-relaxed text-[var(--color-silver-600)]">
            {t("designRender.generatingNote")}
          </p>
        </div>
      )}

      {phase === "error" && (
        <div className="flex flex-col items-start gap-5 border-t border-[var(--color-line)] pt-10">
          <h3 className="act-title text-[22px]">{t("designRender.errorInterrupted")}</h3>
          <p className="act-body max-w-lg">{t("designRender.errorBody")}</p>
          <button
            type="button"
            onClick={() => generate(seed)}
            className="btn-pill btn-pill-secondary"
          >
            {t("designRender.actions.retry")}
          </button>
        </div>
      )}

      {phase === "done" && result && (
        <div className="flex flex-col gap-10">
          <figure className="flex flex-col gap-4">
            <div className="relative mx-auto aspect-square w-full max-w-[640px] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-line)]">
              {/* dataUrl 自包含 SVG/PNG，Next/Image 无收益 */}
              <img
                src={result.image.data_url}
                alt={t("designRender.imageAlt")}
                className="h-full w-full object-contain"
              />
            </div>
            <figcaption className="flex flex-wrap items-center justify-between gap-3 font-mono text-[11px] tracking-[0.14em] text-[var(--color-silver-500)] uppercase">
              <span>{t("designRender.providerNote", {
                provider: result.image.provider,
                model: result.image.model,
              })}</span>
              <span>SEED · {result.image.seed}</span>
            </figcaption>
          </figure>

          {/* AI 声明（反冒充红线） */}
          <div className="flex flex-col gap-2 border-l-2 border-[var(--color-line-strong)] pl-5">
            <span className="font-mono text-[11px] tracking-[0.18em] text-[var(--color-silver-500)] uppercase">
              {t("designRender.aiNoticeLabel")}
            </span>
            <p className="max-w-2xl text-[13px] leading-relaxed text-[var(--color-silver-300)]">
              {t("designRender.aiNoticeBody")}
            </p>
            <p className="max-w-2xl text-[13px] leading-relaxed text-[var(--color-silver-400)]">
              {t("designRender.aiNoticeBody2")}
            </p>
            <p className="max-w-2xl text-[13px] leading-relaxed text-[var(--color-silver-400)]">
              {t("designRender.differenceNote")}
            </p>
          </div>

          {/* 行动区 */}
          <div className="flex flex-wrap items-center gap-4 border-t border-[var(--color-line)] pt-8">
            <button
              type="button"
              onClick={() => generate(seed + 1)}
              className="btn-pill btn-pill-secondary"
            >
              <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
              {t("designRender.actions.regenerate")}
              <span className="ml-1 font-mono text-[10px] text-[var(--color-silver-500)]">
                {t("designRender.regenerateNote")}
              </span>
            </button>
            <Link
              href={`/design-brief?${orderQuery}`}
              className="btn-pill btn-pill-secondary"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
              {t("designRender.actions.back")}
            </Link>
          </div>

          {/* 印蜕 · 文字层（与质感层并列——石是载体，印是灵魂） */}
          <SealFaceProof
            initialText={order.seal_text ?? ""}
            initialStyle={order.seal_style}
          />
        </div>
      )}

      {/* 印蜕 · 文字层（未生成质感图时同样可用——独立渲染） */}
      {phase !== "done" && (
        <SealFaceProof
          initialText={order.seal_text ?? ""}
          initialStyle={order.seal_style}
        />
      )}
    </section>
  );
}
