import { linearScale } from './scale';

const W = 640;
const H = 200;
const PAD = { top: 16, right: 8, bottom: 28, left: 8 };
const BINS = 20;
const seconds = (ms) => `${Number((ms / 1000).toFixed(1))}s`;

export default function Histogram({ bins, binWidthMs, markers = [], label }) {
  const counts = Array.from({ length: BINS }, (_, i) => bins.find((b) => b.bin === i)?.n ?? 0);
  const barWidth = (W - PAD.left - PAD.right) / BINS;
  const y = linearScale([0, Math.max(1, ...counts)], [H - PAD.bottom, PAD.top]);
  const xOf = (ms) => PAD.left + Math.min(BINS, ms / binWidthMs) * barWidth;
  const range = (i) => (i === BINS - 1 ? `≥ ${seconds(i * binWidthMs)}` : `${seconds(i * binWidthMs)}–${seconds((i + 1) * binWidthMs)}`);

  return (
    <figure className="trn-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {counts.map((n, i) => (
          <rect key={i} className="trn-bar" x={PAD.left + i * barWidth + 1} y={y(n)} width={barWidth - 2} height={H - PAD.bottom - y(n)}>
            <title>{`${range(i)}: ${n}`}</title>
          </rect>
        ))}
        {[0, 5, 10, 15, BINS - 1].map((i) => (
          <text key={i} className="trn-axis" x={PAD.left + i * barWidth + barWidth / 2} y={H - 8} textAnchor="middle">
            {i === BINS - 1 ? `≥${seconds(i * binWidthMs)}` : seconds(i * binWidthMs)}
          </text>
        ))}
        {markers.filter((m) => m.valueMs != null).map((m) => (
          <g key={m.label}>
            <line className="trn-ref" x1={xOf(m.valueMs)} x2={xOf(m.valueMs)} y1={PAD.top} y2={H - PAD.bottom} />
            <text className="trn-axis trn-ref-label" x={xOf(m.valueMs) + 4} y={PAD.top + 8}>{m.label}</text>
          </g>
        ))}
      </svg>
    </figure>
  );
}
