/**
 * /api/seal-face 响应契约（崇曦栈 · 服务端印蜕渲染）。
 *
 * 与 SealRenderApiResponse（质感层）同风格：成功携带可追溯的结构化
 * 数据（映射记录/缺字清单/字体元信息），失败走 typed error envelope。
 * 印蜕以 SVG dataUrl 返回——字形是 path 数据（非字体引用），客户端
 * 零字体依赖（路线 A：客户端永不见字体文件）。
 */

export interface SealFaceMappingChange {
  /** 用户原字 */
  from: string;
  /** 映射后字 */
  to: string;
  /** 一对多候选（供用户定夺；Phase 2 UI 落地） */
  alternatives: string[];
  /** 来自特例覆写表（true）还是 OpenCC 基线（false） */
  overridden: boolean;
}

export type SealFaceApiResponse =
  | {
      success: true;
      fontStack: "chongxi";
      svg: {
        data_url: string;
        mime: "image/svg+xml";
      };
      /** 简繁映射后的印文（实际进 cmap 的字符串） */
      mapped_text: string;
      /** 简繁映射变更记录（「刘→劉 已自动映射」提示数据源） */
      mapping_changes: SealFaceMappingChange[];
      /** 映射后 cmap 仍未命中的字——如实告知，绝不造字 */
      missing: string[];
      /** 按需生成；缺字时为空，避免导出不完整印文。 */
      textures: { front: string; mirrored: string; size: number } | null;
      /** 字体元信息（覆盖验收/诊断） */
      font: {
        num_glyphs: number;
        units_per_em: number;
        outlines_format: string;
      };
      generated_at: string;
      seed: number;
    }
  | {
      success: false;
      error: string;
      code: "invalid_input" | "font_unavailable" | "unknown";
    };
