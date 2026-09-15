import { formatSeconds } from '../core/format';

function outcome(attempt) {
  if (attempt.response === null) return { mark: '—', className: 'trn-muted', label: 'Not reached' };
  return attempt.isCorrect
    ? { mark: '✓', className: 'trn-ok', label: 'Correct' }
    : { mark: '✗', className: 'trn-bad', label: 'Wrong' };
}

// Question-by-question review used by the results screen and the game detail page.
export default function ReviewTable({ attempts }) {
  return (
    <div className="trn-table-wrap">
      <table className="trn-table">
        <thead>
          <tr>
            <th scope="col">#</th><th scope="col">Question</th><th scope="col">Your answer</th>
            <th scope="col">Correct answer</th><th scope="col">Result</th><th scope="col">Time</th>
          </tr>
        </thead>
        <tbody>
          {attempts.map((a) => {
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
  );
}
