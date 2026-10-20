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

/** How the cursor moves the water. Starting values from the design; see tuning notes in sim.js. */
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

/** Splash drops. g and the throw speed keep the apex inside the air above the line. */
export const SPLASH = Object.freeze({
  g: 6,
  drag: 0.4, // per second
  life: 3,
  vThrow: 1.5,
  rMin: 0.004,
  rMax: 0.011,
  streak: 0.02, // seconds of motion the drawn streak trails behind a drop
  dead: -10, // y of an unused slot (the shader skips anything above -5)
  killY: 1.2,
  killX: 0.05, // beyond the band edge
  plungeVy: 0.5, // downward speed that makes a plunge (and upward, an exit)
  cooldown: 0.08,
  skimVx: 1.0,
  skimRate: 40, // drops per second at full skim
  skimSurface: 0.02, // |depth| under which the cursor is skimming
  crown: 12,
  crownDepth: 0.04, // a press this close to the line makes a crown
  // what each event does to the water (peak surface velocity in band heights per second, field impulse, foam)
  plungeKick: 0.9, // pushed down by a plunge, scaled by its violence E
  exitKick: 0.5, // pulled up by an exit
  crownKick: 1.2,
  crownFoam: 0.9,
  plungeFoam: 0.7,
  landKick: 0.3, // per landing drop, scaled by its size and speed
  landField: 0.4,
  landFoam: 0.5,
});

/** How the simulation is drawn (the shader's gains; tuned by eye). */
export const SHADE = Object.freeze({
  fieldRh: 1.0, // ripple height from the field, in the units the old ripples used
  fieldDisp: 1.0, // light displacement from the field's gradient
  crest: 0.35, // light along a rising crest of the waterline
  crestFall: 10, // ... fading with depth below the line, in px
  foam: 0.85, // foam white-out
  foamFall: 6, // ... in px below the line
  dropFill: [0.8, 0.94, 0.98],
  dropRim: [0.059, 0.49, 0.667],
  segHigh: 1e-8, // shortest drop streak (squared) the closest-point maths divides by
  segMedium: 1e-4, // ... mediump cannot hold 1e-8
});
