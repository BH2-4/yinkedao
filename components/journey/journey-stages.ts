/**
 * JOURNEY — 三站流程的空间定义（六站漏斗 → 三站直流程）。
 *
 *   00 五维度访谈   /design-interview  石料→用途→外形→装饰→印面（含「帮我全决定」跳级）
 *   01 参数单确认   /design-brief       五维度参数单展示/回改/印文输入（URL 持久化）
 *   02 效果图       /design-render      质感层渲染（文字层由字体引擎另行叠加）
 *
 * 该常量只描述站点与路由的对应关系——不含任何业务状态，
 * 导航层（顶栏 JOURNEY 菜单、右侧 JourneyRail、首页 JourneySection）
 * 共用这一份定义，保证三处始终一致。
 */
export const JOURNEY_STAGES = [
  {
    code: "00",
    href: "/design-interview",
    nameKey: "journey.stations.s0.name",
    descKey: "journey.stations.s0.desc",
    prologue: false,
  },
  {
    code: "01",
    href: "/design-brief",
    nameKey: "journey.stations.s1.name",
    descKey: "journey.stations.s1.desc",
    prologue: false,
  },
  {
    code: "02",
    href: "/design-render",
    nameKey: "journey.stations.s2.name",
    descKey: "journey.stations.s2.desc",
    prologue: false,
  },
] as const;

export type JourneyStage = (typeof JOURNEY_STAGES)[number];

/** 当前 pathname 属于旅程中的哪一站（-1 = 不在旅程中，如首页）。 */
export function stageIndexFromPathname(pathname: string | null): number {
  if (!pathname) return -1;
  return JOURNEY_STAGES.findIndex(
    (s) => pathname === s.href || pathname.startsWith(`${s.href}/`),
  );
}
