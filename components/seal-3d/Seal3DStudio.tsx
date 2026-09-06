"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, RefreshCw, Box } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { decodeSealOrder, encodeSealOrder } from "@/lib/design/seal-order";
import type { Seal3dStatusApiResponse, Seal3dStatusResponse } from "@/types/seal-3d";
import { ModelViewer } from "./ModelViewer";

/**
 * 3D 效果图预览工作台（B 线 Phase 1）。
 *
 * 数据来源：URL query ?task=<meshy_task_id>（任务由效果图结果页创建后
 * 跳转过来；刷新/分享链接均可恢复轮询——服务端无状态，Meshy 任务对象
 * 是唯一状态源）。流程：GET /api/3d-model/{task} 轮询（5s 间隔）→
 * SUCCEEDED 时后端完成 blob 转存并回传长期 URL → model-viewer 交互。
 *
 * 印面文字叠加（Phase 2 接口预留，本页不实现）：
 *   TODO(seal-face-3d): SUCCEEDED 后在 model-viewer 场景之上叠加崇羲
 *   字体引擎产出的印面贴图（plane 贴印面法向），接口形态为在 ready
 *   分支注入 overlayProps（texture URL + 印面定位参数），由字体引擎
 *   agent 的链路供给——两线合流点，避免与本 Phase 撞车。
 */

type Phase = "polling" | "ready" | "error";

export function Seal3DStudio() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const taskId = searchParams.get("task");

  const order = useMemo(
    () => decodeSealOrder(searchParams.toString()),
    [searchParams],
  );
  const seed = searchParams.get("seed") ?? "1";

  const [phase, setPhase] = useState<Phase>("polling");
  const [progress, setProgress] = useState(0);
  const [model, setModel] = useState<
    Extract<Seal3dStatusResponse, { status: "SUCCEEDED" }> | null
  >(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  /* glb 拉取进度（blob CDN 下载，与建模进度是两段不同的进度） */
  const [loadRatio, setLoadRatio] = useState<number | null>(null);
  const [rendered, setRendered] = useState(false);

  const cancelledRef = useRef(false);

  const poll = useCallback(async () => {
    if (!taskId) return;
    cancelledRef.current = false;

    const tick = async () => {
      if (cancelledRef.current) return;
      try {
        const res = await fetch(`/api/3d-model/${encodeURIComponent(taskId)}`, {
          cache: "no-store",
        });
        const body = (await res.json()) as Seal3dStatusApiResponse;
        if (!body.success) throw new Error(`${body.error} [${body.code}]`);

        if (body.status === "SUCCEEDED") {
          setModel(body);
          setProgress(100);
          setPhase("ready");
          return;
        }
        setProgress(body.progress);
        if (!cancelledRef.current) {
          setTimeout(tick, body.poll_after_ms);
        }
      } catch (err) {
        if (cancelledRef.current) return;
        setErrorDetail(err instanceof Error ? err.message : String(err));
        setPhase("error");
      }
    };
    void tick();
  }, [taskId]);

  useEffect(() => {
    void poll();
    return () => {
      cancelledRef.current = true;
    };
  }, [poll]);

  if (!taskId) {
    return (
      <section className="animate-fade-in flex flex-col items-start gap-6 border-t border-[var(--color-line)] pt-16">
        <span className="stage-index">{t("seal3d.emptyLabel")}</span>
        <h2 className="act-title max-w-xl">{t("seal3d.emptyTitle")}</h2>
        <p className="act-body max-w-lg">{t("seal3d.emptyBody")}</p>
        <Link href="/design-render" className="btn-pill btn-pill-primary">
          {t("seal3d.emptyCta")}
        </Link>
      </section>
    );
  }

  const orderQuery = order ? encodeSealOrder(order) : "";
  const backHref = orderQuery
    ? `/design-render?${orderQuery}`
    : "/design-render";

  return (
    <section className="animate-fade-in flex flex-col gap-12">
      {/* 参数单摘要条（与效果图页同款——可追溯） */}
      {order && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-[var(--color-line)] py-4 font-mono text-[12px] tracking-[0.12em] text-[var(--color-silver-400)] uppercase">
          <span>FORM · {t(`interview.values.sealForm.${order.seal_form}`)}</span>
          <span>STONE · {t(`interview.values.stone.${order.stone_type}`)}</span>
          <span>SEED · {seed}</span>
          <span>TASK · {taskId.slice(0, 13)}</span>
        </div>
      )}

      {phase === "polling" && (
        <div className="flex flex-col items-center justify-center gap-6 py-24">
          <div
            className="h-7 w-7 animate-spin rounded-full border border-[rgba(26,26,26,0.12)] border-t-[var(--color-silver-300)]"
            role="status"
            aria-label={t("seal3d.pollingTitle")}
          />
          <p className="font-sans text-[15px] tracking-[0.06em] text-[var(--color-silver-400)]">
            {t("seal3d.pollingTitle")}
            {progress > 0 ? ` · ${progress}%` : ""}
          </p>
          <p className="max-w-md text-[12px] leading-relaxed text-[var(--color-silver-600)]">
            {t("seal3d.pollingNote")}
          </p>
          <p className="font-mono text-[11px] tracking-[0.14em] text-[var(--color-silver-500)] uppercase">
            {t("seal3d.taskLabel")} · {taskId}
          </p>
        </div>
      )}

      {phase === "error" && (
        <div className="flex flex-col items-start gap-5 border-t border-[var(--color-line)] pt-10">
          <h3 className="act-title text-[22px]">{t("seal3d.errorTitle")}</h3>
          <p className="act-body max-w-lg">{t("seal3d.errorBody")}</p>
          {errorDetail && (
            <p className="max-w-lg font-mono text-[11px] leading-relaxed break-all text-[var(--color-silver-500)]">
              {errorDetail}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-4">
            {/* 网络抖动/查询失败：同任务重试（Meshy 任务可能仍在跑） */}
            <button
              type="button"
              onClick={() => {
                setPhase("polling");
                setErrorDetail(null);
                void poll();
              }}
              className="btn-pill btn-pill-secondary"
            >
              <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
              {t("seal3d.retryPoll")}
            </button>
            {/* 任务级失败：额度已退还，回效果图页重新发起建模 */}
            <Link href={backHref} className="btn-pill btn-pill-secondary">
              <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
              {t("seal3d.backToRender")}
            </Link>
          </div>
        </div>
      )}

      {phase === "ready" && model && (
        <div className="flex flex-col gap-8">
          <figure className="flex flex-col gap-4">
            <div className="relative mx-auto aspect-square w-full max-w-[640px] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[#e8e6e0]">
              {/* TODO(seal-face-3d): Phase 2 印面文字叠加挂载点——在
                  model-viewer 场景内叠印面 plane（见组件头注释） */}
              <ModelViewer
                src={model.model_url}
                alt={t("seal3d.viewerAlt")}
                onProgress={setLoadRatio}
                onLoad={() => setRendered(true)}
                onError={(m) => setErrorDetail(m)}
              />
              {!rendered && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#efede8]">
                  <Box className="h-6 w-6 animate-pulse text-[var(--color-silver-400)]" strokeWidth={1.5} />
                  <p className="font-mono text-[11px] tracking-[0.14em] text-[var(--color-silver-500)] uppercase">
                    {loadRatio !== null && loadRatio < 1
                      ? `${Math.round(loadRatio * 100)}%`
                      : t("seal3d.rendering")}
                  </p>
                </div>
              )}
            </div>
            <figcaption className="flex flex-wrap items-center justify-between gap-3 font-mono text-[11px] tracking-[0.14em] text-[var(--color-silver-500)] uppercase">
              <span>{t("seal3d.sizeNote", {
                size: (model.model_size / 1024 / 1024).toFixed(1),
              })}</span>
              <span>{t("seal3d.dragHint")}</span>
            </figcaption>
          </figure>

          {/* AI 声明（反冒充红线——与效果图页同款语义） */}
          <div className="flex flex-col gap-2 border-l-2 border-[var(--color-line-strong)] pl-5">
            <span className="font-mono text-[11px] tracking-[0.18em] text-[var(--color-silver-500)] uppercase">
              {t("seal3d.aiNoticeLabel")}
            </span>
            <p className="max-w-2xl text-[13px] leading-relaxed text-[var(--color-silver-300)]">
              {t("seal3d.aiNoticeBody")}
            </p>
            <p className="max-w-2xl text-[13px] leading-relaxed text-[var(--color-silver-400)]">
              {t("seal3d.aiNoticeBody2")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 border-t border-[var(--color-line)] pt-8">
            <Link href={backHref} className="btn-pill btn-pill-secondary">
              <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
              {t("seal3d.backToRender")}
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
