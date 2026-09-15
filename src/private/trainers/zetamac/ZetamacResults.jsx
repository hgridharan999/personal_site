import { median } from '../core/stats';
import { formatSeconds } from '../core/format';
import Kpi from '../lib/Kpi';
import SaveStatus from '../lib/SaveStatus';

const MODE_LABEL = { standard: 'Standard game', custom: 'Custom game', drill: 'Targeted drill' };

export default function ZetamacResults({ result, options, mode, saveStatus, saveError, onPlayAgain, onSettings }) {
  const solved = result.attempts.filter((a) => a.isCorrect);
  const corrections = result.attempts.reduce((sum, a) => sum + a.corrections, 0);
  const slowest = [...solved].sort((a, b) => b.timeMs - a.timeMs).slice(0, 5);

  return (
    <div className="trn-results">
      <p className="asc-mono trn-muted">{MODE_LABEL[mode]} · {options.duration} s</p>
      <p className="trn-score" aria-label={`Score ${solved.length}`}>{solved.length}</p>

      <dl className="trn-kpis">
        <Kpi label="Per minute" value={(solved.length / (options.duration / 60)).toFixed(1)} />
        <Kpi label="Median time" value={formatSeconds(median(solved.map((a) => a.timeMs)))} />
        <Kpi label="Corrections" value={corrections} />
      </dl>

      {slowest.length > 0 && (
        <>
          <h2 className="asc-mono trn-subhead">Slowest this game</h2>
          <div className="trn-table-wrap">
            <table className="trn-table">
              <thead>
                <tr><th scope="col">Problem</th><th scope="col">Time</th><th scope="col">Corrections</th></tr>
              </thead>
              <tbody>
                {slowest.map((a) => (
                  <tr key={a.idx}>
                    <td>{a.prompt} = {a.answer}</td>
                    <td>{formatSeconds(a.timeMs)}</td>
                    <td>{a.corrections}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <SaveStatus status={saveStatus} error={saveError} />

      <div className="trn-actions">
        <button type="button" className="trn-btn trn-btn--primary" data-hot onClick={onPlayAgain}>Play again</button>
        <button type="button" className="trn-btn" data-hot onClick={onSettings}>Change settings</button>
      </div>
    </div>
  );
}
