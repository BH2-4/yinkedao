import type { Metadata } from "next";
import { InterviewFlow } from "@/components/design-interview/InterviewFlow";
import { isDemoMode } from "@/lib/env";

export const metadata: Metadata = {
  title: "Stage 0 · 引导式设计访谈 — 印可道",
  description:
    "几个轻问题，帮我们看清你的偏好与生活。在谈论印章之前，先聊聊你自己。",
};

/**
 * Stage 0 — Guided Design Interview 路由。
 * 只负责理解用户偏好，输出结构化 UserDesignIntent（不含任何文化结论）。
 */
export default function DesignInterviewPage() {
  return <InterviewFlow demoMode={isDemoMode()} />;
}
