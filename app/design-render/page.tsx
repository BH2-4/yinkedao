import { RenderHeader } from "@/components/design-render/RenderHeader";
import { RenderStudio } from "@/components/design-render/RenderStudio";
import { resolveSealFontStack } from "@/lib/seal-face/font-stack";
/* 峄山碑篆体（woff2 unicode-range 分片，浏览器按需加载）——
   渲染式使用不修改字型；字体文件不进 public/ 可下载路径（授权合规）。
   崇曦栈（服务端渲染）不需要这些分片，但 yishan 回退链要求常备。 */
import "../fonts/seal-face/result.css";

export const dynamic = "force-dynamic";

export default function DesignRenderPage() {
  /* FONT_STACK 双栈（server 侧解析一次，含回退链）：
     chongxi 资产缺失时自动回落 yishan——demo 永不断 */
  const { stack } = resolveSealFontStack();
  return (
    <main className="stage-space relative min-h-dvh">
      <div className="mx-auto flex min-h-dvh max-w-[1400px] flex-col gap-20 px-8 pb-24 sm:px-12 lg:px-16">
        <RenderHeader />
        <RenderStudio sealFontStack={stack} />
      </div>
    </main>
  );
}
