/**
 * Server-side env accessors for the Global Demand Engine.
 *
 * All getters are safe to import from server components and route handlers.
 * They never leak the API key to the client bundle.
 */

export function getAnthropicApiKey(): string | null {
  const raw = process.env.ANTHROPIC_API_KEY?.trim();
  return raw && raw.length > 0 ? raw : null;
}

export function getAiModel(): string {
  const raw = process.env.AI_MODEL?.trim();
  return raw && raw.length > 0 ? raw : getTextAiProvider() === "bigmodel" ? "glm-4.7" : "claude-opus-4-7";
}

export function getTextAiProvider(): "bigmodel" | "anthropic" {
  const provider = process.env.TEXT_AI_PROVIDER?.trim();
  if (provider) return provider === "bigmodel" ? "bigmodel" : "anthropic";
  return process.env.BIGMODEL_API_KEY?.trim() ? "bigmodel" : "anthropic";
}

export function getTextAiKey(): string | null {
  return getTextAiProvider() === "bigmodel" ? process.env.BIGMODEL_API_KEY?.trim() || null : getAnthropicApiKey();
}

export function getAiMaxTokens(): number {
  const raw = Number(process.env.AI_MAX_TOKENS);
  // Adaptive thinking on Opus 4.7 can consume ~1000+ tokens on top of the
  // JSON body. 2400 leaves comfortable headroom without paying for slack
  // most requests will never touch.
  return Number.isFinite(raw) && raw > 0 ? raw : 2400;
}

export function getAiTimeoutMs(): number {
  const raw = Number(process.env.AI_TIMEOUT_MS);
  // Adaptive thinking on Opus 4.7 routinely spends 15–30s on structured
  // JSON tasks. 45s gives headroom without letting a stuck connection
  // hang the UI indefinitely.
  return Number.isFinite(raw) && raw > 0 ? raw : 45_000;
}

/**
 * Demo Mode is active when explicitly enabled OR when no API key is present.
 * Either way, the UI must label responses as "DEMO MODE".
 */
export function isDemoMode(): boolean {
  const flag = process.env.DEMO_MODE?.trim().toLowerCase();
  if (flag === "true" || flag === "1") return true;
  return getTextAiKey() === null;
}
