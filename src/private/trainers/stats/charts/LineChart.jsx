import {
  extent, linearScale, niceTicks, isFiniteNumber,
} from './scale';

const W = 640;
const H = 220;
const PAD = { top: 14, right: 14, bottom: 28, left: 44 };

export default function LineChart({
  points, overlay = [], refLines = [], formatX = String, formatY = String, xTicks, yFromZero = false, label,
}) {
  const validPoints = points.filter((p) => isFiniteNumber(p.y));
  const validOverlay = overlay.filter((p) => isFiniteNumber(p.y));
  const validRefLines = refLines.filter((r) => isFiniteNumber(r.y));
  if (validPoints.length === 0) return null;

  const [yMin, yMax] = extent(
    [...validPoints, ...validOverlay].map((p) => p.y).concat(validRefLines.map((r) => r.y)),
  );
  const ticks = niceTicks(yFromZero ? Math.min(0, yMin) : yMin, yMax);
  const y = linearScale([ticks[0], ticks[ticks.length - 1]], [H - PAD.bottom, PAD.top]);
  const [xMin, xMax] = extent(validPoints.map((p) => p.x));
  const x = linearScale([xMin, xMax], [PAD.left, W - PAD.right]);
  const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.x).toFixed(1)},${y(p.y).toFixed(1)}`).join('');

  return (
    <figure className="trn-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="trn-grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
            <text className="trn-axis" x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle">{formatY(t)}</text>
          </g>
        ))}
        {(xTicks ?? [xMin, xMax]).map((t) => (
          <text key={t} className="trn-axis" x={x(t)} y={H - 8} textAnchor="middle">{formatX(t)}</text>
        ))}
        {validRefLines.map((r) => (
          <g key={r.label}>
            <line className="trn-ref" x1={PAD.left} x2={W - PAD.right} y1={y(r.y)} y2={y(r.y)} />
            <text className="trn-axis trn-ref-label" x={W - PAD.right} y={y(r.y) - 5} textAnchor="end">{r.label}</text>
          </g>
        ))}
        {validPoints.length > 1 && <path className="trn-line" d={path(validPoints)} />}
        {validOverlay.length > 1 && <path className="trn-overlay" d={path(validOverlay)} />}
        {validPoints.map((p) => (
          <circle key={`${p.x}-${p.y}`} className="trn-dot" cx={x(p.x)} cy={y(p.y)} r={3}>
            <title>{p.title ?? `${formatX(p.x)}: ${formatY(p.y)}`}</title>
          </circle>
        ))}
      </svg>
    </figure>
  );
}
