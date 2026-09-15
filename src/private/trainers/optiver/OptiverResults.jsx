import { useState } from 'react';
import { mean } from '../core/stats';
import { formatSeconds, formatClock } from '../core/format';
import { OPTIVER_PASS_LINE } from '../core/benchmarks';
import { OPTIVER_RULES, scoreOptiver } from './grade';
import Kpi from '../lib/Kpi';
import SaveStatus from '../lib/SaveStatus';

function outcome(attempt) {
  if (attempt.response === null) return { mark: '—', className: 'trn-muted', label: 'Not reached' };
  return attempt.isCorrect
    ? { mark: '✓', className: 'trn-ok', label: 'Correct' }
    : { mark: '✗', className: 'trn-bad', label: 'Wrong' };
}

export default function OptiverResults({ result, saveStatus, saveError, onRetake }) {
  const [wrongOnly, setWrongOnly] = useState(false);
  const totals = scoreOptiver(result.attempts);
  const reached = totals.correct + totals.wrong;
  const delta = totals.score - OPTIVER_PASS_LINE;
  const answeredTimes = result.attempts.filter((a) => a.timeMs !== null).map((a) => a.timeMs);
  const rows = wrongOnly ? result.attempts.filter((a) => a.response !== null && !a.isCorrect) : result.attempts;

  return (
    <div className="trn-results">
      <p className="asc-mono trn-muted">Net score (+1 correct, −1 wrong)</p>
      <p className="trn-score" aria-label={`Net score ${totals.score}`}>{totals.score}</p>
      <p className={delta >= 0 ? 'trn-ok' : 'trn-bad'}>
        {delta >= 0 ? `${delta} above` : `${-delta} below`} the estimated {OPTIVER_PASS_LINE} pass line
        <span className="trn-muted"> (an unofficial estimate from public reports)</span>
      </p>

      <dl className="trn-kpis">
        <Kpi label="Correct" value={totals.correct} />
        <Kpi label="Wrong" value={totals.wrong} />
        <Kpi label="Reached" value={`${reached} / ${OPTIVER_RULES.questions}`} />
        <Kpi label="Time used" value={formatClock(result.durationMs)} />
        <Kpi label="Avg per answer" value={formatSeconds(mean(answeredTimes))} />
      </dl>

      <SaveStatus status={saveStatus} error={saveError} />

      <div className="trn-actions">
        <button type="button" className="trn-btn trn-btn--primary" data-hot onClick={onRetake}>Take another test</button>
        <button type="button" className="trn-btn" data-hot aria-pressed={wrongOnly} onClick={() => setWrongOnly((w) => !w)}>
          {wrongOnly ? 'Show all questions' : 'Show wrong only'}
        </button>
      </div>

      <div className="trn-table-wrap">
        <table className="trn-table">
          <thead>
            <tr>
              <th scope="col">#</th><th scope="col">Question</th><th scope="col">Your answer</th>
              <th scope="col">Correct answer</th><th scope="col">Result</th><th scope="col">Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const o = outcome(a);
              return (
                <tr key={a.idx}>
                  <td>{a.idx + 1}</td>
                  <td>{a.prompt}</td>
                  <td>{a.response ?? '—'}</td>
                  <td>{a.answer}</td>
                  <td className={o.className} aria-label={o.label}>{o.mark}</td>
                  <td>{formatSeconds(a.timeMs, 1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
