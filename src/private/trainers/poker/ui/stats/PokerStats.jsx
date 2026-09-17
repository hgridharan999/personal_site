import { useMemo } from 'react';
import { getPokerStats } from '../../lib/persistence/api.js';
import { usePokerResource } from '../shared/usePokerResource.js';
import { focusView, leaksView, trendView } from './statsView';
import StatsPanel from './StatsPanel';
import FocusCard from './FocusCard';
import LeaksPanel from './LeaksPanel';
import TrendPanel from './TrendPanel';
import '../../../trainers.css';
import './stats.css';

const LOGIN_FROM = '/me/poker?tab=stats';
const loadStats = () => getPokerStats();

/** The Stats tab: long-term leak tracker (spec §7.4). */
export default function PokerStats() {
  const { status, data, error, reload } = usePokerResource(loadStats, 'stats', LOGIN_FROM);
  const views = useMemo(
    () => (data ? { focus: focusView(data), leaks: leaksView(data), trend: trendView(data) } : null),
    [data],
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
      <StatsPanel id="pk-focus" title="Focus" wide {...panel} view={views?.focus}>
        {(view) => <FocusCard view={view} />}
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
