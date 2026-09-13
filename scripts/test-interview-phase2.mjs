import "./lib/register-ts.cjs";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const env = require("../lib/env.ts");
const textClient = require("../lib/ai/text-client.ts");
const locale = require("../lib/i18n/server.ts");
const { emptySealOrder } = require("../lib/design/seal-order.ts");
const { matchSealCulture } = require("../lib/heritage/seal-match.ts");
const { loadMotifs } = require("../lib/heritage/repository.ts");
const { OCCASIONS, SEAL_FORMS } = require("../lib/design-interview/intent-types.ts");
let assertions = 0;
const check = (value, label) => { assertions++; assert.ok(value, label); };
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("离线测试拒绝网络访问"); };
locale.resolveLocale = async () => "zh-CN";
const { POST } = require("../app/api/design-intent/route.ts");
const ask = async (body) => {
  const response = await POST(new Request("http://localhost/api/design-intent", { method: "POST", body: JSON.stringify(body) }));
  return { status: response.status, body: await response.json() };
};
const answers = { stone_type: ["qingtian"], occasion: ["gift"], seal_form: ["square"] };

try {
  process.env.DEMO_MODE = "false";
  process.env.TEXT_AI_PROVIDER = "bigmodel";
  delete process.env.BIGMODEL_API_KEY;
  delete process.env.AI_MODEL;
  check(env.isDemoMode() && env.getAiModel() === "glm-4.7", "缺智谱 Key 自动回退，模型默认 glm-4.7");
  const rule = await ask({ answers });
  check(rule.status === 200 && rule.body.source === "rule" && rule.body.intent.stone_type === "qingtian", "正确封装答案后规则链路成功");
  check((await ask(answers)).status === 400, "裸答案对象拒绝，避免前后端协议漂移");
  check((await ask({ answers: { stone_type: ["invented-stone"] } })).status === 400, "非法选项不能污染结构化意图");
  check((await ask({ answers: { fabricated_field: ["value"] } })).status === 400, "非法字段不能进入访谈");
  process.env.BIGMODEL_API_KEY = "offline-fixture";
  check(!env.isDemoMode(), "智谱 Key 就位可进入 AI 分支");
  textClient.generateInterviewContext = async () => JSON.stringify({ user_context: "希望以青田石做一方方章赠予朋友。" });
  const ai = await ask({ answers });
  check(ai.body.source === "ai" && ai.body.intent.stone_type === "qingtian", "AI 只润色画像，保留结构化选择");
  textClient.generateInterviewContext = async () => JSON.stringify({ user_context: "龙钮象征至高无上的权力。" });
  const unsafe = await ask({ answers });
  check(unsafe.body.source === "rule" && unsafe.body.intent.user_context === rule.body.intent.user_context, "命中文化断言时回退并标注规则来源");
  textClient.generateInterviewContext = async () => "not-json";
  check((await ask({ answers })).body.source === "rule", "无效模型输出回退");
  textClient.generateInterviewContext = async () => { throw new Error("超时"); };
  check((await ask({ answers })).body.source === "rule", "模型超时不阻断访谈");
  const motifs = new Map(loadMotifs().map((m) => [m.id, m]));
  for (const occasion of OCCASIONS) {
    for (const seal_form of SEAL_FORMS) {
      const { matches, guardrail } = matchSealCulture({ ...emptySealOrder(), occasion, seal_form });
      check(matches.length === 3 && guardrail.passed, `${occasion}/${seal_form} 产出 3 条可溯源建议`);
      check(matches.every((m) => m.cultural_evidence[0] === motifs.get(m.id).description && m.why.cultural_facts[0].sourceId && m.claim_level !== "official" && m.region_info.province === null), "事实保留原文、带来源、不抬升级别或虚构地域");
    }
  }
  const { POST: culture } = require("../app/api/cultural-match/route.ts");
  const culturalRequest = () => new Request("http://localhost/api/cultural-match", { method: "POST", body: JSON.stringify({ order: { occasion: "gift" } }) });
  process.env.SEAL_CULTURE_ENABLED = "false";
  check(!(await (await culture(culturalRequest())).json()).enabled, "文化匹配灰度可关闭");
  process.env.SEAL_CULTURE_ENABLED = "true";
  const cards = await (await culture(culturalRequest())).json();
  check(cards.enabled && cards.verified && cards.cards.length === 3, "访谈文化 API 接线成功");
} finally { globalThis.fetch = originalFetch; }
console.log(`访谈与 M8：${assertions} 断言通过（离线）。`);
