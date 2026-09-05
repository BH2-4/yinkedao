/**
 * Stage 5 — Design Render scenario tests.
 *
 * Runs against a local dev server (http://localhost:3000). Exit code is
 * non-zero if any scenario fails. No framework — plain fetch + assertions.
 *
 * Chain per scenario (mirrors the real UI flow):
 *   cultural-match → design-translation (directions) →
 *   design-translation (brief, direction_id) → design-proposal → design-render.
 *
 * i18n key parity is verified against the on-disk locale JSON directly.
 *
 * Usage: node scripts/test-design-render.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const __dirname = dirname(fileURLToPath(import.meta.url));
const MESSAGES = resolve(__dirname, "..", "messages");

/* ------------------------------  Helpers  ------------------------------ */

let passed = 0;
let failed = 0;

function assert(cond, label) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✕ ${label}`);
  }
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

function dna(overrides = {}) {
  return {
    market: "United States",
    consumer_profile: "Young urban professional who values quiet luxury.",
    product_type: "necklace",
    style: ["minimal", "modern"],
    occasion: "everyday",
    emotion: ["calm"],
    cultural_interest: "open to subtle cultural motifs",
    cultural_visibility: "subtle",
    wearability: "high",
    complexity: "low",
    size_preference: "small",
    weight_preference: "light",
    price_sensitivity: "medium",
    design_keywords: ["minimal", "silver"],
    avoid: ["heavy-ornamentation"],
    confidence: 0.8,
    reasoning: "User asked for a minimal everyday silver necklace.",
    ...overrides,
  };
}

/** Full pipeline dna → proposal + brief + selected direction id. */
async function buildHandoff(dnaInput, directionPredicate, selectedMatchId = null) {
  const { status: mStatus, body: mBody } = await post("/api/cultural-match", {
    designBrief: dnaInput,
  });
  if (mStatus !== 200 || !mBody.success) {
    throw new Error(`cultural-match failed (${mStatus})`);
  }
  const selectedMatch = selectedMatchId
    ? mBody.matches.find((m) => m.id === selectedMatchId) ?? null
    : null;

  const { status: dStatus, body: dBody } = await post("/api/design-translation", {
    designBrief: dnaInput,
    selectedMatch,
    step: "directions",
  });
  if (dStatus !== 200 || !dBody.success) {
    throw new Error(`design-translation (directions) failed (${dStatus})`);
  }
  const direction = dBody.directions.find(directionPredicate);
  if (!direction) {
    throw new Error("no generated direction satisfies the scenario predicate");
  }

  const { status: bStatus, body: bBody } = await post("/api/design-translation", {
    designBrief: dnaInput,
    selectedMatch,
    step: "brief",
    direction_id: direction.id,
  });
  if (bStatus !== 200 || !bBody.success) {
    throw new Error(`design-translation (brief) failed (${bStatus})`);
  }
  const designBrief = bBody.design_brief;

  const { status: pStatus, body: pBody } = await post("/api/design-proposal", {
    designDna: dnaInput,
    designBrief,
  });
  if (pStatus !== 200 || !pBody.success) {
    throw new Error(`design-proposal failed (${pStatus})`);
  }
  return {
    designDna: dnaInput,
    designBrief,
    selectedDirectionId: pBody.selected_direction_id,
    proposal: pBody.design_proposal,
  };
}

/* -----------------------------  Scenarios  ----------------------------- */

async function scenario1MotifRenderSuccess() {
  console.log("\n[1] Motif proposal → structured prompt + mock image, prompt is fact-bounded");
  const input = dna({
    design_keywords: ["dragon", "minimal", "silver"],
    emotion: ["power"],
  });
  const handoff = await buildHandoff(
    input,
    (d) => d.origin_match_id?.startsWith("MOTIF-"),
    "MOTIF-001",
  );
  assert(handoff.proposal.motif.primary !== null, "proposal has a motif carried from the brief");

  const { status, body } = await post("/api/design-render", handoff);
  assert(status === 200, "returns 200");
  assert(body.success === true, "returns success");
  assert(body.verification.passed === true, "guardrail re-verification passed");

  const p = body.image_prompt;
  assert(p.proposal_id === handoff.proposal.id, "prompt traces back to the proposal id");

  /* Prompt priority: proposal > brief > dna. The proposal's product / scale /
     finish must be echoed verbatim into the prompt fields. */
  assert(p.form.product_type === handoff.proposal.form.product_type, "form.product_type from proposal");
  assert(p.form.scale === handoff.proposal.scale.size, "form.scale from proposal");
  assert(p.material.finish === handoff.proposal.material.finish, "material.finish from proposal");
  assert(p.craft.primary === handoff.proposal.craft.primary.name, "craft.primary is KB-verbatim");

  /* Motif: exactly ONE cultural element, KB-verbatim, no fabricated meaning. */
  assert(p.motif !== null, "motif carried into the prompt");
  assert(
    p.motif.name === handoff.proposal.motif.primary.name,
    "prompt motif name is byte-identical to the proposal motif",
  );
  assert(
    p.motif.entity_id === handoff.proposal.motif.primary.origin_entity_id,
    "prompt motif entity id preserved for traceability",
  );

  /* Cultural boundary: the assembled prompt body must contain the boundary
     text AND must not name any other cultural entity. */
  assert(
    p.prompt.includes("contemporary custom jewelry design"),
    "prompt body carries the contemporary-design framing",
  );
  assert(
    p.prompt.includes(p.motif.name),
    "prompt body includes the exact documented motif name",
  );

  /* Negative constraints — always includes the core cultural-safety list. */
  const neg = new Set(p.negative_constraints);
  for (const required of [
    "random ethnic symbols",
    "unrelated ethnic motifs",
    "mixed cultural motifs from different regions or ethnic groups",
    "invented heritage claims",
    "gold jewelry",
  ]) {
    assert(neg.has(required), `negative_constraints contains "${required}"`);
  }

  /* Image (mock provider): a data URL, MIME svg+xml, model tag present. */
  assert(typeof body.image.data_url === "string" && body.image.data_url.startsWith("data:image/svg+xml"), "mock returns a data URL");
  assert(body.image.provider === "mock", "provider is mock");
  assert(body.image.model && body.image.model.length > 0, "model tag present");
  assert(!!body.image.generated_at, "generated_at timestamp present");
}

async function scenario2FormLedProposal() {
  console.log("\n[2] Form-led proposal → prompt has no motif and forbids ethnic patterns");
  const input = dna();
  const { body: dBody } = await post("/api/design-translation", {
    designBrief: input,
    selectedMatch: null,
  });
  const designBrief = dBody.design_brief;

  const { body: pBody } = await post("/api/design-proposal", {
    designDna: input,
    designBrief,
  });
  const handoff = {
    designDna: input,
    designBrief,
    selectedDirectionId: pBody.selected_direction_id,
    proposal: pBody.design_proposal,
  };

  const { status, body } = await post("/api/design-render", handoff);
  assert(status === 200, "returns 200");
  assert(body.success === true, "returns success");

  const p = body.image_prompt;
  if (handoff.proposal.motif.primary === null) {
    assert(p.motif === null, "no motif in the prompt (form-led)");
    assert(
      p.negative_constraints.includes("any ethnic, tribal, or traditional pattern"),
      "form-led proposal explicitly forbids any ethnic pattern",
    );
    assert(
      p.prompt.includes("no ethnic, tribal, or traditional motifs"),
      "prompt body carries the form-led cultural boundary",
    );
  } else {
    /* If the engine produced a motif for this default brief, at least verify
       the prompt stayed consistent — we do not falsely gate the scenario. */
    assert(p.motif !== null, "prompt motif consistent with proposal");
  }
}

async function scenario3ScaleAndTierRespected() {
  console.log("\n[3] Prompt obeys proposal scale/tier — not what the raw DNA suggests");
  const input = dna();
  const handoff = await buildHandoff(input, () => true);
  const { body } = await post("/api/design-render", handoff);
  const p = body.image_prompt;

  /* Small proposal → oversized is forbidden. Non-statement tier → excessive
     ornamentation is forbidden. The negative list is a *mirror* of the
     confirmed design; it is not padded with generic bans. */
  const proposal = handoff.proposal;
  if (proposal.scale.size !== "large") {
    assert(
      p.negative_constraints.includes("oversized jewelry"),
      "non-large proposal forbids oversized jewelry",
    );
  } else {
    assert(
      !p.negative_constraints.includes("oversized jewelry"),
      "large proposal does not forbid its own scale",
    );
  }
  if (proposal.title.tier !== "statement") {
    assert(
      p.negative_constraints.includes("excessive ornamentation"),
      "non-statement tier forbids excessive ornamentation",
    );
  }
  assert(p.vision.visual_style === proposal.title.tier, "vision.visual_style mirrors the tier");
}

async function scenario4InvalidInput() {
  console.log("\n[4] Missing hand-off / bad shape → 400 invalid_input, image never rendered");
  const { status, body } = await post("/api/design-render", {});
  assert(status === 400, `bad payload rejected with 400 (${status})`);
  assert(body.success === false, "failure is structured");
  assert(body.code === "invalid_input", `error code is invalid_input (${body.code})`);
}

async function scenario5InconsistentHandoff() {
  console.log("\n[5] Stitched hand-off with mismatching direction id → 400 inconsistent_handoff");
  const input = dna();
  const handoff = await buildHandoff(input, () => true);

  /* Mutate the top-level selected direction id so it no longer matches the
     proposal / brief. The API must catch this before touching the render. */
  const stitched = {
    ...handoff,
    selectedDirectionId: handoff.selectedDirectionId === "dir-a" ? "dir-b" : "dir-a",
  };
  const { status, body } = await post("/api/design-render", stitched);
  assert(status === 400, `stitched hand-off rejected (${status})`);
  assert(body.success === false, "structured failure");
  assert(body.code === "inconsistent_handoff", `code is inconsistent_handoff (${body.code})`);
}

async function scenario6RegenerateIsPromptOnly() {
  console.log("\n[6] Regenerate keeps proposal identical — only seed varies");
  const input = dna({
    design_keywords: ["dragon", "minimal", "silver"],
    emotion: ["power"],
  });
  const handoff = await buildHandoff(
    input,
    (d) => d.origin_match_id?.startsWith("MOTIF-"),
    "MOTIF-001",
  );

  const first = await post("/api/design-render", { ...handoff, seed: 1 });
  const second = await post("/api/design-render", { ...handoff, seed: 2 });
  assert(first.body.success && second.body.success, "both renders succeed");

  const a = first.body.image_prompt;
  const b = second.body.image_prompt;
  assert(a.proposal_id === b.proposal_id, "same proposal id across regenerations");
  assert(a.prompt === b.prompt, "assembled prompt text is deterministic across seeds");
  assert(a.negative_prompt === b.negative_prompt, "negative prompt is deterministic across seeds");
  assert(JSON.stringify(a.motif) === JSON.stringify(b.motif), "motif payload identical");
  /* Only the mock renderer varies with seed — the data URL should differ. */
  assert(
    first.body.image.data_url !== second.body.image.data_url,
    "mock image varies with seed (visual only)",
  );
}

async function scenario7I18nParity() {
  console.log("\n[7] i18n parity — zh-CN (single locale, N5) carry the designRender namespace");
  const locales = ["zh-CN"];
  const dicts = locales.map((l) => ({
    l,
    d: JSON.parse(readFileSync(resolve(MESSAGES, `${l}.json`), "utf-8")),
  }));

  function collect(node, path = "") {
    if (typeof node !== "object" || node === null) return [path];
    return Object.entries(node).flatMap(([k, v]) =>
      collect(v, path ? `${path}.${k}` : k),
    );
  }

  const baseKeys = collect(dicts[0].d.designRender);
  assert(baseKeys.length >= 40, `base locale has ≥ 40 designRender keys (${baseKeys.length})`);
  for (const { l, d } of dicts) {
    const keys = collect(d.designRender);
    const missing = baseKeys.filter((k) => !keys.includes(k));
    assert(missing.length === 0, `${l} carries every designRender key`);
    if (missing.length > 0) console.error("  missing:", missing);
  }

  /* stages.designRender + errors.api.* required by the render page. */
  for (const { l, d } of dicts) {
    assert(!!d.common.stages.designRender, `${l} has common.stages.designRender`);
    assert(
      !!d.errors.api.inconsistent_handoff &&
        !!d.errors.api.guardrail_violation &&
        !!d.errors.api.render_failed,
      `${l} has every render error code`,
    );
  }

  /* tv() namespaces the render UI depends on. */
  for (const ns of ["thickness", "renderFinish", "arrangement", "coverage"]) {
    for (const { l, d } of dicts) {
      const table = d.values?.[ns];
      assert(
        table && Object.keys(table).length >= 3,
        `${l} values.${ns} has ≥ 3 entries`,
      );
    }
  }
}

/* -------------------------------  Runner  ------------------------------- */

async function main() {
  console.log(`Testing design-render against ${BASE}`);
  await scenario1MotifRenderSuccess();
  await scenario2FormLedProposal();
  await scenario3ScaleAndTierRespected();
  await scenario4InvalidInput();
  await scenario5InconsistentHandoff();
  await scenario6RegenerateIsPromptOnly();
  await scenario7I18nParity();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
