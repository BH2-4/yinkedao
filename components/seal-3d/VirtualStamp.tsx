"use client";

import { useState } from "react";

/** 印面接触纸张后显出正字印蜕；下载复用同一字体渲染结果。 */
export function VirtualStamp({ proofUrl }: { proofUrl: string }) {
  const [press, setPress] = useState(0);
  const [stamped, setStamped] = useState(false);
  return (
    <section className="flex flex-col items-start gap-4 border-t border-[var(--color-line)] pt-8" aria-labelledby="virtual-stamp-title">
      <h2 id="virtual-stamp-title" className="text-xl">在纸上试钤一印</h2>
      <button type="button" className="btn-pill btn-pill-secondary" onClick={() => { setStamped(false); setPress((n) => n + 1); }}>蘸印泥 · 钤印</button>
      <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden bg-[#f7f0e2]">
        {/* 服务端生成的自包含 SVG，同 3D 印面保持读序一致。 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={proofUrl} alt="纸上的正字印蜕" className={`h-full w-full transition-opacity duration-300 ${stamped ? "opacity-100" : "opacity-0"}`} />
        {press > 0 && <div key={press} className="seal-stamping-stone absolute left-1/2 top-1/2 h-24 w-20 rounded-sm border border-[#89785d] bg-[#bbaa85] shadow-xl" onAnimationEnd={() => setStamped(true)} aria-hidden="true" />}
      </div>
      <p className="sr-only" role="status">{stamped ? "已完成钤印，纸上显示正字印蜕。" : "点击按钮试钤印。"}</p>
      {stamped && <a href={proofUrl} download="印可道-印蜕.svg" className="btn-pill btn-pill-secondary">下载印蜕 SVG</a>}
    </section>
  );
}
