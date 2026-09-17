import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DEFAULT_FILTERS, matchesFilters, positionsIn, handRowView } from './reviewView.js';

const TOGGLES = [
  { key: 'mistakesOnly', label: 'Mistakes only' },
  { key: 'bigPots', label: 'Big pots (over 30 BB)' },
  { key: 'showdowns', label: 'Showdowns' },
];

function Filters({ filters, setFilters, positions }) {
  return (
    <fieldset className="pk-review__filters">
      <legend className="pk-sr-only">Filter hands</legend>
      {TOGGLES.map(({ key, label }) => (
        <label key={key} className="pk-radio">
          <input type="checkbox" checked={filters[key]} onChange={(e) => setFilters({ ...filters, [key]: e.target.checked })} />
          {label}
        </label>
      ))}
      <label className="pk-radio">
        Position
        <select className="pk-select" value={filters.position} onChange={(e) => setFilters({ ...filters, position: e.target.value })}>
          <option value="all">All</option>
          {positions.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
    </fieldset>
  );
}

export default function HandList({ hands, hasMore, onLoadMore, loadingMore, moreError }) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const positions = useMemo(() => positionsIn(hands), [hands]);
  const rows = useMemo(() => hands.filter((h) => matchesFilters(h, filters)).map(handRowView), [hands, filters]);
  return (
    <section className="pk-box pk-review__hands" aria-labelledby="pk-review-hands">
      <h2 id="pk-review-hands" className="pk-h2">Hands</h2>
      <Filters filters={filters} setFilters={setFilters} positions={positions} />
      {rows.length === 0 ? (
        <p className="pk-muted" role="status">No hands match these filters.</p>
      ) : (
        <div className="pk-review__scroll">
          <table className="pk-review__table">
            <caption className="pk-sr-only">Hands in this session</caption>
            <thead>
              <tr><th scope="col">Hand</th><th scope="col">Pos</th><th scope="col">Cards</th><th scope="col">Board</th><th scope="col">Pot</th><th scope="col">Net</th><th scope="col">Grade</th><th scope="col">EV lost</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td><Link to={r.href} className="pk-review__link" data-hot>#{r.handNo}</Link></td>
                  <td>{r.position}</td><td>{r.cards}</td><td>{r.board}</td><td>{r.pot}</td><td>{r.net}</td><td>{r.grade}</td><td>{r.loss}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {moreError && <p className="pk-error" role="alert">Couldn&apos;t load more hands: {moreError}</p>}
      {hasMore && (
        <button type="button" className="pk-btn" data-hot disabled={loadingMore} onClick={onLoadMore}>
          {loadingMore ? 'Loading…' : 'Load more hands'}
        </button>
      )}
    </section>
  );
}
