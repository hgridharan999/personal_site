import { useRef } from 'react';
import './kili.css';
import { NEXT_CLIMB } from '../content';
import KiliFooter from './KiliFooter';
import { useKiliBand } from './useKiliBand';

// Legend swatches, plains up. The colours are in kili.css; zones.js holds the same ones for the
// canvas and a test keeps the two in step.
const ZONE_CLASS = ['kili-z1', 'kili-z2', 'kili-z3', 'kili-z4', 'kili-z5'];

function Legend() {
  const { zones, route } = NEXT_CLIMB;
  return (
    <div className="kili-key" data-kili="key">
      {zones.map((name, z) => ({ name, cls: ZONE_CLASS[z] })).reverse().map(({ name, cls }) => (
        <span key={name} className={cls}><i />{name}</span>
      ))}
      <span className="kili-route"><i />{route}</span>
    </div>
  );
}

/**
 * The page's ending: Kilimanjaro drawn as stacked ink lines from real terrain, coloured by
 * elevation, with the planned Machame route on it, then the footer. Render inside the page's
 * `.hm` root: the styles are scoped to it.
 *
 * The band is decoration (the "Next climb" line above says it all in words), so all of it is
 * aria-hidden: the canvas, the labels and the legend. It holds its height from the first paint,
 * blank, and the drawing code and terrain are only fetched when the band is a screen away.
 */
export default function KiliEnding() {
  const bandRef = useRef(null);
  const { failed } = useKiliBand(bandRef);
  const { summit, places } = NEXT_CLIMB;

  return (
    <>
      <div className="kili-band" ref={bandRef} aria-hidden="true" data-failed={failed || undefined}>
        <canvas />
        <div className="kili-peak" data-kili="peak">
          <span className="kili-t" data-kili="peak-text">
            <span className="kili-nm">{summit.name}</span>
            <span className="kili-sub">{summit.height}</span>
          </span>
        </div>
        <div className="kili-peak kili-peak--quiet" data-kili="mawenzi"><span className="kili-t">{places.mawenzi}</span></div>
        <div className="kili-wp kili-wp--l" data-kili="wp" data-wp={places.start}><span>{places.start}</span></div>
        <div className="kili-wp kili-wp--r" data-kili="wp" data-wp={places.camp}><span>{places.camp}</span></div>
        <Legend />
      </div>
      <KiliFooter />
    </>
  );
}
