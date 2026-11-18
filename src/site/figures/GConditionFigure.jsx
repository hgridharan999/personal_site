import { useEffect, useRef, useState } from 'react';

import './figures.css';
import { figureData } from './gCondition.js';
import { AfterPanel, BeforePanel, CurvePanel } from './panels.jsx';

const FALLBACK_W = 600;
const DATA = figureData();

/** The width of the prose column, so the SVG text stays a true 13px instead of shrinking with a viewBox. */
function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(FALLBACK_W);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => setW(Math.max(280, Math.round(el.getBoundingClientRect().width)));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Days before the g-condition, the g-condition itself, and days after it. Static. */
export default function GConditionFigure() {
  const [ref, w] = useWidth();
  return (
    <figure className="sp-fig" ref={ref}>
      <BeforePanel w={w} data={DATA} />
      <CurvePanel w={w} />
      <AfterPanel w={w} data={DATA} />
      <figcaption className="sp-fig-caption">
        Days before and after the g-condition. Worst days get the most added, best days the least, and every day ends up past the halfway mark.
      </figcaption>
    </figure>
  );
}
