import { bitmapRuns } from './glyphs.js';

/** Renders a glyph bitmap as crisp SVG rects, `px` screen pixels per bitmap pixel. Fill is currentColor. */
export default function PixelBitmap({ rows, px, className = '' }) {
  const width = rows[0].length;
  const height = rows.length;
  return (
    <svg
      className={`pk-bitmap ${className}`.trim()}
      width={width * px}
      height={height * px}
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      {bitmapRuns(rows).map(({ x, y, w }) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={w} height={1} />
      ))}
    </svg>
  );
}
