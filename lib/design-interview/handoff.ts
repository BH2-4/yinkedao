import {
  type UserDesignIntent,
  containsCulturalClaims,
} from "./intent-types";
import { type InterviewLabels, buildRuleUserContext } from "./engine";
import { STAGE0_INTENT_STORAGE_KEY } from "@/lib/constants/storage";

/**
 * Stage 0 → 后续阶段 handoff（篆刻域过渡版）。
 *
 * 五维度 UserDesignIntent 的传递通道：sessionStorage（读取时即消费，
 * 保证预填只发生一次）。URL 持久化（参数单序列化）在结构改造批接入，
 * sessionStorage 保留作补充。
 *
 * 护栏：intent.user_context 若命中虚构断言（编造石料参数/篆字形/
 * 象征意义/价格），回退到规则模板，保证进入下游的文本永远不含
 * 未经溯源的内容。
 */

export type Stage0IntentPayload = {
  intent: UserDesignIntent;
  /** 下游预填消息（= user_context，经护栏清洗） */
  message: string;
  createdAt: string;
};

/**
 * 生成进入下游的 payload（含护栏清洗）。
 * user_context 命中虚构断言 → 回退规则模板（经 L 本地化），仅描述用户偏好。
 */
export function buildStage0Payload(
  intent: UserDesignIntent,
  L: InterviewLabels,
): Stage0IntentPayload {
  const safeIntent: UserDesignIntent = containsCulturalClaims(
    intent.user_context,
  )
    ? { ...intent, user_context: buildRuleUserContext(intent, L) }
    : intent;

  return {
    intent: safeIntent,
    message: safeIntent.user_context,
    createdAt: new Date().toISOString(),
  };
}

/** 写入 sessionStorage（失败静默，如隐私模式） */
export function persistStage0Payload(payload: Stage0IntentPayload): void {
  try {
    sessionStorage.setItem(
      STAGE0_INTENT_STORAGE_KEY,
      JSON.stringify(payload),
    );
  } catch {
    // storage 不可用时访谈摘要仍保留在 Stage 0 页面，用户可手动继续
  }
}

/** 读取（并消费）Stage 0 payload；缺失 / 损坏返回 null。 */
export function readStage0Payload(): Stage0IntentPayload | null {
  try {
    const raw = sessionStorage.getItem(STAGE0_INTENT_STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(STAGE0_INTENT_STORAGE_KEY);
    const parsed = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.message !== "string"
    ) {
      return null;
    }
    return parsed as Stage0IntentPayload;
  } catch {
    return null;
  }
}
