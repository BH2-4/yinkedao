/* Stage 0 冒烟测试：页面渲染 + API 规则合成 + 护栏（五维度篆刻域） */
const BASE = "http://localhost:3000";

async function main() {
  // 1. 页面渲染
  const page = await fetch(`${BASE}/design-interview`);
  const html = await page.text();
  console.log("[page] status:", page.status);
  console.log("[page] header copy:", html.includes("为什么而刻"));
  console.log("[page] stage label:", html.includes("Guided"));

  // 2. API：完整答案（五维度全答路径）
  const r1 = await fetch(`${BASE}/api/design-intent`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      answers: {
        stone_type: ["laoshit"],
        stone_look: ["waxy"],
        stone_budget: ["daily"],
        occasion: ["commemorate-travel"],
        seal_form: ["square"],
        finial_type: ["plain"],
        side_inscription: ["short"],
        decoration_level: ["plain"],
        text_type: ["commemorative"],
        text_count: ["four"],
        seal_style: ["baiwen"],
      },
    }),
  });
  const b1 = await r1.json();
  console.log("\n[api:full] status:", r1.status, "source:", b1.source);
  console.log("  intent:", JSON.stringify(b1.intent, null, 2));

  // 3. API：探索路径（石料 unsure + 随形章 → 跳过钮制 → unknown）
  const r2 = await fetch(`${BASE}/api/design-intent`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      answers: {
        stone_type: ["unsure"],
        stone_budget: ["entry"],
        occasion: ["self-use"],
        seal_form: ["freeform"],
        side_inscription: ["none"],
        decoration_level: ["partial-relief"],
        text_type: ["studio"],
        text_count: ["two"],
        seal_style: ["zhuwen"],
      },
    }),
  });
  const b2 = await r2.json();
  console.log("\n[api:explore] status:", r2.status, "source:", b2.source);
  console.log("  stone_type:", b2.intent?.stone_type, "(unsure 应合成 unknown)");
  console.log("  finial_type:", b2.intent?.finial_type, "(随形章未问钮制应为 unknown)");

  // 4. API：图案印（text_type=pictorial → text_count/seal_style 应缺省）
  const r4 = await fetch(`${BASE}/api/design-intent`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      answers: {
        stone_type: ["shoushan"],
        stone_look: ["pearly"],
        occasion: ["gift"],
        seal_form: ["square"],
        finial_type: ["beast"],
        side_inscription: ["short"],
        decoration_level: ["plain"],
        text_type: ["pictorial"],
      },
    }),
  });
  const b4 = await r4.json();
  console.log("\n[api:pictorial] status:", r4.status);
  console.log("  text_count:", b4.intent?.text_count, "(图案印未问字数应为 unknown)");
  console.log("  seal_style:", b4.intent?.seal_style, "(图案印未问朱白应为 unknown)");

  // 5. API：全跳过（置信度最低 + fallback 文案）
  const r3 = await fetch(`${BASE}/api/design-intent`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ answers: { stone_type: null, occasion: null } }),
  });
  const b3 = await r3.json();
  console.log("\n[api:skipped] status:", r3.status);
  console.log("  confidence:", b3.intent?.confidence, "(全跳过应为低置信)");
  console.log("  user_context:", b3.intent?.user_context);
}

main().catch((err) => {
  console.error("smoke-stage0 failed:", err);
  process.exit(1);
});
