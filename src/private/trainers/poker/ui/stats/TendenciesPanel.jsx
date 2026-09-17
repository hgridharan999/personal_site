import TargetMeter from './TargetMeter';
import { OVERALL } from './statsView';

/** Profile stats against winning 6-max ranges, overall or for one position. */
export default function TendenciesPanel({ view, onPosition }) {
  return (
    <div className="pk-tendencies">
      <div className="pk-seg" role="group" aria-label="Position">
        {view.positions.map((p) => (
          <button
            key={p}
            type="button"
            className="pk-tab"
            aria-pressed={view.position === p}
            data-hot
            onClick={() => onPosition(p)}
          >
            {p === OVERALL ? 'All' : p}
          </button>
        ))}
      </div>
      <p className="pk-muted">
        {view.hands} hands · flags need {view.minSample} spots · ranges are approximate
      </p>
      <div className="pk-table-wrap">
        <table className="pk-table">
          <caption className="pk-sr-only">Your tendencies against target ranges for winning 6-max play</caption>
          <thead>
            <tr>
              <th scope="col">Stat</th>
              <th scope="col">You</th>
              <th scope="col">Target</th>
              <th scope="col"><span className="pk-sr-only">Range chart</span></th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((r) => (
              <tr key={r.key} className={r.lowSample ? 'pk-row--low' : undefined}>
                <th scope="row">{r.label}</th>
                <td>{r.valueText} <span className="pk-muted">({r.n})</span></td>
                <td>{r.rangeText}</td>
                <td>
                  <TargetMeter value={r.value} target={r.target} flag={r.flag} label={`${r.label}: ${r.valueText}, target ${r.rangeText}`} />
                </td>
                <td className={r.flag ? `pk-flag pk-flag--${r.flag}` : 'pk-flag'}>{r.statusText}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
