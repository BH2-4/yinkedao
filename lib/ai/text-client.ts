import Anthropic from "@anthropic-ai/sdk";
import { getAiMaxTokens, getAiModel, getAiTimeoutMs, getTextAiKey, getTextAiProvider } from "@/lib/env";

/** 智谱使用通用 API 端点，保留现有 Anthropic 兼容配置。 */
export async function generateInterviewContext(system: string, user: string): Promise<string> {
  const apiKey = getTextAiKey();
  if (!apiKey) throw new Error("文本模型尚未配置");
  if (getTextAiProvider() === "bigmodel") {
    const base = process.env.BIGMODEL_BASE_URL?.trim() || "https://open.bigmodel.cn/api/paas/v4";
    const res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
      method: "POST", signal: AbortSignal.timeout(getAiTimeoutMs()),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: getAiModel(), max_tokens: getAiMaxTokens(), messages: [{ role: "system", content: system }, { role: "user", content: user }], thinking: { type: "disabled" } }),
    });
    if (!res.ok) throw new Error(`文本模型请求失败 HTTP ${res.status}`);
    const body = await res.json() as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("文本模型未返回内容");
    return content.trim();
  }
  const client = new Anthropic({ apiKey, baseURL: process.env.ANTHROPIC_BASE_URL?.trim() || undefined, timeout: getAiTimeoutMs(), maxRetries: 0 });
  const response = await client.messages.create({ model: getAiModel(), max_tokens: getAiMaxTokens(), system, messages: [{ role: "user", content: user }] });
  return response.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
}
