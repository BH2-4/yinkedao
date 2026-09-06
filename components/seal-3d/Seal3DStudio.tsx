"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, RefreshCw, Box, Download, Type } from "lucide-react";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { useI18n } from "@/components/i18n/I18nProvider";
import { decodeSealOrder, encodeSealOrder } from "@/lib/design/seal-order";
import type { Seal3dStatusApiResponse, Seal3dStatusResponse } from "@/types/seal-3d";
import { Seal3DScene } from "./Seal3DScene";

/**
 * 3D 效果图预览工作台（B 线 · 印面叠字版）。
 *
 * 数据来源：URL query ?task=<meshy_task_id>（任务由效果图结果页创建后
 * 跳转过来；刷新/分享链接均可恢复轮询——服务端无状态，Meshy 任务对象
 * 是唯一状态源）。流程：GET /api/3d-model/{task} 轮询（5s 间隔）→
 * SUCCEEDED 时后端完成 blob 转存并回传长期 URL → R3F 合成场景
 * （章石 glb + 崇羲印面贴图 plane）交互预览。
 *
 * 印面文字叠加（Phase 1 预留 TODO(seal-face-3d) 的落地实现）：
 *   Seal3DScene 在章石包围盒顶面叠崇羲贴图 plane（镜像版——从上往
 *   下看是反字，钤印方向正确）；朱文/白文即时切换；合成结果可导出
 *   glb。贴图由 scripts/seal-3d-face/make-face-textures.mjs 离线生成
 *   （opentype.js 直读崇羲 OTF，取形/排布与 A 线同源）——字体文件
 *   不进客户端，符合崇曦合规路线（CC BY-ND：只渲染不分发）。
 */

/** 印面贴图（镜像版：贴印面的是反字，钤出来才是正字） */
const FACE_TEXTURES = {
  zhuwen: "/seal-3d-face/zhuwen-mirrored.png",
  baiwen: "/seal-3d-face/baiwen-mirrored.png",
} as const;

type FaceStyle = keyof typeof FACE_TEXTURES;

/** blob 公开桶域名（本地缓存路径约定与之配对） */
const BLOB_HOST = "i5y1y4ahjeuoicd3.public.blob.vercel-storage.com";

/** glb 加载地址对：blob 主地址优先，本地缓存回退（本机网络对该域
 *  大文件传输偶发中断——预拉缓存见 scripts/seal-3d-face/fetch-blob-cache.sh；
 *  线上缓存不存在时 blob 已成功，回退路径不会被触发）。 */
function glbLoadUrls(url: string): { primary: string; fallback?: string } {
  const m = /^https:\/\/([^/]+)\/(.+)$/.exec(url);
  if (m && m[1] === BLOB_HOST) {
    return { primary: url, fallback: `/blob-cache/${m[2]}` };
  }
  return { primary: url };
}

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
  const [rendered, setRendered] = useState(false);

  /* 印面叠字状态（B 线：朱白切换 + 视角预设 + 导出） */
  const [faceStyle, setFaceStyle] = useState<FaceStyle>("zhuwen");
  const [view, setView] = useState<"orbit" | "top">("orbit");
  const [exporting, setExporting] = useState(false);
  const sceneRef = useRef<THREE.Group | null>(null);

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

  /* 场景对象就绪（含印面 plane）——引用稳定防 SealModel effect 重跑 */
  const handleSceneObject = useCallback((scene: THREE.Group) => {
    sceneRef.current = scene;
  }, []);
  const handleRendered = useCallback(() => setRendered(true), []);

  /* 导出合成 glb（章石+印面，GLTFExporter binary——spike 验证零膨胀） */
  const exportGlb = useCallback(async () => {
    const scene = sceneRef.current;
    if (!scene || exporting) return;
    setExporting(true);
    try {
      const exporter = new GLTFExporter();
      const result = (await exporter.parseAsync(scene, { binary: true })) as ArrayBuffer;
      const blob = new Blob([result], { type: "model/gltf-binary" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `seal-composed-${faceStyle}.glb`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErrorDetail(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  }, [exporting, faceStyle]);

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
      {/* 参数单摘要条（与效果图页同款——可追溯；unknown 无信息量
          不渲染，防止链接丢失 order query 时露出原始 i18n key） */}
      {order && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-[var(--color-line)] py-4 font-mono text-[12px] tracking-[0.12em] text-[var(--color-silver-400)] uppercase">
          {order.seal_form !== "unknown" && (
            <span>FORM · {t(`interview.values.sealForm.${order.seal_form}`)}</span>
          )}
          {order.stone_type !== "unknown" && (
            <span>STONE · {t(`interview.values.stone.${order.stone_type}`)}</span>
          )}
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
              {/* 印面叠字落地：章石 + 崇曦印面 plane（朱白切换重建场景树）。
                  Suspense 在 Seal3DScene 的 Canvas 内——R3F 要求边界必须在
                  Canvas 内，放外面会让 useLoader throw 时卸载重挂 Canvas */}
              <Seal3DScene
                key={faceStyle}
                glbUrl={glbLoadUrls(model.model_url).primary}
                glbFallbackUrl={glbLoadUrls(model.model_url).fallback}
                faceTextureUrl={FACE_TEXTURES[faceStyle]}
                onSceneObject={handleSceneObject}
                onRendered={handleRendered}
              />
              {!rendered && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#efede8]">
                  <Box className="h-6 w-6 animate-pulse text-[var(--color-silver-400)]" strokeWidth={1.5} />
                  <p className="font-mono text-[11px] tracking-[0.14em] text-[var(--color-silver-500)] uppercase">
                    {t("seal3d.rendering")}
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

          {/* 印面文字控制卡（朱白切换 + 导出） */}
          <div className="flex flex-col gap-4 border-l-2 border-[var(--color-line-strong)] pl-5">
            <span className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.18em] text-[var(--color-silver-500)] uppercase">
              <Type className="h-3.5 w-3.5" strokeWidth={1.5} />
              {t("seal3d.faceLabel")}
            </span>
            <div className="flex flex-wrap items-center gap-3">
              {(["top", "orbit"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`btn-pill ${view === v ? "btn-pill-primary" : "btn-pill-secondary"}`}
                  aria-pressed={view === v}
                >
                  {t(`seal3d.view_${v}`)}
                </button>
              ))}
              {(["zhuwen", "baiwen"] as const).map((style) => (
                <button
                  key={style}
                  type="button"
                  onClick={() => {
                    setRendered(false);
                    setFaceStyle(style);
                  }}
                  className={`btn-pill ${faceStyle === style ? "btn-pill-primary" : "btn-pill-secondary"}`}
                  aria-pressed={faceStyle === style}
                >
                  {t(`seal3d.face_${style}`)}
                </button>
              ))}
              <button
                type="button"
                onClick={() => void exportGlb()}
                disabled={exporting || !rendered}
                className="btn-pill btn-pill-secondary"
              >
                <Download className="h-4 w-4" strokeWidth={1.5} />
                {exporting ? t("seal3d.exporting") : t("seal3d.exportGlb")}
              </button>
            </div>
            <p className="max-w-2xl text-[13px] leading-relaxed text-[var(--color-silver-400)]">
              {t("seal3d.faceCredit")}
            </p>
          </div>

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
