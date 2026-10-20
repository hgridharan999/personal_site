/*
 * Pointer input for the band's canvas, in the water's space: band-height units, x from the centre
 * line and y from the top.
 */

/**
 * Raw listeners. All passive, so they can never delay scrolling. Touch scrolling is left to the
 * browser by the canvas's `touch-action: pan-y` (set in band.css): a vertical pan ends in
 * pointercancel, which simply ends the stroke; a sideways drag keeps stirring the water.
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
 * Connect the canvas to the water. Input is ignored unless the loop is running, so a paused,
 * hidden or reduced-motion page never reacts. `water` is a getter, because a restored context
 * brings a fresh simulation.
 * @param {{ running(): boolean, water(): { point(x: number, y: number, drag: boolean): void, press(x: number, y: number): void, leave(): void } | null }} src
 */
export function wirePointer(canvas, { running, water }) {
  return bindPointer(canvas, {
    onPoint: (x, y, drag) => { if (running()) water()?.point(x, y, drag); },
    onPress: (x, y) => { if (running()) water()?.press(x, y); },
    onLeave: () => water()?.leave(),
  });
}
