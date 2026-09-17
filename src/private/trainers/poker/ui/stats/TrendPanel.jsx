import LineChart from '../../../stats/charts/LineChart';

const BREAK_EVEN = [{ y: 0, label: 'break-even' }];
const formatX = (x) => `#${x}`;

/** Per-session results and EV lost. Different units, so two single-axis charts, plus a table view. */
export default function TrendPanel({ view }) {
  return (
    <div className="pk-trend">
      <figure className="pk-trend__chart">
        <figcaption className="pk-h3">Results, BB per 100 hands</figcaption>
        <ul className="pk-legend">
          <li><span className="pk-swatch pk-swatch--net" aria-hidden="true" />Net (dashed, with dots)</li>
          <li><span className="pk-swatch pk-swatch--adj" aria-hidden="true" />All-in adjusted (solid)</li>
        </ul>
        <LineChart
          points={view.net}
          overlay={view.allinAdj}
          refLines={BREAK_EVEN}
          formatX={formatX}
          label={`Net and all-in adjusted BB per 100 hands for the last ${view.sessions} sessions`}
        />
      </figure>
      <figure className="pk-trend__chart">
        <figcaption className="pk-h3">EV lost, BB per 100 decisions</figcaption>
        {view.hasEvLost ? (
          <LineChart
            points={view.evLost}
            formatX={formatX}
            yFromZero
            label={`EV lost in BB per 100 decisions for the last ${view.sessions} sessions`}
          />
        ) : (
          <p className="pk-muted">Reviewed sessions will show here.</p>
        )}
      </figure>
      <details className="pk-details pk-stats__wide">
        <summary>Table</summary>
        <div className="pk-table-wrap">
          <table className="pk-datatable">
            <thead>
              <tr>
                <th scope="col">Session</th>
                <th scope="col">Day</th>
                <th scope="col">Hands</th>
                <th scope="col">Net BB/100</th>
                <th scope="col">All-in adj. BB/100</th>
                <th scope="col">EV lost / 100 decisions</th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((r) => (
                <tr key={r.key}>
                  <th scope="row">#{r.index}</th>
                  <td>{r.day}</td>
                  <td>{r.hands}</td>
                  <td>{r.netText}</td>
                  <td>{r.allinAdjText}</td>
                  <td>{r.evLostText}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
