"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";
import {
  assignCells,
  generateFlecks,
  jitterForCells,
  parseSealText,
} from "@/lib/seal-face/layout";
import type { Fleck } from "@/lib/seal-face/layout";

/**
 * 小篆印蜕渲染器（文字层 · 客户端组件）。
 *
 * 渲染逻辑 ported from JackerKun/XiaoZhuan (MIT)：DOM + CSS 字体渲染
 * （峄山碑篆体 woff2 unicode-range 分片，浏览器按需加载）+ canvas
 * measureText 真实墨迹边界紧凑排布 + SVG 斑驳层。
 * 字序映射已按 PRD 05 改为传统读序（lib/seal-face/layout.ts）。
 *
 * 本组件是印蜕视图（钤印效果）：白文=红底纸字、朱文=红字纸底——
 * 不涉及印面视图的字形镜像（那是刻制视角，M6 规格另定）。
 * 缺字如实告知：按字体 unicodeRange 检查，绝不造字。
 */

const FONT_FAMILY = "峄山碑篆体";

/** 字体 unicodeRange 缺字检测（ported from JackerKun/XiaoZhuan, MIT） */
function isCharSupported(char: string): boolean {
  const code = char.codePointAt(0);
  if (code === undefined) return false;
  return [...document.fonts].some(
    (face) =>
      face.family.replace(/["']/g, "") === FONT_FAMILY &&
      face.unicodeRange
        .split(",")
        .some((range) => {
          const parts = range.trim().replace(/^U\+/i, "").split("-");
          const lo = parseInt(parts[0], 16);
          const hi = parseInt(parts[1] ?? parts[0], 16);
          return code >= lo && code <= hi;
        }),
  );
}

/** 单字形紧凑盒：measureText 真实墨迹边界 → 裁切 viewBox 的内联 SVG */
function GlyphBox({ char }: { char: string }) {
  const [box, setBox] = useState<{
    left: number;
    top: number;
    w: number;
    h: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fit = () => {
      if (cancelled) return;
      const context = document.createElement("canvas").getContext("2d");
      if (!context) return;
      context.font = `100px "${FONT_FAMILY}"`;
      const m = context.measureText(char);
      const w = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
      const h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
      if (w > 0 && h > 0) {
        setBox({
          left: m.actualBoundingBoxLeft,
          top: m.actualBoundingBoxAscent,
          w,
          h,
        });
      }
    };
    void document.fonts
      .load(`100px "${FONT_FAMILY}"`, char)
      .then(() => document.fonts.ready)
      .then(fit)
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [char]);

  if (!box) {
    return <span style={{ fontFamily: `"${FONT_FAMILY}"` }}>{char}</span>;
  }
  return (
    <svg
      viewBox={`${-box.left} ${-box.top} ${box.w} ${box.h}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ display: "block", width: "97%", height: "97%", overflow: "visible" }}
    >
      <text
        x={0}
        y={0}
        fontFamily={`"${FONT_FAMILY}"`}
        fontSize={100}
        fill="currentColor"
      >
        {char}
      </text>
    </svg>
  );
}

function WearLayer({ flecks, edges }: { flecks: Fleck[]; edges: Fleck[] }) {
  const all = [...flecks, ...edges];
  return (
    <svg
      viewBox="0 0 400 400"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="seal-proof-wear"
    >
      {all.map((f, i) => (
        <ellipse
          key={i}
          cx={f.cx}
          cy={f.cy}
          rx={f.rx}
          ry={f.ry}
          transform={`rotate(${f.rotate} ${f.cx} ${f.cy})`}
        />
      ))}
    </svg>
  );
}

interface SealFaceProofProps {
  /** 参数单携带的印文（元信息；页面可改） */
  initialText: string;
  /** 参数单朱白倾向：baiwen/zhuwen/recommend */
  initialStyle: string;
}

export function SealFaceProof({ initialText, initialStyle }: SealFaceProofProps) {
  const { t } = useI18n();
  const [text, setText] = useState(initialText);
  const [isWhite, setIsWhite] = useState(initialStyle !== "zhuwen"); // 默认白文（印蜕饱满）
  const [texture, setTexture] = useState(true);
  const [freedom, setFreedom] = useState(50);
  const [seed, setSeed] = useState(21);

  const chars = useMemo(() => parseSealText(text), [text]);
  const assignments = useMemo(
    () => assignCells(chars?.length ?? 0),
    [chars?.length],
  );
  const jitters = useMemo(
    () => jitterForCells(assignments.length, seed, freedom / 100),
    [assignments.length, seed, freedom],
  );
  const wear = useMemo(() => generateFlecks(seed), [seed]);

  /* 缺字检测（字体分片元数据到达后由 fontsReady 触发重算——useMemo 派生，无 effect 级联） */
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    document.fonts.ready.then(() => setFontsReady(true));
  }, []);
  const missing = useMemo(() => {
    if (!fontsReady || !chars) return [] as string[];
    return [...new Set(chars.filter((c) => !isCharSupported(c)))];
  }, [chars, fontsReady]);

  const shuffle = useCallback(() => setSeed((s) => s + 1), []);

  const cellContent = (position: string) => {
    const hit = assignments.find((a) => a.position === position);
    if (!hit || !chars) return null;
    return chars[hit.charIndex] ?? null;
  };

  const tooLong = text.replace(/\s/g, "").length > 4;

  return (
    <section className="animate-fade-in flex flex-col gap-8">
      {/* 刻制质感滤镜 defs（ported from JackerKun/XiaoZhuan, MIT four.html） */}
      <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
        <defs>
          <filter id="seal-carved" x="-8%" y="-8%" width="116%" height="116%">
            <feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves={3} seed={12} result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.6" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>
      <div className="flex flex-col gap-3">
        <span className="font-mono text-[11px] tracking-[0.18em] text-[var(--color-silver-500)] uppercase">
          {t("designRender.sealFaceLabel")}
        </span>
        <h3 className="act-title text-[22px]">{t("designRender.sealFaceTitle")}</h3>
        <p className="act-body max-w-xl text-[14px]">{t("designRender.sealFaceIntro")}</p>
      </div>

      {/* 印文输入 */}
      <div className="flex flex-col gap-2">
        <label
          htmlFor="seal-face-input"
          className="font-mono text-[11px] tracking-[0.16em] text-[var(--color-silver-600)] uppercase"
        >
          {t("designRender.sealFaceInputLabel")}
        </label>
        <input
          id="seal-face-input"
          type="text"
          value={text}
          maxLength={8}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("designRender.sealFaceInputPlaceholder")}
          className="w-full max-w-sm rounded-[2px] border border-[var(--color-line)] bg-transparent px-4 py-3 text-[16px] tracking-[0.2em] text-[var(--color-silver-100)] outline-none transition-colors duration-300 placeholder:text-[var(--color-silver-600)] focus:border-[rgba(245,245,247,0.32)]"
        />
        {/* 如实提示：缺字 / 超字数 —— 绝不造字、绝不静默截断 */}
        {missing.length > 0 && (
          <p className="text-[12px] leading-relaxed text-[#d08770]">
            {t("designRender.sealFaceMissing", { chars: missing.join("、") })}
          </p>
        )}
        {tooLong && (
          <p className="text-[12px] leading-relaxed text-[#d08770]">
            {t("designRender.sealFaceTooLong")}
          </p>
        )}
        {chars && chars.length > 0 && missing.length === 0 && !tooLong && (
          <p className="text-[12px] text-[var(--color-silver-600)]">
            {t("designRender.sealFaceOrderNote", { order: chars.join("→") })}
          </p>
        )}
      </div>

      {/* 印蜕展示 */}
      <div className="flex flex-wrap items-start gap-10">
        <div className="seal-proof-paper">
          <div
            className={`seal-proof ${isWhite ? "white-style" : "red-style"} ${texture ? "" : "clean"}`}
            aria-label={t("designRender.sealFaceLabel")}
          >
            <div className="seal-proof-grid">
              {(["a11", "a12", "a21", "a22"] as const).map((pos) => {
                const ch = cellContent(pos);
                const j = jitters[assignments.findIndex((a) => a.position === pos)] ?? {
                  dx: 0, dy: 0, sx: 1, sy: 1,
                };
                return (
                  <div
                    key={pos}
                    data-position={pos}
                    className="seal-proof-cell"
                    style={{
                      transform: `translate(${j.dx}%, ${j.dy}%) scale(${j.sx}, ${j.sy})`,
                    }}
                  >
                    {ch && <GlyphBox char={ch} />}
                  </div>
                );
              })}
              {/* 一字居中格 */}
              {assignments.length === 1 && assignments[0].position === "center" && (
                <div className="seal-proof-cell seal-proof-center">
                  {chars && <GlyphBox char={chars[0]} />}
                </div>
              )}
            </div>
            {texture && <WearLayer flecks={wear.flecks} edges={wear.edges} />}
          </div>
        </div>

        {/* 控制区 */}
        <div className="flex w-56 flex-col gap-4">
          <div className="flex gap-2">
            <button
              type="button"
              aria-pressed={isWhite}
              onClick={() => setIsWhite(true)}
              className={`flex-1 rounded-[2px] border px-3 py-2 text-[12px] transition-colors duration-300 ${isWhite ? "border-[var(--color-silver-300)] text-[var(--color-silver-100)]" : "border-[var(--color-line)] text-[var(--color-silver-500)]"}`}
            >
              {t("designRender.sealFaceBaiwen")}
            </button>
            <button
              type="button"
              aria-pressed={!isWhite}
              onClick={() => setIsWhite(false)}
              className={`flex-1 rounded-[2px] border px-3 py-2 text-[12px] transition-colors duration-300 ${!isWhite ? "border-[var(--color-silver-300)] text-[var(--color-silver-100)]" : "border-[var(--color-line)] text-[var(--color-silver-500)]"}`}
            >
              {t("designRender.sealFaceZhuwen")}
            </button>
          </div>
          <label className="flex flex-col gap-2 text-[12px] text-[var(--color-silver-500)]">
            {t("designRender.sealFaceFreedom")}
            <input
              type="range"
              min={0}
              max={100}
              value={freedom}
              onChange={(e) => setFreedom(Number(e.target.value))}
              className="accent-[var(--color-silver-300)]"
            />
          </label>
          <label className="flex items-center gap-2 text-[12px] text-[var(--color-silver-500)]">
            <input
              type="checkbox"
              checked={texture}
              onChange={(e) => setTexture(e.target.checked)}
            />
            {t("designRender.sealFaceTexture")}
          </label>
          <button
            type="button"
            onClick={shuffle}
            className="inline-flex items-center justify-center gap-2 rounded-[2px] border border-[var(--color-line)] px-3 py-2 text-[12px] text-[var(--color-silver-400)] transition-colors duration-300 hover:text-[var(--color-silver-200)]"
          >
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />
            {t("designRender.sealFaceShuffle")}
          </button>
          {/* 字体来源标注（授权合规：产出物标注来源） */}
          <p className="border-t border-[var(--color-line)] pt-3 text-[10px] leading-relaxed text-[var(--color-silver-600)]">
            {t("designRender.sealFaceFontCredit")}
          </p>
        </div>
      </div>
    </section>
  );
}
