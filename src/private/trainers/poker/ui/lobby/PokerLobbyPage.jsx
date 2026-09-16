import { useSearchParams } from 'react-router-dom';
import PokerShell from '../PokerShell';
import PlayTab from './PlayTab';
import StatsTab from './StatsTab';

const TABS = [
  { key: 'play', label: 'Play' },
  { key: 'stats', label: 'Stats' },
];

/** Route: /me/poker (Play) and /me/poker?tab=stats (Stats). */
export default function PokerLobbyPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'stats' ? 'stats' : 'play';
  const select = (key) => setParams(key === 'play' ? {} : { tab: key }, { replace: true });

  return (
    <PokerShell>
      <header className="pk-head">
        <h1 className="pk-title">Poker</h1>
        <p className="pk-muted">6-max No-Limit Hold&apos;em &middot; you and 5 bots</p>
        <div className="pk-tabs" role="tablist" aria-label="Poker views">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`pk-tab-${key}`}
              aria-selected={tab === key}
              aria-controls="pk-panel"
              data-hot
              className="pk-tab"
              onClick={() => select(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      <section id="pk-panel" role="tabpanel" aria-labelledby={`pk-tab-${tab}`} className="pk-panel">
        {tab === 'play' ? <PlayTab /> : <StatsTab />}
      </section>
    </PokerShell>
  );
}
