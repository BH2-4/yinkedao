"use client";

import { useEffect, useRef } from "react";

/**
 * @google/model-viewer 的 React 薄包装。
 *
 * - web component 无官方 React 类型，这里补最小 JSX 声明（React 19 的
 *   custom element 属性直传已无兼容问题）
 * - 组件脚本操作 customElements，必须客户端注册（useEffect 内动态
 *   import），否则 Next SSR 预渲染即炸
 * - 属性一律传字符串：model-viewer 的 boolean 属性按「存在性」生效
 */

/* web component 的 JSX 类型声明没有 ES module 形态——namespace 是
   React 官方认可的补类型写法，此处豁免 no-namespace 规则。 */
declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        src?: string;
        alt?: string;
        "camera-controls"?: string;
        "auto-rotate"?: string;
        "touch-action"?: string;
        "shadow-intensity"?: string;
        "shadow-softness"?: string;
        exposure?: string;
        "environment-image"?: string;
        "camera-orbit"?: string;
        "max-camera-orbit"?: string;
        "min-camera-orbit"?: string;
      };
    }
  }
}

export interface ModelViewerProps {
  src: string;
  alt: string;
  /** glb 拉取进度 0-1（blob CDN 下载） */
  onProgress?: (ratio: number) => void;
  /** 场景渲染完成 */
  onLoad?: () => void;
  /** 加载/渲染失败 */
  onError?: (message: string) => void;
}

export function ModelViewer({ src, alt, onProgress, onLoad, onError }: ModelViewerProps) {
  const hostRef = useRef<HTMLElement | null>(null);

  /* 客户端注册 web component（幂等：包内部有 customElements.get 守卫） */
  useEffect(() => {
    void import("@google/model-viewer");
  }, []);

  /* 事件走 ref 监听（web component 的 event 不走 React 合成事件） */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const handleProgress = (e: Event) => {
      const detail = (e as CustomEvent<{ totalProgress?: number }>).detail;
      if (typeof detail?.totalProgress === "number") onProgress?.(detail.totalProgress);
    };
    const handleLoad = () => onLoad?.();
    const handleError = (e: Event) => {
      const detail = (e as CustomEvent<{ sourceError?: Error }>).detail;
      onError?.(detail?.sourceError?.message ?? "模型加载失败");
    };

    host.addEventListener("progress", handleProgress);
    host.addEventListener("load", handleLoad);
    host.addEventListener("error", handleError);
    return () => {
      host.removeEventListener("progress", handleProgress);
      host.removeEventListener("load", handleLoad);
      host.removeEventListener("error", handleError);
    };
  }, [onProgress, onLoad, onError]);

  return (
    <model-viewer
      ref={hostRef}
      src={src}
      alt={alt}
      camera-controls=""
      auto-rotate=""
      touch-action="pan-y"
      shadow-intensity="1"
      shadow-softness="0.8"
      exposure="1"
      camera-orbit="35deg 75deg auto"
      className="h-full w-full"
    />
  );
}
