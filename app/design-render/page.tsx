import { RenderHeader } from "@/components/design-render/RenderHeader";
import { RenderStudio } from "@/components/design-render/RenderStudio";
/* 峄山碑篆体（woff2 unicode-range 分片，浏览器按需加载）——
   渲染式使用不修改字型；字体文件不进 public/ 可下载路径（授权合规） */
import "../fonts/seal-face/result.css";

export const dynamic = "force-dynamic";

export default function DesignRenderPage() {
  return (
    <main className="stage-space relative min-h-dvh">
      <div className="mx-auto flex min-h-dvh max-w-[1400px] flex-col gap-20 px-8 pb-24 sm:px-12 lg:px-16">
        <RenderHeader />
        <RenderStudio />
      </div>
    </main>
  );
}
