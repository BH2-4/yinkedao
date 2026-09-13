"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import type { SealFaceApiResponse } from "@/types/seal-face";

/**
 * 崇曦栈印蜕视图（数据源 = /api/seal-face）。
 *
 * 双栈架构（INTEGRATION-CHONGXI.md §5.1）：SealFaceProof 按 fontStack
 * prop 分流——峄山碑栈保持客户端 DOM 渲染不动，崇曦栈走本视图：
 * 服务端取形拼 SVG（路线 A），本组件只渲染 dataUrl <img>（零字体
 * 依赖——客户端永不见字体文件）与映射/缺字如实提示。
 *
 * 控件（文本/朱白/斑驳/自由度/seed）由 SealFaceProof 统一持有，
 * 两栈共享同一控制面——「同一组件两种数据源」。
 */

interface ChongxiSealViewProps {
  /** 当前印文（原始输入，映射在服务端做） */
  text: string;
  /** 白文？ */
  isWhite: boolean;
  /** 印泥斑驳 */
  texture: boolean;
  /** 章法错落自由度 0-100 */
  freedom: number;
  /** 变体种子 */
  seed: number;
}

interface RenderState {
  dataUrl: string | null;
  missing: string[];
  /** 映射前后对照（「刘→劉 已自动映射」提示） */
  mappedNote: string | null;
  loading: boolean;
  error: string | null;
}

const IDLE: RenderState = {
  dataUrl: null,
  missing: [],
  mappedNote: null,
  loading: false,
  error: null,
};

export function ChongxiSealView({ text, isWhite, texture, freedom, seed }: ChongxiSealViewProps) {
  const { t } = useI18n();
  const [state, setState] = useState<RenderState>(IDLE);
  const abortRef = useRef<AbortController | null>(null);

  /* 印文合法性（与峄山碑栈同规则：空/超 4 字不发请求） */
  const chars = useMemo(() => Array.from(text.replace(/\s/g, "")), [text]);
  const valid = chars.length >= 1 && chars.length <= 4;

  useEffect(() => {
    /* 无效输入：不发请求（视图由 render 层按 valid 派生清空，提示文案
       由 SealFaceProof 统一展示） */
    if (!valid) return;

    /* 防抖 300ms：自由度滑杆/连续输入只发末次请求；竞态由 abort 截断 */
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setState((prev) => ({ ...prev, loading: true }));
      try {
        const res = await fetch("/api/seal-face", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            style: isWhite ? "baiwen" : "zhuwen",
            texture,
            freedom,
            seed,
          }),
          signal: controller.signal,
        });
        const body = (await res.json()) as SealFaceApiResponse;
        if (!body.success) {
          setState({
            ...IDLE,
            error: body.error,
          });
          return;
        }
        const mappedNote =
          body.mapping_changes.length > 0
            ? body.mapping_changes.map((c) => `${c.from}→${c.to}`).join("、")
            : null;
        setState({
          dataUrl: body.svg.data_url,
          missing: body.missing,
          mappedNote,
          loading: false,
          error: null,
        });
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setState({ ...IDLE, error: t("designRender.sealFaceRenderError") });
      }
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [valid, text, isWhite, texture, freedom, seed, t]);

  return (
    <div className="seal-proof-paper">
      <div
        className={`seal-proof-chongxi ${state.loading ? "loading" : ""}`}
        aria-label={t("designRender.sealFaceLabel")}
        aria-busy={state.loading}
      >
        {valid && state.dataUrl ? (
          /* dataUrl SVG 用原生 <img>：next/image 对自包含 dataUrl 无优化
             收益（无外部尺寸/无网络请求），dataUrl 场景需配 loader。 */
          // eslint-disable-next-line @next/next/no-img-element
          <img src={state.dataUrl} alt={t("designRender.sealFaceLabel")} draggable={false} />
        ) : (
          <div className="seal-proof-chongxi-empty" aria-hidden="true" />
        )}
      </div>
      {/* 如实提示层：服务端映射/缺字记录（绝不造字） */}
      {state.mappedNote && (
        <p className="text-[12px] leading-relaxed text-[var(--color-silver-600)]">
          {t("designRender.sealFaceMapped", { mapping: state.mappedNote })}
        </p>
      )}
      {state.missing.length > 0 && (
        <p className="text-[12px] leading-relaxed text-[#d08770]">
          {t("designRender.sealFaceMissing", { chars: state.missing.join("、") })}
        </p>
      )}
      {state.error && (
        <p className="text-[12px] leading-relaxed text-[#d08770]">
          {t("designRender.sealFaceRenderError")}
        </p>
      )}
    </div>
  );
}
