// Three thick strokes in drawing order: hood, then torso and pack, then legs and poles.
const STROKES = [
  { cls: 'ink-1', width: 64, d: 'M104 30 C 150 0, 196 30, 180 70 S 96 110, 100 70 S 160 40, 200 110' },
  { cls: 'ink-2', width: 72, d: 'M70 130 L 286 120 L 40 185 L 290 185 L 30 245 L 290 245 L 20 305 L 286 300' },
  { cls: 'ink-3', width: 72, d: 'M10 345 L 290 345 L 0 400 L 294 400 L 0 455 L 294 460' },
];

/**
 * The hiker logo: the live site's own art, revealed by blurred strokes inside a mask. It is pure
 * CSS, so the figure is fully drawn with JS off or under reduced motion and draws in once otherwise.
 * Ids carry the hm- prefix so they cannot collide with SVGs on other pages.
 */
export default function HikerMark() {
  return (
    <svg className="hiker" viewBox="0 0 294 480" aria-hidden="true" focusable="false">
      <defs>
        <filter id="hm-hiker-soft" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <mask id="hm-hiker-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="294" height="480">
          <g filter="url(#hm-hiker-soft)">
            {STROKES.map(({ cls, width, d }) => (
              <path key={cls} className={`ink ${cls}`} pathLength="1" strokeWidth={width} d={d} />
            ))}
          </g>
        </mask>
      </defs>
      <image href="/hiker.webp" width="294" height="480" mask="url(#hm-hiker-mask)" />
    </svg>
  );
}
