/*
 * Every number the water simulation and its shader share, in frozen objects. The GLSL defines
 * (shader/water.js) are generated from these, so JS and GLSL cannot drift apart.
 * Units: lengths in band heights (the shader's space), time in seconds.
 */

/** The fixed step. Frames of any rate are cut into these, so the result never depends on frame rate. */
export const SIM = Object.freeze({
  dt: 1 / 120,
  maxSteps: 6, // per frame: a long hitch never makes the sim spiral
  slack: 1e-9, // float slack when counting whole steps (1/60 must be exactly two of 1/120)
});

/** Waterline: a 1D dispersive (Boussinesq) wave. Stable for any column count (omega * dt ~ 0.5, limit 2). */
export const SURFACE = Object.freeze({
  c: 0.75, // long-wave speed, band heights per second
  beta: 1.44e-4, // dispersion: phase speed c / sqrt(1 + beta k^2), so swells lead and ripples trail
  damp: 1.0, // velocity damping, per second
  nu: 2e-4, // viscosity: a little smoothing against grid-scale noise
  hMax: 0.2, // clamps
  vMax: 3,
  colsPerAspect: 160, // columns per unit of aspect ratio, clamped to [colsMin, colsMax]
  colsMin: 64,
  colsMax: 1024,
  etaScale: 0.05, // the texture stores eta / etaScale: 0.05 band heights is the largest visible lift
  slopeScale: 1.0, // ... and slope / slopeScale
  sway: 0.25, // how much the surface slope sways the caustics beneath it (shader)
  foamDecay: 0.8, // seconds
  foamRate: 2.0, // foam made per second by water moving faster than foamV0
  foamV0: 0.25,
  idleEvery: 8, // steps between "has everything stopped?" checks
  idleH: 2e-5,
  idleV: 2e-4,
});

/** The water under the line: a 2D wave field. CFL ~ 0.30 (limit 1). */
export const FIELD = Object.freeze({
  depth: 0.78, // from the waterline to the band floor, band heights
  c: 0.4,
  damp: 1.6,
  cellMin: 1 / 64,
  cells: 24000, // budget: the cell size grows with the aspect to stay under this
  nxMax: 512,
  rhScale: 40, // the texture stores 40 u as the ripple height ...
  gradScale: 1.0, // ... and grad u as the light displacement
  idleU: 1e-4,
  idleV: 1e-3,
});

/** How the cursor moves the water (gains tuned by eye). */
export const CURSOR = Object.freeze({
  trench: 0.24, // surface velocity pulled out per unit of path
  pressure: 0.03, // surface pressure dimple
  stir: 0.9, // field velocity per unit of path
  wMin: 0.018, // surface footprint width
  rMin: 0.025, // field footprint radius
  dragFloor: 0.6, // a pressed pointer stirs at least this hard, even when still
  depthBelow: 0.04, // depth weight width under the line
  depthAbove: 0.02, // ... and above it
  stirRamp: 0.04, // the field is stirred in only below the line, fully by this depth
  maxSamples: 16,
  pressMax: 4, // presses handled per step
  pressRing: 1.4, // a press under water: field ring peak, radius 0.03
  pressRingR: 0.03,
});

/** What happens at the waterline when the cursor or a tap meets it. The kicks are peak surface velocities, band heights per second. */
export const IMPACT = Object.freeze({
  plungeVy: 0.5, // vertical speed that counts as going in (and, upward, as coming out)
  cooldown: 0.08, // seconds before the same kind of crossing can fire again
  plungeKick: 0.9, // pushed down by a plunge, scaled by its violence E
  plungeFoam: 0.7,
  exitKick: 0.5, // pulled up by coming out
  pressKick: 1.2, // a click or tap right at the surface
  pressFoam: 0.9,
  pressDepth: 0.04, // a press this close to the line (either side) lands on the surface
});

/** How the simulation is drawn (the shader's gains; tuned by eye). */
export const SHADE = Object.freeze({
  fieldRh: 1.0, // ripple height from the field, in the units the old ripples used
  fieldDisp: 1.0, // light displacement from the field's gradient
  iceRing: 1.4, // the ripples' rings of light, drawn over the ice as shading so they read as clearly as over open water
  bergRefract: 0.008, // how far the ripples shift the iceberg's own outline and facets: a hairline shimmer, never a smear
  crest: 0.35, // light along a rising crest of the waterline
  crestFall: 10, // ... fading with depth below the line, in px
  foam: 0.85, // foam white-out
  foamFall: 6, // ... in px below the line
});
