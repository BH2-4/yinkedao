"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Sparkles } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";
import {
  DECIDED_PRESETS,
  decodeSealOrder,
  emptySealOrder,
  encodeSealOrder,
  sealOrderFromIntent,
} from "@/lib/design/seal-order";
import type { SealOrder } from "@/lib/design/seal-order";
import { readStage0Payload } from "@/lib/design-interview/handoff";

/**
 * 参数单字段组（模块级组件——避免 render 内创建组件）。
 * 取值以 chip 形式可点选回改，当前值高亮。
 */
function BriefField({
  label,
  chips,
  value,
  unknownLabel,
  onSelect,
}: {
  label: string;
  /** [token, label] 对 */
  chips: [string, string][];
  value: string;
  unknownLabel: string;
  onSelect: (token: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-l border-[var(--color-line)] p-4 first:border-l-0 sm:p-5">
      <span className="font-mono text-[11px] tracking-[0.18em] text-[var(--color-silver-500)] uppercase">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {chips.map(([token, chipLabel]) => {
          const active = value === token;
          return (
            <button
              key={token}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(token)}
              className={`rounded-[2px] border px-2.5 py-1 text-[12px] transition-all duration-300 ${
                active
                  ? "border-[rgba(245,245,247,0.38)] bg-[rgba(245,245,247,0.06)] text-[var(--color-silver-100)]"
                  : "border-[var(--color-line)] text-[var(--color-silver-500)] hover:border-[rgba(245,245,247,0.22)] hover:text-[var(--color-silver-300)]"
              }`}
            >
              {token === "unknown" ? unknownLabel : chipLabel}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 参数单确认页（三站流程第 2 站）。
 *
 * 数据来源优先级：URL query（刷新可恢复、可分享）→ sessionStorage
 * （访谈完成跳转）→ 空态三提案（「帮我全决定」/ 直达选择）。
 * 所有回改实时写回 URL（replaceState 语义，不产生历史记录）。
 */
export function BriefStudio() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();

  const fromUrl = useMemo(
    () => decodeSealOrder(searchParams.toString()),
    [searchParams],
  );

  /* 惰性初始化：URL → sessionStorage → 空参数单（无 effect 内同步 setState） */
  const [order, setOrder] = useState<SealOrder>(() => {
    if (fromUrl) return fromUrl;
    const payload =
      typeof window !== "undefined" ? readStage0Payload() : null;
    return payload ? sealOrderFromIntent(payload.intent) : emptySealOrder();
  });
  const [sealText, setSealText] = useState("");

  /* 每次变更同步 URL（router.replace 非 setState，无级联渲染） */
  useEffect(() => {
    const query = encodeSealOrder(order);
    router.replace(query ? `/design-brief?${query}` : "/design-brief", {
      scroll: false,
    });
  }, [order, router]);

  const update = useCallback((field: keyof SealOrder, value: string) => {
    setOrder((prev) => ({ ...prev, [field]: value }) as SealOrder);
  }, []);

  const isEmpty = useMemo(
    () => order.seal_form === "unknown" && order.stone_type === "unknown",
    [order],
  );

  const confirmHref = `/design-render?${encodeSealOrder(order)}`;

  const label = useCallback(
    (category: string, token: string) => {
      const key = `interview.values.${category}.${token}`;
      const hit = t(key);
      return hit === key ? token : hit;
    },
    [t],
  );

  return (
    <section className="animate-fade-in flex flex-col gap-12">
      {/* 三提案（空态 / 帮我全决定入口） */}
      {isEmpty && (
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <Sparkles className="h-4 w-4 text-[var(--color-silver-300)]" strokeWidth={1.5} />
            <h2 className="font-sans text-[20px] tracking-[0.01em] text-[var(--color-ivory)]">
              {t("designBrief.decideTitle")}
            </h2>
          </div>
          <p className="act-body max-w-xl">{t("designBrief.decideIntro")}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {DECIDED_PRESETS.map(({ key, order: preset }) => (
              <button
                key={key}
                type="button"
                onClick={() => setOrder(preset)}
                className="flex flex-col gap-3 rounded-[2px] border border-[var(--color-line)] p-5 text-left transition-all duration-500 hover:border-[rgba(245,245,247,0.28)] hover:bg-[rgba(245,245,247,0.03)]"
              >
                <span className="font-sans text-[15px] text-[var(--color-silver-100)]">
                  {t(`designBrief.presets.${key}.name`)}
                </span>
                <span className="text-[12px] leading-relaxed text-[var(--color-silver-500)]">
                  {t(`designBrief.presets.${key}.desc`)}
                </span>
                <span className="font-mono text-[11px] tracking-[0.12em] text-[var(--color-silver-600)] uppercase">
                  {t(`interview.values.stone.${preset.stone_type}`)} ·{" "}
                  {t(`interview.values.sealForm.${preset.seal_form}`)} ·{" "}
                  {t(`interview.values.sealStyle.${preset.seal_style}`)}
                </span>
              </button>
            ))}
          </div>
          <p className="text-[12px] text-[var(--color-silver-600)]">
            {t("designBrief.decideNote")}
          </p>
        </div>
      )}

      {/* 参数单 */}
      <div className="flex flex-col gap-6">
        <h2 className="font-sans text-[24px] leading-[1.2] tracking-[-0.01em] text-[var(--color-ivory)] sm:text-[28px]">
          {t("designBrief.briefTitle")}
        </h2>
        <div className="grid grid-cols-1 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[rgba(26,26,26,0.015)] sm:grid-cols-2">
          <BriefField
            label={t("interview.fields.occasion")}
            chips={[
              ["commemorate-travel", label("occasion", "commemorate-travel")],
              ["milestone", label("occasion", "milestone")],
              ["gift", label("occasion", "gift")],
              ["self-use", label("occasion", "self-use")],
              ["unknown", ""],
            ]}
            value={order.occasion}
            unknownLabel={t("interview.values.unknown")}
            onSelect={(token) => update("occasion", token)}
          />
          <BriefField
            label={t("interview.fields.stone")}
            chips={[
              ["qingtian", label("stone", "qingtian")],
              ["shoushan", label("stone", "shoushan")],
              ["changhua", label("stone", "changhua")],
              ["balin", label("stone", "balin")],
              ["laoshit", label("stone", "laoshit")],
              ["unknown", ""],
            ]}
            value={order.stone_type}
            unknownLabel={t("interview.values.unknown")}
            onSelect={(token) => update("stone_type", token)}
          />
          <BriefField
            label={t("interview.fields.stoneLook")}
            chips={[
              ["waxy", label("stoneLook", "waxy")],
              ["vitreous", label("stoneLook", "vitreous")],
              ["pearly", label("stoneLook", "pearly")],
              ["figured", label("stoneLook", "figured")],
              ["unknown", ""],
            ]}
            value={order.stone_look}
            unknownLabel={t("interview.values.unknown")}
            onSelect={(token) => update("stone_look", token)}
          />
          <BriefField
            label={t("interview.fields.form")}
            chips={[
              ["square", label("sealForm", "square")],
              ["rectangle", label("sealForm", "rectangle")],
              ["freeform", label("sealForm", "freeform")],
              ["unknown", ""],
            ]}
            value={order.seal_form}
            unknownLabel={t("interview.values.unknown")}
            onSelect={(token) => update("seal_form", token)}
          />
          <BriefField
            label={t("interview.fields.finial")}
            chips={[
              ["plain", label("finialType", "plain")],
              ["beast", label("finialType", "beast")],
              ["dragon", label("finialType", "dragon")],
              ["decorated-top", label("finialType", "decorated-top")],
              ["unknown", ""],
            ]}
            value={order.finial_type}
            unknownLabel={t("interview.values.unknown")}
            onSelect={(token) => update("finial_type", token)}
          />
          <BriefField
            label={t("interview.fields.decoration")}
            chips={[
              ["none", label("sideInscription", "none")],
              ["short", label("sideInscription", "short")],
              ["long", label("sideInscription", "long")],
              ["unknown", ""],
            ]}
            value={order.side_inscription}
            unknownLabel={t("interview.values.unknown")}
            onSelect={(token) => update("side_inscription", token)}
          />
          <BriefField
            label={t("interview.fields.decorationLevel")}
            chips={[
              ["plain", label("decorationLevel", "plain")],
              ["partial-relief", label("decorationLevel", "partial-relief")],
              ["full-carving", label("decorationLevel", "full-carving")],
              ["unknown", ""],
            ]}
            value={order.decoration_level}
            unknownLabel={t("interview.values.unknown")}
            onSelect={(token) => update("decoration_level", token)}
          />
          <BriefField
            label={t("interview.fields.face")}
            chips={[
              ["zhuwen", label("sealStyle", "zhuwen")],
              ["baiwen", label("sealStyle", "baiwen")],
              ["recommend", label("sealStyle", "recommend")],
              ["unknown", ""],
            ]}
            value={order.seal_style}
            unknownLabel={t("interview.values.unknown")}
            onSelect={(token) => update("seal_style", token)}
          />
        </div>
        <p className="text-[12px] leading-relaxed text-[var(--color-silver-600)]">
          {t("designBrief.briefNote")}
        </p>
      </div>

      {/* 印文输入（元信息——文字层由字体引擎渲染） */}
      <div className="flex flex-col gap-3 border-t border-[var(--color-line)] pt-8">
        <label
          htmlFor="seal-text"
          className="font-mono text-[11px] tracking-[0.18em] text-[var(--color-silver-500)] uppercase"
        >
          {t("designBrief.sealTextLabel")}
        </label>
        <input
          id="seal-text"
          type="text"
          value={sealText}
          maxLength={12}
          onChange={(e) => setSealText(e.target.value)}
          placeholder={t("designBrief.sealTextPlaceholder")}
          className="w-full max-w-md rounded-[2px] border border-[var(--color-line)] bg-transparent px-4 py-3 text-[15px] tracking-[0.08em] text-[var(--color-silver-100)] outline-none transition-colors duration-300 placeholder:text-[var(--color-silver-600)] focus:border-[rgba(245,245,247,0.32)]"
        />
        <p className="max-w-md text-[12px] leading-relaxed text-[var(--color-silver-600)]">
          {t("designBrief.sealTextNote")}
        </p>
      </div>

      {/* 确认 */}
      <div className="flex flex-col items-start gap-4 border-t border-[var(--color-line)] pt-8">
        <Link href={confirmHref} className="btn-pill btn-pill-primary">
          {t("designBrief.confirmCta")}
          <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
        </Link>
        <p className="text-[12px] text-[var(--color-silver-600)]">
          {t("designBrief.shareNote")}
        </p>
      </div>
    </section>
  );
}
