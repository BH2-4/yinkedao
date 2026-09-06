"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { ArrowRight, BookOpen } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";
import {
  hintToPatch,
  itemsForSeries,
  scenariosForOccasion,
} from "@/lib/cultural-match/repository";
import type { Scenario } from "@/lib/cultural-match/repository";

/**
 * 文化匹配引导卡组（F6 · 设计引导层）。
 *
 * 用途维度确定后插入展示：3 张文化元素卡（名+白话+来源标注）+
 * 关联成品系列真实图片横滑 + design_hints「为您倾向」芯片。
 * 芯片点击即把倾向预填进访谈答案（后续题目可改选）——
 * 文化引导只「倾向」，不替用户做决定（PRD 7.2 人设）。
 * 证据溯源：每张元素卡标注 source.doc——文化内容严格来自
 * 确认的映射表，AI 不臆造（M8 guardrail 的静态前身）。
 */

interface CulturalHintCardsProps {
  /** 访谈用途答案（occasion token） */
  occasion: string;
  /** 倾向芯片点击回填（写入访谈答案，等同用户预选） */
  onApplyHint: (patch: { field: string; token: string }) => void;
  /** 继续访谈 */
  onContinue: () => void;
}

export function CulturalHintCards({
  occasion,
  onApplyHint,
  onContinue,
}: CulturalHintCardsProps) {
  const { t } = useI18n();
  const scenarios = useMemo(
    () => scenariosForOccasion(occasion),
    [occasion],
  );
  const [activeId, setActiveId] = useState(
    () => scenarios.find((s) => s.id === "life-newborn")?.id
      ?? scenarios.find((s) => s.id === "gift-friend")?.id
      ?? scenarios[0]?.id
      ?? "",
  );
  const scenario: Scenario | null = useMemo(
    () => scenarios.find((s) => s.id === activeId) ?? scenarios[0] ?? null,
    [scenarios, activeId],
  );
  const seriesItems = useMemo(
    () => (scenario ? itemsForSeries(scenario.series_refs) : []),
    [scenario],
  );
  const [applied, setApplied] = useState<string[]>([]);

  if (!scenario) return null;

  const applyChip = (kind: "form" | "button" | "zhu_bai", text: string) => {
    const patch = hintToPatch(kind, text);
    if (!patch) return;
    onApplyHint(patch);
    setApplied((prev) => [...new Set([...prev, `${kind}:${text}`])]);
  };

  const chip = (kind: "form" | "button" | "zhu_bai", text: string) => {
    const key = `${kind}:${text}`;
    const isApplied = applied.includes(key);
    const patchable = hintToPatch(kind, text) !== null;
    return (
      <button
        key={key}
        type="button"
        onClick={() => applyChip(kind, text)}
        className={`rounded-full border px-4 py-1.5 text-[12px] transition-all duration-300 ${
          isApplied
            ? "border-[#c3272b] bg-[rgba(195,39,43,0.06)] text-[#c3272b]"
            : patchable
              ? "border-[var(--color-line)] text-[var(--color-silver-300)] hover:border-[rgba(195,39,43,0.4)] hover:text-[#c3272b]"
              : "border-[var(--color-line)] text-[var(--color-silver-500)]"
        }`}
        aria-pressed={isApplied}
      >
        {text}
        {patchable && !isApplied && (
          <span className="ml-1.5 font-mono text-[10px] text-[var(--color-silver-500)]">
            {t("interview.cultural.chipApply")}
          </span>
        )}
      </button>
    );
  };

  return (
    <section className="animate-fade-in flex flex-col gap-8" aria-label={t("interview.cultural.label")}>
      {/* 标题区 */}
      <div className="flex flex-col gap-3">
        <span className="stage-index">{t("interview.cultural.label")}</span>
        <h2 className="act-title max-w-2xl">{t("interview.cultural.title")}</h2>
        <p className="act-body max-w-xl">{t("interview.cultural.intro")}</p>
      </div>

      {/* 子场景切换（人生节点/赠礼的多场景） */}
      {scenarios.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {scenarios.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={s.id === scenario.id}
              onClick={() => setActiveId(s.id)}
              className={`rounded-full border px-4 py-1.5 text-[12px] transition-all duration-300 ${
                s.id === scenario.id
                  ? "border-[var(--color-silver-300)] bg-[rgba(26,26,26,0.04)] text-[var(--color-silver-100)]"
                  : "border-[var(--color-line)] text-[var(--color-silver-400)] hover:text-[var(--color-silver-200)]"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* 3 张文化元素卡 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {scenario.culture_elements.map((el) => (
          <article
            key={el.id}
            className="flex flex-col gap-3 rounded-[2px] border border-[var(--color-line)] p-5"
          >
            <h3 className="font-sans text-[15px] text-[var(--color-silver-100)]">
              {el.name}
            </h3>
            <p className="text-[13px] leading-relaxed text-[var(--color-silver-400)]">
              {el.description}
            </p>
            <p className="mt-auto flex items-start gap-1.5 border-t border-[var(--color-line)] pt-3 font-mono text-[10px] leading-relaxed text-[var(--color-silver-500)]">
              <BookOpen className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={1.5} />
              {t("interview.cultural.sourceLabel")}：{el.source.doc}
            </p>
          </article>
        ))}
      </div>

      {/* 关联成品系列 · 真实图片横滑 */}
      {seriesItems.length > 0 && (
        <div className="flex flex-col gap-3">
          <span className="font-mono text-[11px] tracking-[0.18em] text-[var(--color-silver-500)] uppercase">
            {t("interview.cultural.seriesLabel")} · {scenario.series_refs.length}{" "}
            {t("interview.cultural.seriesUnit")}
          </span>
          <div className="flex snap-x gap-3 overflow-x-auto pb-2">
            {seriesItems.map((item) => (
              <figure
                key={item.sku}
                className="flex w-36 shrink-0 snap-start flex-col gap-2"
              >
                <div className="relative aspect-square overflow-hidden rounded-[2px] border border-[var(--color-line)]">
                  <Image
                    src={item.img}
                    alt={item.name}
                    fill
                    sizes="144px"
                    className="object-cover"
                  />
                </div>
                <figcaption className="text-[11px] leading-snug text-[var(--color-silver-400)]">
                  {item.name}
                  <span className="mt-0.5 block font-mono text-[10px] text-[var(--color-silver-500)]">
                    {item.stone.color}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
          <p className="text-[10px] leading-relaxed text-[var(--color-silver-600)]">
            {t("interview.cultural.seriesNote")}
          </p>
        </div>
      )}

      {/* 为您倾向芯片（可回填参数单） */}
      <div className="flex flex-col gap-3 border-t border-[var(--color-line)] pt-6">
        <span className="font-mono text-[11px] tracking-[0.18em] text-[var(--color-silver-500)] uppercase">
          {t("interview.cultural.hintsLabel")}
        </span>
        <div className="flex flex-wrap gap-2">
          {scenario.design_hints.form.map((f) => chip("form", f))}
          {scenario.design_hints.button.map((b) => chip("button", b))}
          {chip("zhu_bai", scenario.design_hints.zhu_bai.split("（")[0])}
        </div>
        <p className="max-w-xl text-[12px] leading-relaxed text-[var(--color-silver-500)]">
          {t("interview.cultural.hintsNote")}——{scenario.design_hints.reason}
        </p>
      </div>

      {/* 石色倾向（仅展示——色系不映射参数单 token） */}
      <p className="font-mono text-[11px] tracking-[0.12em] text-[var(--color-silver-500)] uppercase">
        {t("interview.cultural.stoneLabel")} · {scenario.design_hints.stone_color.join(" / ")}
      </p>

      {/* 继续访谈 */}
      <div className="flex items-center gap-4 border-t border-[var(--color-line)] pt-6">
        <button
          type="button"
          onClick={onContinue}
          className="btn-pill btn-pill-primary"
        >
          {t("interview.cultural.continue")}
          <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
        </button>
        <span className="text-[12px] text-[var(--color-silver-600)]">
          {t("interview.cultural.continueHint")}
        </span>
      </div>
    </section>
  );
}
