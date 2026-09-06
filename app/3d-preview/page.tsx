import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Seal3DStudio } from "@/components/seal-3d/Seal3DStudio";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";

/**
 * 3D 效果图预览页（展厅 05b · B 线 Phase 1）。
 *
 * 从效果图结果页（05 Render）的「生成 3D 效果图」入口跳入，携带
 * ?task=<meshy_task_id>。页面壳是 server component（i18n 文案服务端取），
 * 轮询与 model-viewer 在 Seal3DStudio（client）。
 */

export const dynamic = "force-dynamic";

export default function Seal3dPreviewPage() {
  const t = getDictionary(DEFAULT_LOCALE);

  return (
    <main className="stage-space relative min-h-dvh">
      <div className="mx-auto flex min-h-dvh max-w-[1400px] flex-col gap-20 px-8 pb-24 sm:px-12 lg:px-16">
        <header className="relative flex flex-col gap-10 py-16 sm:py-24">
          <span aria-hidden className="stage-numeral">
            05
          </span>
          <div className="hairline" aria-hidden />
          <div className="relative z-10 flex flex-col gap-9 pt-2">
            <Link
              href="/design-render"
              className="inline-flex items-center gap-2 text-[12px] tracking-[0.16em] text-[var(--color-silver-500)] uppercase transition-colors hover:text-[var(--color-silver-200)]"
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
              {t.seal3d.backToRenderNav}
            </Link>
            <span className="stage-index">05b / 3D</span>
            <div className="max-w-3xl animate-fade-in">
              <h1 className="act-title">{t.seal3d.headerTitle}</h1>
              <p className="act-body mt-7 max-w-xl">{t.seal3d.headerSubtitle}</p>
            </div>
          </div>
        </header>
        <Seal3DStudio />
      </div>
    </main>
  );
}
