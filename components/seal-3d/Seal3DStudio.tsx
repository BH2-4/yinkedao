"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, RefreshCw, Download } from "lucide-react";
import type { Group } from "three";
import { decodeSealOrder, encodeSealOrder, type SealOrder } from "@/lib/design/seal-order";
import type { Seal3dApiResponse, Seal3dStatusApiResponse, Seal3dStatusResponse } from "@/types/seal-3d";
import { useSealFace } from "@/components/design-render/useSealFace";
import { VirtualStamp } from "./VirtualStamp";

const Seal3DScene = dynamic(() => import("./Seal3DScene").then((m) => m.Seal3DScene), { ssr: false });
type Model = Extract<Seal3dStatusResponse, { status: "SUCCEEDED" }>;
type Kind = "model" | "retexture";

export function Seal3DStudio() {
  const params = useSearchParams();
  const taskId = params.get("task");
  const kind = params.get("kind") === "retexture" ? "retexture" : "model";
  const rawSeed = Number(params.get("seed") ?? 1);
  const seed = Number.isInteger(rawSeed) && rawSeed >= 0 && rawSeed <= 2 ** 31 - 1 ? rawSeed : 1;
  if (!taskId) return <section className="flex flex-col gap-6"><h2 className="act-title">还没有可预览的 3D 任务</h2><Link href="/design-render" className="btn-pill btn-pill-primary self-start">去生成效果图</Link></section>;
  return <Studio key={`${kind}:${taskId}`} taskId={taskId} kind={kind} seed={seed} order={decodeSealOrder(params.toString())} />;
}

function Studio({ taskId, kind, seed, order }: { taskId: string; kind: Kind; seed: number; order: SealOrder | null }) {
  const router = useRouter();
  const [phase, setPhase] = useState<"polling" | "ready" | "error">("polling");
  const [model, setModel] = useState<Model | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [text, setText] = useState(order?.seal_text ?? "");
  const [style, setStyle] = useState<"zhuwen" | "baiwen">(order?.seal_style === "zhuwen" ? "zhuwen" : "baiwen");
  const [texture, setTexture] = useState(true);
  const [view, setView] = useState<"orbit" | "top">("orbit");
  const [exporting, setExporting] = useState(false);
  const [retexturing, setRetexturing] = useState(false);
  const retextureLock = useRef(false);
  const sceneRef = useRef<Group | null>(null);
  const [readyTexture, setReadyTexture] = useState<string | null>(null);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const face = useSealFace({ text, style, texture, freedom: 50, seed, include_textures: true });
  const faceUrl = face.result?.textures?.mirrored;
  const exportReady = !!faceUrl && readyTexture === faceUrl && !sceneError;
  const backHref = order ? `/design-render?${encodeSealOrder({ ...order, seal_text: text, seal_style: style })}` : "/design-render";

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let errors = 0;
    const deadline = Date.now() + 15 * 60_000;
    const tick = async () => {
      try {
        const res = await fetch(`/api/3d-model/${encodeURIComponent(taskId)}?kind=${kind}`, { cache: "no-store", signal: controller.signal });
        const body = await res.json() as Seal3dStatusApiResponse;
        if (controller.signal.aborted) return;
        if (!body.success) {
          if ((res.status === 429 || res.status >= 500) && errors++ < 3) { timer = setTimeout(tick, 10_000); return; }
          throw new Error(body.error);
        }
        errors = 0;
        if (body.status === "SUCCEEDED") { setModel(body); setPhase("ready"); return; }
        if (Date.now() >= deadline) throw new Error("任务仍在处理中，可稍后从当前链接继续查询。");
        setProgress(body.progress);
        timer = setTimeout(tick, Math.max(3000, Math.min(body.poll_after_ms, 15_000)));
      } catch (err) {
        if (!controller.signal.aborted) { setError(err instanceof Error ? err.message : "查询失败"); setPhase("error"); }
      }
    };
    timer = setTimeout(tick, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [taskId, kind, retry]);

  const handleScene = useCallback((scene: Group | null) => { sceneRef.current = scene; setReadyTexture(scene ? faceUrl ?? null : null); }, [faceUrl]);
  const handleSceneError = useCallback((message: string) => setSceneError(message), []);
  const exportGlb = async () => {
    if (!sceneRef.current || exporting || !exportReady) return;
    setExporting(true);
    try {
      const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
      const scene = sceneRef.current;
      scene.userData = { ...scene.userData, attribution: "崇羲篆體·中研院小學堂；王心怡・季旭昇・莊德明／中央研究院；CC BY-ND 3.0 TW", fontSource: "https://xiaoxue.iis.sinica.edu.tw/chongxi/" };
      const result = await new GLTFExporter().parseAsync(scene, { binary: true }) as ArrayBuffer;
      const url = URL.createObjectURL(new Blob([result], { type: "model/gltf-binary" }));
      const a = document.createElement("a");
      a.href = url; a.download = `seal-composed-${style}.glb`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError("模型导出失败，请重试。"); }
    finally { setExporting(false); }
  };
  const retextureModel = async () => {
    if (!order || !model || retextureLock.current) return;
    retextureLock.current = true; setRetexturing(true); setError(null);
    try {
      const res = await fetch("/api/3d-model/retexture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source_task_id: taskId, source_kind: kind, order }) });
      const body = await res.json() as Seal3dApiResponse;
      if (!body.success) throw new Error(body.error);
      router.push(`/3d-preview?task=${encodeURIComponent(body.task_id)}&kind=retexture&seed=${seed}&${encodeSealOrder({ ...order, seal_text: text, seal_style: style })}`);
    } catch (err) { setError(err instanceof Error ? err.message : "质感生成失败"); }
    finally { retextureLock.current = false; setRetexturing(false); }
  };

  return (
    <section className="flex flex-col gap-8">
      <p className="break-all border-y border-[var(--color-line)] py-4 font-mono text-xs text-[var(--color-silver-500)]">任务 · {taskId}{kind === "retexture" ? " · 石料重贴图" : ""}</p>
      {phase === "polling" && <div className="flex flex-col items-center gap-5 py-20" role="status"><RefreshCw className="h-6 w-6 animate-spin" /><h2 className="text-xl">{kind === "retexture" ? "正在细化石料质感" : "正在建立立体形态"} · {progress}%</h2><p className="act-body max-w-lg">建模通常需要 4–6 分钟。你可以稍后从当前链接继续查看。</p></div>}
      {error && <p role="alert" className="text-sm text-[#9e2b22]">{error}</p>}
      {phase === "error" && <button type="button" className="btn-pill btn-pill-secondary self-start" onClick={() => { setError(null); setPhase("polling"); setRetry((n) => n + 1); }}>重试查询当前任务</button>}
      {phase === "ready" && model && <>
        <figure className="flex flex-col gap-3">
          <div className="mx-auto aspect-square w-full max-w-[640px] overflow-hidden rounded-md border border-[var(--color-line)] bg-[#e8e6e0]">
            <Seal3DScene glbUrl={model.model_url} glbFallbackUrl={model.model_url.includes(".public.blob.vercel-storage.com/") ? `/blob-cache/${new URL(model.model_url).pathname.slice(1)}` : undefined} faceTextureUrl={faceUrl} view={view} onSceneObject={handleScene} onError={handleSceneError} />
          </div>
          <figcaption className="text-center text-xs text-[var(--color-silver-500)]">GLB · {(model.model_size / 1024 / 1024).toFixed(1)} MB · 拖动旋转，滚轮缩放</figcaption>
        </figure>
        {sceneError && <p role="alert" className="text-sm text-[#9e2b22]">{sceneError}</p>}
        <div className="flex flex-col gap-4 border-l-2 border-[var(--color-line-strong)] pl-5">
          <label htmlFor="seal-3d-text" className="text-sm">印面文字 · 1–4 字</label>
          <input id="seal-3d-text" value={text} maxLength={12} onChange={(e) => { setText(e.target.value); setSceneError(null); }} placeholder="输入你的印文" className="max-w-sm border border-[var(--color-line)] bg-transparent px-4 py-3 text-lg tracking-widest" />
          <div className="flex flex-wrap gap-3">
            {(["zhuwen", "baiwen"] as const).map((s) => <button key={s} type="button" aria-pressed={style === s} onClick={() => { setStyle(s); setSceneError(null); }} className={`btn-pill ${style === s ? "btn-pill-primary" : "btn-pill-secondary"}`}>{s === "zhuwen" ? "朱文" : "白文"}</button>)}
            {(["top", "orbit"] as const).map((v) => <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`btn-pill ${view === v ? "btn-pill-primary" : "btn-pill-secondary"}`}>{v === "top" ? "正视印面" : "全景"}</button>)}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={texture} onChange={(e) => setTexture(e.target.checked)} />印泥斑驳</label>
            <button type="button" disabled={exporting || !exportReady} onClick={() => void exportGlb()} className="btn-pill btn-pill-secondary"><Download className="h-4 w-4" />{exporting ? "导出中…" : "导出合成 GLB"}</button>
          </div>
          {face.loading && <p role="status" className="text-sm">正在排布印文…</p>}
          {!face.valid && <p className="text-sm text-[#9e2b22]">请输入 1–4 字印文；超长文字不会截断。</p>}
          {face.error && <p role="alert" className="text-sm text-[#9e2b22]">{face.error}</p>}
          {!!face.result?.missing.length && <p role="status" className="text-sm text-[#9e2b22]">字体未收录：{face.result.missing.join("、")}。请修改印文或与篆刻师确认，当前不提供合成导出。</p>}
          {!!face.result?.mapping_changes.length && <p className="text-sm">字形映射：{face.result.mapping_changes.map((m) => `${m.from}→${m.to}`).join("、")}</p>}
          <p className="text-xs text-[var(--color-silver-500)]">崇羲篆體·中研院小學堂。印面为镜像，钤印后为正字。</p>
        </div>
        {face.result?.textures && <VirtualStamp key={face.result.svg.data_url} proofUrl={face.result.svg.data_url} />}
        {order && <div className="flex flex-col items-start gap-3 border-t border-[var(--color-line)] pt-6"><button type="button" onClick={() => void retextureModel()} disabled={retexturing} className="btn-pill btn-pill-secondary">{retexturing ? "正在创建质感任务…" : "细化石料质感 · 约 10 credits"}</button><p className="text-xs text-[var(--color-silver-500)]">保留章体形状，使用 4K 贴图细化材质；同一方案优先复用已有结果。</p></div>}
        <p className="act-body text-sm">模型由照片重建，供设计参考。石料纹理和最终刻制效果以实物方案为准。</p>
      </>}
      <Link href={backHref} className="btn-pill btn-pill-secondary self-start"><ArrowLeft className="h-4 w-4" />返回效果图</Link>
    </section>
  );
}
