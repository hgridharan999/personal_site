# Phase 5a: Stats UI (Tasks 15–16)

Read `00-overview.md` first. Task 15 depends only on Task 13 (`core/format.js`). Task 16 depends on Tasks 2, 10, 11, 12, 14 and 15.

---

### Task 15: Chart scales and SVG chart components

**Files:**
- Create: `src/private/trainers/stats/charts/scale.js`
- Create: `src/private/trainers/stats/charts/LineChart.jsx`
- Create: `src/private/trainers/stats/charts/Histogram.jsx`
- Create: `src/private/trainers/stats/charts/HeatGrid.jsx`
- Create: `src/private/trainers/stats/charts/BarList.jsx`
- Modify (append): `src/private/trainers/trainers.css`
- Test: `src/private/trainers/stats/charts/scale.test.js`

**Interfaces:**
- Consumes: `formatSeconds` (Task 13).
- Produces:
  - `scale.js`:
    - `extent(values): [min, max] | null`
    - `linearScale([d0, d1], [r0, r1]): (v) => number`, which maps to the range midpoint when `d0 === d1`
    - `niceStep(raw): number`, returning 1, 2 or 5 × 10^k
    - `niceTicks(min, max, count = 4): number[]`
  - `<LineChart points={[{x, y, title?}]} overlay?={[{x, y}]} refLines?={[{y, label}]} formatX? formatY? xTicks? yFromZero? label />`, which renders nothing when `points` is empty
  - `<Histogram bins={[{bin, n}]} binWidthMs markers?={[{valueMs, label}]} label />`, with 20 bins where bin 19 means "≥ 19 × width"
  - `<HeatGrid cells={[{a, b, n, medianMs}]} rows={number[]} cols={number[]} label />`, where brighter means slower and gray means no data
  - `<BarList items={[{key?, label, value, display, hint?}]} label />`

Accessibility: every SVG has `role="img"` and an `aria-label` summary, and every data mark has a `<title>`. Colors come only from CSS classes that use `.asc` tokens. SVG presentation attributes can't use `var()` reliably, so there are no inline colors. Inline `style` is used only for data-driven `opacity` and `width`.

- [ ] **Step 1: Write the failing test**

`src/private/trainers/stats/charts/scale.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { extent, linearScale, niceStep, niceTicks } from './scale.js';

describe('scale', () => {
  it('extent', () => {
    expect(extent([])).toBeNull();
    expect(extent([3, -1, 7])).toEqual([-1, 7]);
  });
  it('linearScale maps and handles a zero-span domain', () => {
    const s = linearScale([0, 10], [100, 200]);
    expect(s(0)).toBe(100);
    expect(s(5)).toBe(150);
    expect(linearScale([4, 4], [0, 50])(4)).toBe(25);
  });
  it('niceStep picks 1/2/5 × 10^k', () => {
    expect(niceStep(11.75)).toBe(20);
    expect(niceStep(0.25)).toBe(0.5);
    expect(niceStep(3)).toBe(5);
    expect(niceStep(1000)).toBe(1000);
  });
  it('niceTicks', () => {
    expect(niceTicks(0, 47)).toEqual([0, 20, 40, 60]);
    expect(niceTicks(12, 58)).toEqual([0, 20, 40, 60]);
    expect(niceTicks(0, 1)).toEqual([0, 0.5, 1]);
    expect(niceTicks(40, 40)).toEqual([0, 20, 40, 60, 80]);
    expect(niceTicks(-12, 9)).toEqual([-20, -10, 0, 10]);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/private/trainers/stats/charts/scale.test.js`
Expected: FAIL with an unresolved import.

- [ ] **Step 3: Implement `scale.js`**

`src/private/trainers/stats/charts/scale.js`:

```js
export function extent(values) {
  if (!values.length) return null;
  return [Math.min(...values), Math.max(...values)];
}

export function linearScale([d0, d1], [r0, r1]) {
  const span = d1 - d0;
  return (v) => (span === 0 ? (r0 + r1) / 2 : r0 + ((v - d0) / span) * (r1 - r0));
}

export function niceStep(raw) {
  const pow = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / pow;
  for (const m of [1, 2, 5, 10]) {
    if (fraction <= m + 1e-9) return m * pow;
  }
  return 10 * pow;
}

export function niceTicks(min, max, count = 4) {
  let lo = min;
  let hi = max;
  if (lo === hi) {
    const pad = Math.abs(lo) || 1;
    lo -= pad;
    hi += pad;
  }
  const step = niceStep((hi - lo) / count);
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v * 1e9) / 1e9);
  return ticks;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run src/private/trainers/stats/charts/scale.test.js`
Expected: PASS.

- [ ] **Step 5: Implement the chart components**

`src/private/trainers/stats/charts/LineChart.jsx`:

```jsx
import { extent, linearScale, niceTicks } from './scale';

const W = 640;
const H = 220;
const PAD = { top: 14, right: 14, bottom: 28, left: 44 };

export default function LineChart({
  points, overlay = [], refLines = [], formatX = String, formatY = String, xTicks, yFromZero = false, label,
}) {
  if (points.length === 0) return null;

  const [yMin, yMax] = extent([...points, ...overlay].map((p) => p.y).concat(refLines.map((r) => r.y)));
  const ticks = niceTicks(yFromZero ? Math.min(0, yMin) : yMin, yMax);
  const y = linearScale([ticks[0], ticks[ticks.length - 1]], [H - PAD.bottom, PAD.top]);
  const [xMin, xMax] = extent(points.map((p) => p.x));
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
        {refLines.map((r) => (
          <g key={r.label}>
            <line className="trn-ref" x1={PAD.left} x2={W - PAD.right} y1={y(r.y)} y2={y(r.y)} />
            <text className="trn-axis trn-ref-label" x={W - PAD.right} y={y(r.y) - 5} textAnchor="end">{r.label}</text>
          </g>
        ))}
        {points.length > 1 && <path className="trn-line" d={path(points)} />}
        {overlay.length > 1 && <path className="trn-overlay" d={path(overlay)} />}
        {points.map((p) => (
          <circle key={`${p.x}-${p.y}`} className="trn-dot" cx={x(p.x)} cy={y(p.y)} r={3}>
            <title>{p.title ?? `${formatX(p.x)}: ${formatY(p.y)}`}</title>
          </circle>
        ))}
      </svg>
    </figure>
  );
}
```

`src/private/trainers/stats/charts/Histogram.jsx`:

```jsx
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
```

`src/private/trainers/stats/charts/HeatGrid.jsx`:

```jsx
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
```

`src/private/trainers/stats/charts/BarList.jsx`:

```jsx
export default function BarList({ items, label }) {
  const max = Math.max(0, ...items.map((i) => i.value)) || 1;
  return (
    <ul className="trn-barlist" aria-label={label}>
      {items.map((item) => (
        <li key={item.key ?? item.label} className="trn-barlist-row">
          <span className="trn-barlist-label">{item.label}</span>
          <span className="trn-barlist-track" aria-hidden="true">
            <span className="trn-barlist-fill" style={{ width: `${(item.value / max) * 100}%` }} />
          </span>
          <span className="trn-barlist-value">{item.display}</span>
          {item.hint && <span className="trn-barlist-hint trn-muted">{item.hint}</span>}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 6: Append the chart styles**

Append to `src/private/trainers/trainers.css`:

```css
/* ---- charts ----------------------------------------------- */
.trn-chart { margin: 0; }
.trn-chart svg { display: block; width: 100%; height: auto; overflow: visible; }
.trn-heat svg { max-width: 620px; }
.trn-grid { stroke: var(--line-2); stroke-width: 1; }
.trn-axis { fill: var(--faint); font-family: var(--mono); font-size: 10px; }
.trn-ref { stroke: var(--muted); stroke-width: 1; stroke-dasharray: 4 4; }
.trn-ref-label { fill: var(--muted); }
.trn-line { fill: none; stroke: var(--amber); stroke-width: 1.5; opacity: 0.55; }
.trn-overlay { fill: none; stroke: var(--bone); stroke-width: 2; }
.trn-dot { fill: var(--amber); }
.trn-bar { fill: var(--amber); opacity: 0.8; }
.trn-bar:hover, .trn-dot:hover { opacity: 1; }
.trn-heat-cell { fill: var(--amber); }
.trn-heat-empty { fill: var(--bg-2); }
.trn-barlist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.trn-barlist-row { display: grid; grid-template-columns: minmax(90px, 160px) 1fr auto; align-items: center; gap: 4px 12px; }
.trn-barlist-label { font-family: var(--mono); font-size: 12px; color: var(--muted); }
.trn-barlist-track { height: 8px; background: var(--bg-2); }
.trn-barlist-fill { display: block; height: 100%; background: var(--amber); }
.trn-barlist-value { font-variant-numeric: tabular-nums; font-size: 14px; }
.trn-barlist-hint { grid-column: 2 / -1; font-size: 12px; }
```

- [ ] **Step 7: Build and run the tests**

Run: `npm test` (all tests pass) and `npm run build` (succeeds). The components are rendered and checked visually in Task 16.

- [ ] **Step 8: Commit**

```bash
git add src/private/trainers/stats/charts src/private/trainers/trainers.css
git commit -m "Add SVG chart components and scale helpers for trainer stats" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

<!-- TASK-16-APPEND-POINT -->
