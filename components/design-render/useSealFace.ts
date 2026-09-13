"use client";

import { useEffect, useState } from "react";
import type { SealFaceApiResponse } from "@/types/seal-face";
import type { SealFaceRenderOptions } from "@/lib/seal-face/render";
import { parseSealText } from "@/lib/seal-face/layout";

/** 只显示当前输入的结果；输入变化或卸载立即取消旧请求。 */
export function useSealFace(options: SealFaceRenderOptions) {
  const key = JSON.stringify(options);
  const valid = parseSealText(options.text) !== null;
  const [state, setState] = useState<{ key: string; body?: SealFaceApiResponse; error?: string } | null>(null);
  useEffect(() => {
    if (!valid) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/seal-face", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: key, signal: controller.signal,
        });
        const body = await res.json() as SealFaceApiResponse;
        if (!controller.signal.aborted) setState({ key, body });
      } catch {
        if (!controller.signal.aborted) setState({ key, error: "印文生成失败，请稍后重试。" });
      }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key, valid]);
  const current = valid && state?.key === key ? state : null;
  return {
    valid,
    loading: valid && current === null,
    result: current?.body?.success ? current.body : null,
    error: current?.error ?? (current?.body?.success === false ? current.body.error : null),
  };
}
