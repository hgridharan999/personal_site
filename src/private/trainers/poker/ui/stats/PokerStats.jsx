import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getPokerStats } from '../../lib/persistence/api.js';
import { usePokerResource } from '../shared/usePokerResource.js';
import { OVERALL, focusView, leaksView, tendenciesView, trendView } from './statsView';
import StatsPanel from './StatsPanel';
import FocusCard from './FocusCard';
import TendenciesPanel from './TendenciesPanel';
import LeaksPanel from './LeaksPanel';
import TrendPanel from './TrendPanel';
import SpotHands from './SpotHands';
import '../../../trainers.css';
import './stats.css';

const LOGIN_FROM = '/me/poker?tab=stats';
const loadStats = () => getPokerStats();

/** The Stats tab: long-term leak tracker (spec §7.4). `?spot=` adds that spot's hand list on top. */
export default function PokerStats() {
  const [params] = useSearchParams();
  const spot = params.get('spot');
  const [position, setPosition] = useState(OVERALL);
  const { status, data, error, reload } = usePokerResource(loadStats, 'stats', LOGIN_FROM);
  const views = useMemo(
    () => (data
      ? { focus: focusView(data), tendencies: tendenciesView(data, position), leaks: leaksView(data), trend: trendView(data) }
      : null),
    [data, position],
  );
  const panel = { status, error, onRetry: reload };

  return (
    <div className="pk-stats">
      {status === 'error' && data && (
        <div className="pk-panel-msg pk-stats__wide">
          <p className="pk-error" role="alert">Couldn&apos;t refresh stats: {error}</p>
          <button type="button" className="pk-btn" data-hot onClick={reload}>Retry</button>
        </div>
      )}
      {spot && (
        <>
          <p className="pk-stats__wide">
            <Link to="/me/poker?tab=stats" className="pk-btn" data-hot>All stats</Link>
          </p>
          <SpotHands spot={spot} />
        </>
      )}
      <StatsPanel id="pk-focus" title="Focus" wide {...panel} view={views?.focus}>
        {(view) => <FocusCard view={view} />}
      </StatsPanel>
      <StatsPanel id="pk-tendencies" title="Tendencies" {...panel} view={views?.tendencies}>
        {(view) => <TendenciesPanel view={view} onPosition={setPosition} />}
      </StatsPanel>
      <StatsPanel id="pk-leaks" title="Leaks" {...panel} view={views?.leaks}>
        {(view) => <LeaksPanel view={view} />}
      </StatsPanel>
      <StatsPanel id="pk-trend" title="Trend" wide {...panel} view={views?.trend}>
        {(view) => <TrendPanel view={view} />}
      </StatsPanel>
    </div>
  );
}
