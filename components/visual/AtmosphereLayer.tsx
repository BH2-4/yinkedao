/**
 * STAGE 6 — DYNAMIC VISUAL LAYER · Atmosphere
 *
 * A pair of CSS-only overlays that give the black shell real depth without
 * costing a single JS cycle:
 *
 *   · Ambient layer (behind the canvas, z=-1) — two very weak, very wide
 *     radial glows in silver-ivory, so the black never reads as "dead
 *     flat". Warm-neutral top-right + cool-neutral bottom-left, both α
 *     well below 0.05.
 *   · Vignette layer (above the canvas, z=1) — a subtle radial darken at
 *     the edges + a soft ivory rim highlight at the very top. Pushes the
 *     eye toward the content while giving edge particles the impression
 *     of receding into the frame.
 *
 * Both layers are:
 *   · position: fixed, inset: 0
 *   · pointer-events: none (never captures a click)
 *   · rendered once in the layout; no state, no listeners, no RAF.
 *
 * Never carry a logo, motif, or cultural imagery. Ambience only.
 */

export function AtmosphereLayer() {
  return (
    <>
      {/* Ambient — sits BEHIND the particle canvas so particles catch it. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          zIndex: -1,
          background:
            "radial-gradient(1000px 700px at 78% 8%, rgba(231, 226, 211, 0.035), transparent 62%)," +
            "radial-gradient(900px 640px at 12% 92%, rgba(201, 204, 209, 0.028), transparent 65%)," +
            "radial-gradient(680px 480px at 50% 50%, rgba(195, 39, 43, 0.02), transparent 70%)",
        }}
      />
      {/* Vignette + top rim — sits ABOVE the particles but BELOW content
          (content wrapper is z-10). Edges are softly darkened; the top
          gets a very faint ivory band that lifts the eye. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          zIndex: 1,
          background:
            "radial-gradient(1400px 900px at 50% 50%, transparent 55%, rgba(26, 26, 26, 0.05) 100%)," +
            "linear-gradient(to bottom, rgba(245, 241, 232, 0.018), transparent 8%)," +
            "linear-gradient(to top, rgba(195, 39, 43, 0.025), transparent 22%)",
        }}
      />
    </>
  );
}
