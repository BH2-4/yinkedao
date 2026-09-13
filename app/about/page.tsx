import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "关于印可道 · 字体与来源" };

export default function AboutPage() {
  return (
    <main className="stage-space mx-auto flex min-h-[70dvh] max-w-3xl flex-col gap-10 px-8 pb-24">
      <div className="flex flex-col gap-5">
        <span className="stage-index">关于印可道</span>
        <h1 className="act-title">把想留下的记忆，刻成一方印。</h1>
        <p className="act-body">印可道帮助你从石料、用途、外形、装饰与印面五个维度，逐步确认一枚印章的设计。效果图与 3D 模型供设计参考，实际石料与刻制效果以匠人确认的方案为准。</p>
      </div>
      <section className="flex flex-col gap-4 border-t border-[var(--color-line)] pt-8" aria-labelledby="font-credit">
        <h2 id="font-credit" className="text-xl">崇羲篆體·中研院小學堂</h2>
        <p className="act-body">作者：王心怡、季旭昇、莊德明／中央研究院。字体采用「姓名標示—禁止改作 3.0 台灣及其後版本（CC BY-ND 3.0 TW or later）」授权。</p>
        <p className="act-body">本项目保留原始字体及许可附件；印面字形由字体引擎渲染，简体输入会显示繁体映射记录。字体未收录的字会明确提示，供你与篆刻师确认。</p>
        <div className="flex flex-wrap gap-6 text-sm underline underline-offset-4">
          <a href="https://xiaoxue.iis.sinica.edu.tw/chongxi/">字体来源</a>
          <a href="https://xiaoxue.iis.sinica.edu.tw/chongxi/copyright.htm">原始授权说明</a>
          <a href="https://creativecommons.org/licenses/by-nd/3.0/tw/">许可条款</a>
        </div>
      </section>
      <section className="flex flex-col gap-4 border-t border-[var(--color-line)] pt-8">
        <h2 className="text-xl">设计资料与应急字体</h2>
        <p className="act-body">文化参考来自 SealCulture-v1 收录的资料，事实附有来源，设计建议供你选择。应急印蜕使用峄山碑篆体（字传 · 免费商用授权），排版算法参考 XiaoZhuan 项目（MIT）。</p>
      </section>
      <Link href="/design-interview" className="btn-pill btn-pill-primary self-start">开始设计一方印</Link>
    </main>
  );
}
