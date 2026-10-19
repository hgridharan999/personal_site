const PLATE_SRC = '/mountain-plate.webp';
const PLATE_SIZE = { width: 1280, height: 482 };

// Wide strip for phones: the ridge and slopes drawn left to right.
const STRIP = {
  className: 'scene scene--strip',
  viewBox: '170 18 1280 250',
  width: 1280,
  suffix: '',
  strokes: [
    { cls: 'i1', width: 170, d: 'M-20 300 L200 250 L400 180 L560 110 L690 40 L800 105 L950 165 L1100 215 L1300 255' },
    { cls: 'i2', width: 190, d: 'M-20 345 L300 320 L500 270 L700 230 L900 260 L1300 320' },
    { cls: 'i3', width: 180, d: 'M-20 440 L400 425 L800 435 L1300 430' },
  ],
};

// Right-side crop for wider screens: scribbled down from the peak, the way the hiker draws.
const PEAK = {
  className: 'scene scene--peak',
  viewBox: '330 0 560 250',
  width: 560,
  suffix: '-r',
  strokes: [
    { cls: 'm1', width: 60, d: 'M600 15 L780 15 L600 60 L790 60' },
    { cls: 'm2', width: 64, d: 'M545 95 L845 95 L470 135 L905 135' },
    { cls: 'm3', width: 64, d: 'M395 170 L910 170 L330 210 L910 210' },
    { cls: 'm4', width: 70, d: 'M320 240 L910 240 L320 272 L910 272' },
  ],
};

/**
 * Each svg carries its own <defs>. A mask or filter defined inside a display:none svg does not
 * render, so the two versions cannot share one definition.
 */
function PlateSvg({ className, viewBox, width, suffix, strokes }) {
  const filterId = `hm-mtn-soft${suffix}`;
  const maskId = `hm-mtn-mask${suffix}`;
  return (
    <svg className={className} width={width} height="250" viewBox={viewBox} focusable="false">
      <defs>
        <filter id={filterId} filterUnits="userSpaceOnUse" x="-40" y="-40" width="1360" height="562">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" {...PLATE_SIZE}>
          <g filter={`url(#${filterId})`}>
            {strokes.map(({ cls, width: strokeWidth, d }) => (
              <path key={cls} className={`ink ${cls}`} pathLength="1" strokeWidth={strokeWidth} d={d} />
            ))}
          </g>
        </mask>
      </defs>
      <image href={PLATE_SRC} {...PLATE_SIZE} mask={`url(#${maskId})`} />
    </svg>
  );
}

/**
 * The header's background mountain, drawn in like a sketch. Both crops are always in the markup and
 * CSS picks one at 600px, so the first paint is already right and no JavaScript is involved.
 */
export default function MountainPlate() {
  return (
    <div className="plate" aria-hidden="true">
      <PlateSvg {...STRIP} />
      <PlateSvg {...PEAK} />
    </div>
  );
}
