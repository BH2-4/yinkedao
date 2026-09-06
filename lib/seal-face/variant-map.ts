/**
 * 崇曦栈简繁前置映射层（INTEGRATION-CHONGXI.md §3）。
 *
 * 根因：崇曦字形挂在《说文》字头（繁体体系），用户输入简体（「刘雨茜」）
 * 需映射繁体（「劉雨茜」）才能命中 cmap——映射是 chongxi 栈的**必选
 * 前置**，不是可选增强（预跑实证：寿/万/无/灵/龟/凤/变/体 简体直查
 * cmap 全未命中，繁体全命中）。
 *
 * 两层结构：
 *   ① 基线：OpenCC s2t（cn→t，不做台湾地区词汇替换）——逐字转换，
 *      一对多默认取词典首选；
 *   ② 特例覆写表：印文场景差异（异体偏好/姓名用字/一对多候选），
 *      **空表起步**——每条覆写必须给《说文》/名家印谱依据，文化评审
 *      后增量（PRD 14「映射规则需文化评审」，本模块即评审单元）。
 *
 * 已知基线行为（留评审记录，不是 bug）：OpenCC cn→t 自带异体倾向
 * （峰→峯、群→羣、历→歷、钟→鍾）——恰合《说文》正统偏好，但是否
 * 符合印文惯例由评审人定夺后写进覆写表。
 */

import * as OpenCC from "opencc-js/cn2t";

/* ─── 基线转换器（模块级单例；词典加载一次） ──────────────────── */

const convertBaseline = OpenCC.Converter({ from: "cn", to: "t" });

/* ─── 特例覆写表（空表起步 · 文化评审单元） ───────────────────── */

export interface VariantOverride {
  /** 覆写目标字 */
  to: string;
  /** 依据（《说文》正篆 / 名家印谱用例）——评审必填，宁缺毋滥 */
  reason: string;
  /** 一对多候选（如 发→發/髮），供 UI 提示用户定夺 */
  alternatives?: string[];
}

/**
 * 覆写表：原字 → 覆写。空表 = 纯 OpenCC 基线。
 * 增量规则：一条一据，无据不入（对齐 cultural-match 的 source-first 纪律）。
 */
const OVERRIDES: Record<string, VariantOverride> = {};

/* ─── 对外契约 ──────────────────────────────────────────────── */

/** 单字映射记录（UI 展示「映射前后对照」的数据源） */
export interface VariantChange {
  /** 用户原字 */
  from: string;
  /** 映射后字（实际进 cmap 查询的字） */
  to: string;
  /** 一对多候选（含已选；用户可换选——Phase 2 UI 落地） */
  alternatives: string[];
  /** 本条来自特例覆写表（true）还是 OpenCC 基线（false） */
  overridden: boolean;
}

export interface VariantMapResult {
  /** 映射后的印文（进 cmap 查询） */
  mapped: string;
  /** 逐字变更记录（未变的字不记；供「刘→劉 已自动映射」提示） */
  changes: VariantChange[];
}

/** 非汉字（数字/字母/符号等）原样透传，不进 OpenCC。 */
function isHan(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  // CJK 统一表意 + 扩展 A + 兼容表意
  return (
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0xf900 && code <= 0xfaff)
  );
}

/**
 * 崇曦栈简繁前置映射（纯函数，客户端/服务端通用）。
 *
 * 逐字处理：覆写表优先，未命中走 OpenCC 基线；非汉字透传。
 * 逐字（非整段）是有意为之——印文 1-4 字无上下文，词组级消歧
 * 不可靠（方案文档 §3.1：默认取首选并提示候选，由用户定夺）。
 */
export function mapForChongxi(text: string): VariantMapResult {
  const chars = Array.from(text);
  const changes: VariantChange[] = [];
  const mapped = chars.map((char) => {
    const override = OVERRIDES[char];
    if (override) {
      if (override.to !== char) {
        changes.push({
          from: char,
          to: override.to,
          alternatives: override.alternatives ?? [override.to],
          overridden: true,
        });
      }
      return override.to;
    }
    if (!isHan(char)) return char;
    const to = convertBaseline(char);
    if (to !== char) {
      changes.push({
        from: char,
        to,
        alternatives: [to],
        overridden: false,
      });
    }
    return to;
  });
  return { mapped: mapped.join(""), changes };
}
