"use client";

import { useI18n } from "@/components/i18n/I18nProvider";
import { useSealFace } from "./useSealFace";

interface ChongxiSealViewProps {
  text: string;
  isWhite: boolean;
  texture: boolean;
  freedom: number;
  seed: number;
}

export function ChongxiSealView({ text, isWhite, texture, freedom, seed }: ChongxiSealViewProps) {
  const { t } = useI18n();
  const { result, loading, error } = useSealFace({ text, style: isWhite ? "baiwen" : "zhuwen", texture, freedom, seed });
  return (
    <div className="seal-proof-paper">
      <div className={`seal-proof-chongxi ${loading ? "loading" : ""}`} aria-label={t("designRender.sealFaceLabel")} aria-busy={loading}>
        {result ? (
          // 自包含 SVG 无需图片优化服务。
          // eslint-disable-next-line @next/next/no-img-element
          <img src={result.svg.data_url} alt={t("designRender.sealFaceLabel")} draggable={false} />
        ) : <div className="seal-proof-chongxi-empty" aria-hidden="true" />}
      </div>
      {result && result.mapping_changes.length > 0 && (
        <p className="text-[12px] leading-relaxed text-[var(--color-silver-600)]">
          {t("designRender.sealFaceMapped", { mapping: result.mapping_changes.map((c) => `${c.from}→${c.to}`).join("、") })}
        </p>
      )}
      {result && result.missing.length > 0 && (
        <p className="text-[12px] leading-relaxed text-[#9e2b22]" role="status">
          {t("designRender.sealFaceMissing", { chars: result.missing.join("、") })}
        </p>
      )}
      {error && <p className="text-[12px] text-[#9e2b22]" role="alert">{error}</p>}
    </div>
  );
}
