/**
 * Session hand-off keys（三站流程 · V2）。
 *
 * URL 持久化为主（方案 A，PRD 12.1）：参数单序列化进 URL query，
 * /design-brief 与 /design-render 刷新可恢复、链接可分享。
 * sessionStorage 仅作跨页补充通道（如访谈补充说明等不宜进 URL 的长文本）。
 */
export const STAGE0_INTENT_STORAGE_KEY = "yinkedao:stage0-intent";

/** 访谈各维度的自由文本补充（「再多说一句」——不进 URL 的长文本）。 */
export const STAGE0_NOTES_STORAGE_KEY = "yinkedao:stage0-notes";
