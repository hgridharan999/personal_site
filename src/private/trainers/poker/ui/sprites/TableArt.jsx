import { memo } from 'react';
import { TABLE_W, TABLE_H, tableRuns } from './tableGrid.js';
import './sprites.css';

const RUNS = tableRuns();
const TONE_CLASS = {
  rail: 'pk-t-rail',
  railHi: 'pk-t-rail-hi',
  line: 'pk-t-line',
  felt: 'pk-t-felt',
  feltDk: 'pk-t-felt-dk',
  feltHi: 'pk-t-felt-hi',
};

/** The 120x56 pixel table, stretched to its container. Decorative. */
function TableArt({ className = '' }) {
  return (
    <svg
      className={`pk-table-art ${className}`.trim()}
      viewBox={`0 0 ${TABLE_W} ${TABLE_H}`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      {RUNS.map(({ x, y, w, tone }) => (
        // The 0.02 overlap hides hairline seams between runs when the SVG is stretched.
        <rect key={`${x}-${y}`} x={x} y={y} width={w + 0.02} height={1.02} className={TONE_CLASS[tone]} />
      ))}
    </svg>
  );
}

export default memo(TableArt);
