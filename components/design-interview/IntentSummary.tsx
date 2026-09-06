"use client";

import { ArrowRight, RotateCcw } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";
import type { UserDesignIntent } from "@/lib/design-interview/intent-types";

type Props = {
  intent: UserDesignIntent;
  source: "ai" | "rule";
  onRestart: () => void;
  onContinue: () => void;
  continuing: boolean;
};

/** 摘要字段格（模块级——避免 render 内创建组件） */
function Fact({
  label,
  display,
  dim,
}: {
  label: string;
  display: string;
  dim?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-l border-[var(--color-line)] p-4 first:border-l-0 sm:p-5">
      <span className="font-mono text-[11px] tracking-[0.18em] text-[var(--color-silver-500)] uppercase">
        {label}
      </span>
      <span
        className={`text-[13px] ${dim ? "text-[var(--color-silver-600)]" : "text-[var(--color-silver-200)]"}`}
      >
        {display}
      </span>
    </div>
  );
}

/**
 * 完成摘要：以设计工作室「Brief Review」的形式呈现 UserDesignIntent。
 * 只呈现用户偏好本身，不含任何文化结论——文化匹配完全留给溯源知识库。
 * 文案与词条来自 messages/*.json 的 interview 段。
 */
export function IntentSummary({
  intent,
  source,
  onRestart,
  onContinue,
  continuing,
}: Props) {
  const { t } = useI18n();
  const confidencePct = Math.round(intent.confidence * 100);

  const value = (category: string, token: string): string => {
    const key = `interview.values.${category}.${token}`;
    const label = t(key);
    if (label === key) return token;
    return token === "unknown" ? t("interview.values.unknown") : label;
  };

  const orDash = (category: string, token: string): string =>
    token === "unknown" ? "—" : value(category, token);

  return (
    <section className="animate-fade-in flex flex-col gap-8">
      <h2 className="font-sans text-[24px] leading-[1.2] tracking-[-0.01em] text-[var(--color-ivory)] sm:text-[28px]">
        {t("interview.summaryTitle")}
      </h2>

      <blockquote className="rounded-[0_var(--radius-md)_var(--radius-md)_0] border-l-2 border-[var(--color-silver-300)] bg-[rgba(26,26,26,0.025)] px-6 py-5">
        <p className="font-sans text-[15px] leading-[1.9] text-[var(--color-silver-200)]">
          {intent.user_context}
        </p>
        <span className="mt-3 block font-mono text-[11px] tracking-[0.16em] text-[var(--color-silver-500)] uppercase">
          {t("interview.userContextLabel")} ·{" "}
          {source === "ai"
            ? t("interview.sourceAi")
            : t("interview.sourceRule")}{" "}
          · {t("interview.confidence", { value: confidencePct })}
        </span>
      </blockquote>

      <div className="grid grid-cols-1 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[rgba(26,26,26,0.015)] sm:grid-cols-2">
        <Fact
          label={t("interview.fields.occasion")}
          display={orDash("occasion", intent.occasion)}
          dim={intent.occasion === "unknown"}
        />
        <Fact
          label={t("interview.fields.stone")}
          display={
            intent.stone_type === "unknown"
              ? "—"
              : `${value("stone", intent.stone_type)} · ${value("stoneLook", intent.stone_look)}`
          }
          dim={intent.stone_type === "unknown"}
        />
        <Fact
          label={t("interview.fields.budget")}
          display={orDash("stoneBudget", intent.stone_budget)}
          dim={intent.stone_budget === "unknown"}
        />
        <Fact
          label={t("interview.fields.form")}
          display={
            intent.seal_form === "unknown"
              ? "—"
              : `${value("sealForm", intent.seal_form)}${intent.finial_type !== "unknown" ? ` · ${value("finialType", intent.finial_type)}` : ""}`
          }
          dim={intent.seal_form === "unknown"}
        />
        <Fact
          label={t("interview.fields.decoration")}
          display={
            intent.side_inscription === "unknown" &&
            intent.decoration_level === "unknown"
              ? "—"
              : `${value("sideInscription", intent.side_inscription)} · ${value("decorationLevel", intent.decoration_level)}`
          }
          dim={
            intent.side_inscription === "unknown" &&
            intent.decoration_level === "unknown"
          }
        />
        <Fact
          label={t("interview.fields.face")}
          display={
            intent.text_type === "unknown"
              ? "—"
              : `${value("textType", intent.text_type)}${intent.text_count !== "unknown" ? ` · ${value("textCount", intent.text_count)}字向` : ""}${intent.seal_style !== "unknown" ? ` · ${value("sealStyle", intent.seal_style)}` : ""}`
          }
          dim={intent.text_type === "unknown"}
        />
      </div>

      <div className="flex items-center gap-4">
        <span className="font-mono text-[11px] tracking-[0.18em] text-[var(--color-silver-500)] uppercase">
          {t("interview.confidenceLabel")}
        </span>
        <div className="h-0.5 flex-1 overflow-hidden rounded-full bg-[rgba(26,26,26,0.08)]">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-silver-500),var(--color-silver-200))] transition-[width] duration-700"
            style={{ width: `${confidencePct}%` }}
          />
        </div>
        <span className="font-mono text-[12px] tracking-[0.1em] text-[var(--color-silver-400)]">
          {confidencePct}%
        </span>
      </div>

      <div className="flex flex-col items-start gap-5 border-t border-[var(--color-line)] pt-8">
        <button
          type="button"
          onClick={onContinue}
          disabled={continuing}
          className="group inline-flex items-center gap-3 rounded-full border border-[var(--color-line-strong)] bg-[linear-gradient(180deg,var(--color-silver-100),var(--color-silver-300))] px-8 py-4 text-[12px] font-medium tracking-[0.18em] text-[var(--color-bg)] uppercase transition-all duration-300 hover:brightness-105 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {continuing
            ? t("interview.continuing")
            : t("interview.continueToStage1")}
          <ArrowRight
            className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5"
            strokeWidth={1.5}
          />
        </button>
        <p className="max-w-md text-[12px] leading-relaxed text-[var(--color-silver-500)]">
          {t("interview.summaryNote")}
        </p>
        <button
          type="button"
          onClick={onRestart}
          className="inline-flex items-center gap-2 text-[12px] tracking-[0.16em] text-[var(--color-silver-500)] uppercase transition-colors duration-200 hover:text-[var(--color-silver-300)]"
        >
          <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.5} />
          {t("interview.restart")}
        </button>
      </div>
    </section>
  );
}
