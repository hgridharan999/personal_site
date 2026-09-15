import { extent, linearScale } from './scale';
import { formatSeconds } from '../../core/format';

const CELL = 26;
const LEFT = 30;
const TOP = 22;

export default function HeatGrid({ cells, rows, cols, label }) {
  const byFact = new Map(cells.map((c) => [`${c.a}x${c.b}`, c]));
  const [lo, hi] = extent(cells.map((c) => c.medianMs)) ?? [0, 1];
  const brightness = linearScale([lo, hi], [0.15, 1]);
  const width = LEFT + cols.length * CELL;
  const height = TOP + rows.length * CELL;

  return (
    <figure className="trn-chart trn-heat">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        {cols.map((b, j) => (
          <text key={b} className="trn-axis" x={LEFT + j * CELL + CELL / 2} y={14} textAnchor="middle">{b}</text>
        ))}
        {rows.map((a, i) => (
          <g key={a}>
            <text className="trn-axis" x={LEFT - 8} y={TOP + i * CELL + CELL / 2} textAnchor="end" dominantBaseline="middle">{a}</text>
            {cols.map((b, j) => {
              const cell = byFact.get(`${a}x${b}`);
              return (
                <rect
                  key={b}
                  x={LEFT + j * CELL + 1}
                  y={TOP + i * CELL + 1}
                  width={CELL - 2}
                  height={CELL - 2}
                  className={cell ? 'trn-heat-cell' : 'trn-heat-empty'}
                  style={cell ? { opacity: brightness(cell.medianMs) } : undefined}
                >
                  <title>{cell ? `${a} × ${b}: ${formatSeconds(cell.medianMs)} (n=${cell.n})` : `${a} × ${b}: not seen yet`}</title>
                </rect>
              );
            })}
          </g>
        ))}
      </svg>
      <figcaption className="trn-muted asc-mono">Brighter = slower · dark gray = not seen yet</figcaption>
    </figure>
  );
}
