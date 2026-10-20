import { useEffect, useState } from 'react';
import { getStats } from '../../utils/climateApi';
import { formatMonthYear } from '../format';
import { topVerticals } from './search';

// 'loading' | 'failed' | the stats object. One value, so a late response cannot leave two
// states half set.
function useStats() {
  const [stats, setStats] = useState('loading');
  useEffect(() => {
    let live = true; // the page can unmount before the API answers
    getStats().then(
      (data) => live && setStats(data ?? 'failed'),
      () => live && setStats('failed'),
    );
    return () => { live = false; };
  }, []);
  return stats;
}

function Skeleton() {
  return (
    <div aria-hidden="true">
      <span className="sp-skel" />
      <span className="sp-skel sp-skel--short" />
      <span className="sp-skel" />
    </div>
  );
}

/** About the index: how many startups, which verticals are biggest, when it was built. */
export default function Stats() {
  const stats = useStats();
  // The numbers are decoration next to the search, so a failed request shows nothing rather than
  // a panel of zeros (the old page showed "0 startups" on failure).
  if (stats === 'failed') return null;

  const loading = stats === 'loading';
  const rows = loading ? [] : topVerticals(stats.verticals);
  return (
    <section aria-labelledby="sp-db-title" aria-busy={loading}>
      <h2 className="head" id="sp-db-title">Database</h2>
      {loading ? <Skeleton /> : (
        <>
          <p className="sp-status">Startups indexed</p>
          <p className="sp-total">{Number(stats.total_startups ?? 0).toLocaleString('en-US')}</p>
          {rows.length > 0 && (
            <>
              <p className="sp-status sp-stats-gap">Top verticals</p>
              <ul className="sp-bars" role="list">
                {rows.map(({ id, name, count, share }) => (
                  <li key={id}>
                    <span className="sp-bar-name">{name}</span>
                    <span className="sp-bar-count">{count}</span>
                    <span className="sp-bar" aria-hidden="true" style={{ '--share': `${share}%` }} />
                  </li>
                ))}
              </ul>
            </>
          )}
          {stats.last_updated && (
            <p className="sp-status sp-stats-gap">Updated {formatMonthYear(stats.last_updated)}</p>
          )}
        </>
      )}
    </section>
  );
}
