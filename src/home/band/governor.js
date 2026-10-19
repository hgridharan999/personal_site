/*
 * Frame governor: caps drawing at 60fps, and if the GPU cannot hold ~40fps, sheds resolution first,
 * then frame rate, and wins both back once the frames are healthy again. Thresholds are the
 * mockup's. Pure (the caller supplies rAF timestamps), so it is testable in node.
 */
export const GOVERNOR = Object.freeze({
  hitchMs: 120, // a longer gap is a tab switch or a stall, not a measurement
  smoothing: 0.08, // EMA weight per frame
  slowMs: 27, // an average above this counts as slow (~37fps) ...
  slowMsHalf: 50, // ... above this once already at half rate
  slowFrames: 45, // consecutive slow frames before stepping down
  qualityStep: 0.8,
  qualityFloor: 0.55, // below this, halve the frame rate instead of shrinking further
  maxDtSeconds: 0.1, // the clock and the wake never advance by more than this in one frame
  // draw cap: never draw faster than ~60fps, however fast the display runs
  frameMs: 1000 / 60,
  capSlack: 0.6, // fraction of the rAF interval a draw may arrive early, so 75-90Hz displays are not halved
  // telling a slow GPU from a slow clock (iOS Low Power Mode caps rAF at 30fps with an idle GPU)
  window: 60, // recent frame gaps kept
  cadenceQuantile: 0.25, // the fast end of the recent gaps is the platform's own frame interval ...
  cadenceFactor: 1.5, // ... and only frames well beyond it are slow
  // recovery
  goodRatio: 0.8, // "healthy" means under this fraction of the slow limit
  recoverFrames: 300, // consecutive healthy frames before stepping back up (~5s at 60fps)
  recoverMax: 4800, // the wait doubles each time a recovery is undone, up to this
  flapFrames: 600, // being undone within this many frames of a recovery counts as flapping
});

const quantile = (values, q) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
};

export function createGovernor() {
  const G = GOVERNOR;
  const recent = [];
  let last = 0;
  let lastDraw = -Infinity;
  let ema = 16.7;
  let slow = 0;
  let good = 0;
  let level = 0; // quality = 0.8 ^ level, so stepping back up lands on exactly 1
  let halfRate = false;
  let skip = false;
  let recoverAfter = G.recoverFrames;
  let sinceRecovery = Infinity;

  const quality = () => G.qualityStep ** level;

  /**
   * The average gap above which frames count as slow. Healthy loops answer fast (no sorting); once the
   * average is high, the limit moves up to 1.5x the fast end of recent gaps, so a steady 33ms from a
   * 30fps rAF cap is the platform's rhythm, not a struggling GPU (which shows a mix of fast and slow gaps).
   */
  const slowLimit = (base) => (ema <= base ? base : Math.max(base, G.cadenceFactor * quantile(recent, G.cadenceQuantile)));

  /** Returns true when quality changed (the canvas needs resizing). */
  function stepDown() {
    // a recovery undone soon after means the GPU cannot take it: wait longer next time
    if (sinceRecovery < G.flapFrames) recoverAfter = Math.min(recoverAfter * 2, G.recoverMax);
    sinceRecovery = Infinity;
    if (quality() > G.qualityFloor) {
      level++;
      return true;
    }
    halfRate = true;
    return false;
  }

  /** Half rate goes first (it hurts most), then resolution, one step per healthy run. */
  function stepUp() {
    sinceRecovery = 0;
    if (halfRate) {
      halfRate = false;
      return false;
    }
    level--;
    return true;
  }

  /** Fold one frame gap into the averages; true when quality changed. */
  function measure(ms) {
    recent.push(ms);
    if (recent.length > G.window) recent.shift();
    ema += (ms - ema) * G.smoothing;
    sinceRecovery++;
    slow = ema > slowLimit(halfRate ? G.slowMsHalf : G.slowMs) ? slow + 1 : 0;
    if (slow > G.slowFrames) {
      slow = 0;
      good = 0;
      return stepDown();
    }
    const degraded = halfRate || level > 0;
    good = degraded && ema < G.goodRatio * slowLimit(G.slowMs) ? good + 1 : 0;
    if (good >= recoverAfter) {
      good = 0;
      return stepUp();
    }
    return false;
  }

  return {
    get quality() { return quality(); },
    get halfRate() { return halfRate; },

    /** Call when the loop (re)starts, so the pause between runs is not read as a slow frame. */
    restart() {
      last = 0;
      lastDraw = -Infinity;
      recent.length = 0;
    },

    /**
     * One rAF tick.
     * @param {number} ts the rAF timestamp, ms
     * @returns {{ dt: number, resize: boolean, draw: boolean }} dt in seconds (0 on the first
     *   frame, capped); resize = quality changed (either way); draw = false on frames the 60fps
     *   cap or half rate skips
     */
    tick(ts) {
      let dt = 0;
      let ms = 0;
      let resize = false;
      if (last) {
        ms = Math.max(ts - last, 0);
        dt = Math.min(ms / 1000, G.maxDtSeconds);
        if (ms < G.hitchMs) resize = measure(ms);
      }
      last = ts;
      let draw = ts - lastDraw >= Math.max(0, G.frameMs - G.capSlack * ms);
      if (draw && halfRate) {
        skip = !skip;
        draw = !skip;
      }
      if (draw) lastDraw = ts;
      return { dt, resize, draw };
    },
  };
}
