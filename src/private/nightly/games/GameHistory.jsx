import { formatScore, historyGrid } from './gamesLogic';

// UTC, as in site/format.js: a night string is a calendar date, not a moment.
const SHORT_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const shortDate = (night) => SHORT_DATE.format(new Date(`${night}T00:00:00Z`));

function Cell({ value, decimals }) {
  if (value === null) {
    return (
      <td className="nt-games-empty">
        <span aria-hidden="true">·</span><span className="sr-only">none</span>
      </td>
    );
  }
  return <td>{formatScore(value, decimals)}</td>;
}

/** Every puzzle and game over the last 14 nights, oldest first. It scrolls sideways on a phone. */
export default function GameHistory({ payload }) {
  const { nights, rows } = historyGrid(payload);
  const decimals = new Map((payload.catalog ?? []).map((g) => [g.key, g.decimals]));
  return (
    <div className="nt-games-sub">
      <div className="nt-games-scroll" tabIndex={0} role="region" aria-label="Last 14 nights, scrolls sideways">
        <table className="nt-games-table">
          <caption className="head">Last 14 nights</caption>
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">Game</span></th>
              {nights.map((n) => (
                <th key={n} scope="col"><time dateTime={n}>{shortDate(n)}</time></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row">
                  {r.name}<span className="nt-games-unit"> {r.unit}</span>
                </th>
                {r.cells.map((v, i) => <Cell key={nights[i]} value={v} decimals={decimals.get(r.key) ?? 0} />)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
