// The pixel table: a superellipse on a 120x56 grid with a stepped rail, an inner betting line and
// checkerboard dithering toward the edges. Ported from the approved mockup; tones map to --pk-* tokens in CSS.

export const TABLE_W = 120;
export const TABLE_H = 56;

/** @typedef {'rail'|'railHi'|'line'|'felt'|'feltDk'|'feltHi'} Tone */

/** The tone of pixel (x, y), or null outside the table. */
export function tableTone(x, y) {
  const cx = TABLE_W / 2;
  const cy = TABLE_H / 2;
  const a = TABLE_W / 2 - 1;
  const b = TABLE_H / 2 - 1;
  const px = x + 0.5 - cx;
  const py = y + 0.5 - cy;
  const dx = px / a;
  const dy = py / b;
  const outer = Math.abs(dx) ** 5 + dy * dy;
  if (outer > 1) return null;
  const inner = Math.abs(px / (a - 5)) ** 5 + (py / (b - 5)) ** 2;
  if (inner > 1) return y < cy - b + 3 || (inner > 1.35 && y < cy) ? 'railHi' : 'rail';
  const line = Math.abs(px / (a - 9)) ** 5 + (py / (b - 9)) ** 2;
  if (line > 0.93 && line < 1.07) return 'line';
  if ((x * 7 + y * 13) % 23 === 0) return 'feltHi';
  return (x + y) % 2 === 0 && dx * dx + dy * dy > 0.55 ? 'feltDk' : 'felt';
}

/** Same-tone horizontal runs, one <rect> each. */
export function tableRuns() {
  const runs = [];
  for (let y = 0; y < TABLE_H; y += 1) {
    let x = 0;
    while (x < TABLE_W) {
      const tone = tableTone(x, y);
      let end = x + 1;
      while (end < TABLE_W && tableTone(end, y) === tone) end += 1;
      if (tone) runs.push({ x, y, w: end - x, tone });
      x = end;
    }
  }
  return runs;
}
