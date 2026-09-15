import { lazy, Suspense, useCallback, useEffect, useRef } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import PrivateShell from '../PrivateShell';
import { useOutboxStatus } from './lib/useOutboxStatus';
import './trainers.css';

const TRAINERS = {
  zetamac: {
    title: 'Zetamac',
    Play: lazy(() => import('./zetamac/ZetamacPlay')),
    Stats: lazy(() => import('./stats/ZetamacStats')),
  },
  optiver: {
    title: '80 in 8',
    Play: lazy(() => import('./optiver/OptiverPlay')),
    Stats: lazy(() => import('./stats/OptiverStats')),
  },
};

const TABS = ['play', 'stats'];
const LEAVE_MESSAGE = "Leave this game? It won't be saved.";

export default function TrainerPage() {
  const { trainer } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const busy = useRef(false);
  const { pendingIds, failed } = useOutboxStatus();

  const onBusyChange = useCallback((value) => { busy.current = value; }, []);

  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (!busy.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const config = TRAINERS[trainer];
  if (!config) return <Navigate to="/me" replace />;

  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'play';
  const confirmLeave = () => !busy.current || window.confirm(LEAVE_MESSAGE);

  const selectTab = (next) => {
    if (next === tab || !confirmLeave()) return;
    busy.current = false;
    setParams(next === 'play' ? {} : { tab: next }, { replace: true });
  };

  const onBack = (e) => {
    e.preventDefault();
    if (!confirmLeave()) return;
    busy.current = false;
    navigate('/me');
  };

  const { Play, Stats, title } = config;

  return (
    <PrivateShell>
      <div className="asc-topbar">
        <Link to="/me" onClick={onBack} data-hot className="asc-back asc-mono">
          <ArrowLeft size={14} /> <span className="b-name">Base Camp</span>
        </Link>
      </div>

      <main className="asc-wrap trn-page">
        <header className="trn-head">
          <div>
            <h1 className="asc-h">{title}</h1>
            {pendingIds.length > 0 && (
              <p className="trn-sync" role="status">{pendingIds.length} game{pendingIds.length === 1 ? '' : 's'} waiting to sync</p>
            )}
            {failed.length > 0 && (
              <p className="trn-sync trn-sync--failed" role="alert">
                {failed.length} game{failed.length === 1 ? '' : 's'} could not be saved: {failed[0].lastError}
              </p>
            )}
          </div>
          <div className="trn-tabs" role="tablist" aria-label={`${title} views`}>
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                id={`trn-tab-${t}`}
                aria-selected={tab === t}
                aria-controls="trn-panel"
                data-hot
                className="trn-tab"
                onClick={() => selectTab(t)}
              >
                {t === 'play' ? 'Play' : 'Stats'}
              </button>
            ))}
          </div>
        </header>

        <section id="trn-panel" role="tabpanel" aria-labelledby={`trn-tab-${tab}`} className="trn-body">
          <Suspense fallback={<p className="trn-muted asc-mono" role="status">Loading…</p>}>
            {tab === 'play' ? <Play key={trainer} onBusyChange={onBusyChange} /> : <Stats key={trainer} />}
          </Suspense>
        </section>
      </main>
    </PrivateShell>
  );
}
