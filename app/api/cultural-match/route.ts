import { NextResponse } from "next/server";
import { z } from "zod";
import { SealOrderSchema } from "@/lib/design/seal-order";
import { matchSealCulture } from "@/lib/heritage/seal-match";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const Schema = z.object({ order: SealOrderSchema });
export async function POST(request: Request) {
  if (process.env.SEAL_CULTURE_ENABLED !== "true") return NextResponse.json({ enabled: false, cards: [] });
  let payload: unknown;
  try { payload = await request.json(); }
  catch { return NextResponse.json({ error: "请求体不是合法 JSON。" }, { status: 400 }); }
  const parsed = Schema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: "参数单格式不正确。" }, { status: 400 });
  try {
    const { matches, guardrail } = matchSealCulture(parsed.data.order);
    return NextResponse.json({ enabled: true, verified: guardrail.passed, cards: matches.map((m) => ({
      id: m.id, name: m.name, description: m.cultural_evidence[0],
      source: { doc: m.why.cultural_facts[0].sourceTitle ?? "未著录来源", evidence: m.cultural_evidence[0] },
      claim_level: m.claim_level,
    })) });
  } catch { return NextResponse.json({ error: "文化资料暂不可用。" }, { status: 503 }); }
}
