import { ProxyAgent, fetch as undiciFetch } from "undici";

/**
 * 出站 fetch 传输层（env 驱动，dev 调试用）。
 *
 * 背景：本地网络对 meshy.ai 直连 DNS 污染，且 node 内建 fetch 的
 * NODE_USE_ENV_PROXY 路径实测 ECONNRESET（undici 代理 CONNECT 与
 * 本机代理的 TLS 握手不兼容）。Vercel 服务端无此问题——直连即通。
 *
 * 因此代理只作为可选分支：设了 OUTBOUND_PROXY_URL（本地 .env.local）
 * 就走 undici ProxyAgent；不设（线上）走全局 fetch，零行为差异。
 */

let cachedAgent: ProxyAgent | null | undefined;

function getAgent(): ProxyAgent | null {
  if (cachedAgent !== undefined) return cachedAgent;
  const proxyUrl = process.env.OUTBOUND_PROXY_URL?.trim();
  cachedAgent = proxyUrl ? new ProxyAgent(proxyUrl) : null;
  return cachedAgent;
}

/** 对外站（Meshy API/CDN）的 fetch：按 env 决定是否经代理。 */
export async function outboundFetch(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal } = {},
): Promise<Response> {
  const agent = getAgent();
  if (!agent) {
    return fetch(url, init as RequestInit);
  }
  /* undici 的 RequestInit/Response 与 DOM 类型结构兼容，仅类型声明不同 */
  return (undiciFetch(url, { ...init, dispatcher: agent }) as unknown) as Promise<Response>;
}
