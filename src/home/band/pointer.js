/*
 * Pointer input for the band's canvas, in the shader's space: band-height units, x from the centre
 * line and y from the top.
 */

const TAP_LIFE = 5.0; // the shader draws a press ring only while its age < 5

/** The press/tap ring's uniform data (x, y, age in seconds, strength); an age <= 0 means none. */
export function createTap() {
  const data = new Float32Array([0, 0, -1, 0]);
  return {
    data,
    /** Start a ring. The age begins just above 0, because the shader treats 0 as "not started". */
    press(x, y) {
      data[0] = x;
      data[1] = y;
      data[2] = 0.001;
      data[3] = 1;
    },
    advance(dt) {
      if (data[2] <= 0) return;
      const age = data[2] + dt;
      data[2] = age > TAP_LIFE ? -1 : age;
    },
    clear() {
      data[2] = -1;
    },
  };
}

/**
 * Raw listeners. All passive, so they can never delay scrolling. Touch scrolling is left to the
 * browser by the canvas's `touch-action: pan-y` (set in band.css): a vertical pan ends in
 * pointercancel, which simply ends the stroke; a sideways drag keeps painting the wake.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{ onPoint(x: number, y: number, drag: boolean): void, onPress(x: number, y: number): void, onLeave(): void }} h
 * @returns {() => void} unbind
 */
export function bindPointer(canvas, { onPoint, onPress, onLeave }) {
  const toBand = (e) => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left - r.width / 2) / r.height, (e.clientY - r.top) / r.height];
  };
  const move = (e) => {
    if (!e.isPrimary) return; // a second finger would make the head jump between hands
    const [x, y] = toBand(e);
    onPoint(x, y, e.buttons !== 0);
  };
  const press = (e) => {
    if (!e.isPrimary) return;
    const [x, y] = toBand(e);
    onPoint(x, y, true);
    onPress(x, y);
  };
  const leave = (e) => {
    if (e.isPrimary) onLeave();
  };

  const opts = { passive: true };
  const events = [['pointerdown', press], ['pointermove', move], ['pointerleave', leave], ['pointercancel', leave]];
  events.forEach(([name, fn]) => canvas.addEventListener(name, fn, opts));
  return () => events.forEach(([name, fn]) => canvas.removeEventListener(name, fn, opts));
}

/**
 * Connect the canvas to the wake and the ring. Input is ignored unless the loop is running, so a
 * paused, hidden or reduced-motion page never reacts.
 * @param {{ running(): boolean, wake(): { point(x: number, y: number, drag: boolean): void, leave(): void } | null, tap: ReturnType<typeof createTap> }} src
 */
export function wirePointer(canvas, { running, wake, tap }) {
  return bindPointer(canvas, {
    onPoint: (x, y, drag) => { if (running()) wake()?.point(x, y, drag); },
    onPress: (x, y) => { if (running()) tap.press(x, y); },
    onLeave: () => wake()?.leave(),
  });
}
