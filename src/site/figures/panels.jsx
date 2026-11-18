import { BINS, g } from './gCondition.js';

export const PLOT_H = 96;
const TOP = 26;
export const PANEL_H = TOP + PLOT_H + 26;
const base = TOP + PLOT_H;

/** Shared frame for one panel: its label, the dashed halfway line, the baseline and the two end labels. */
function Panel({ w, label, aria, children }) {
  return (
    <svg className="sp-fig-panel" viewBox={`0 0 ${w} ${PANEL_H}`} width={w} height={PANEL_H} role="img" aria-label={aria}>
      <text className="sp-fig-label" x="0" y="13">{label}</text>
      {children}
      <line className="sp-fig-base" x1="0" x2={w} y1={base} y2={base} />
      <line className="sp-fig-half" x1={w / 2} x2={w / 2} y1={TOP - 6} y2={base} />
      <text className="sp-fig-note" x={w / 2} y={TOP - 10} textAnchor="middle">Halfway</text>
      <text className="sp-fig-note" x="0" y={base + 18}>Worst day</text>
      <text className="sp-fig-note" x={w} y={base + 18} textAnchor="end">Best day</text>
    </svg>
  );
}

function Bars({ counts, max, w, className }) {
  const bw = w / BINS;
  return counts.map((c, i) => {
    const h = (c / max) * PLOT_H;
    return c ? <rect key={i} className={className} x={i * bw + 1} y={base - h} width={bw - 2} height={h} /> : null;
  });
}

export function BeforePanel({ w, data }) {
  return (
    <Panel w={w} label="Before" aria="Histogram of days before the g-condition. Most days cluster around the middle, with many below halfway.">
      <Bars counts={data.before} max={data.max} w={w} className="sp-fig-bar sp-fig-bar--before" />
    </Panel>
  );
}

export function CurvePanel({ w }) {
  const top = g(0);
  const pts = Array.from({ length: 41 }, (_, i) => {
    const x = i / 40;
    return `${(x * w).toFixed(1)},${(base - (g(x) / top) * (PLOT_H - 8)).toFixed(1)}`;
  });
  return (
    <Panel w={w} label="The g-condition" aria="The g-condition curve. Gratitude added falls steeply from the most on the worst day to nothing on the best day.">
      <polyline className="sp-fig-curve" points={pts.join(' ')} />
      <text className="sp-fig-note" x="0" y={TOP + 62}>Most added</text>
      <text className="sp-fig-note" x={w - 4} y={base - 18} textAnchor="end">Least added</text>
    </Panel>
  );
}

export function AfterPanel({ w, data }) {
  return (
    <Panel w={w} label="After" aria="Histogram of days after the g-condition. Every day sits to the right of halfway. The grey outline shows where the days were before.">
      <Bars counts={data.before} max={data.max} w={w} className="sp-fig-bar sp-fig-bar--ghost" />
      <Bars counts={data.after} max={data.max} w={w} className="sp-fig-bar sp-fig-bar--after" />
    </Panel>
  );
}
