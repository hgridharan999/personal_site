// src/private/trainers/poker/ui/table/TableScreen.jsx
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import PokerShell from '../PokerShell';
import TableView from './TableView';
import ActionBar from './ActionBar';
import ActionLog from './ActionLog';
import RebuyBanner from './RebuyBanner';
import SessionEnd from './SessionEnd';
import { useHeroControls } from './useHeroControls';
import { useTableSession } from '../../lib/useTableSession.js';
import { heroTurn } from '../../lib/tableView.js';

const LOBBY = { to: '/me/poker', label: 'Lobby' };
const LEAVE_MESSAGE = 'Leave the table? The session ends now and the hand in progress is discarded.';

/**
 * The hero's act, then focus on the table region when focus was on an action control (which unmounts
 * once the turn passes) or nowhere, so keyboard focus never drops to <body>.
 */
function useActAndRefocus(act) {
  const region = useRef(null);
  const onAct = useCallback((choice) => {
    const active = document.activeElement;
    const lost = !active || active === document.body || Boolean(active.closest('.pk-actions'));
    act(choice);
    if (lost) region.current?.focus({ preventScroll: true });
  }, [act]);
  return [region, onAct];
}

/**
 * A running table session: the table, the hero's controls, the log and the end-of-session panel.
 * `session` here is the hero-safe snapshot from useTableSession, not the driver's raw session.
 * `children` (TablePage's, e.g. save status) render above the table.
 */
export default function TableScreen({ id, config, profile, onSessionStart, onHandComplete, onSessionEnd, children }) {
  const navigate = useNavigate();
  const { session, act, rebuy, getUp } = useTableSession({ id, config, profile, onSessionStart, onHandComplete, onSessionEnd });
  const turn = useMemo(() => (session ? heroTurn(session) : null), [session]);
  const turnKey = session?.hand ? `${session.hand.no}:${session.hand.eventCount}` : '';
  const [tableRegion, onAct] = useActAndRefocus(act);
  const { sizing, dispatch } = useHeroControls({ turn, turnKey, onAct });
  const live = Boolean(session) && session.phase !== 'ended';

  useEffect(() => {
    if (!live) return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [live]);

  const onBack = (e) => {
    e.preventDefault();
    if (live && !window.confirm(LEAVE_MESSAGE)) return;
    navigate(LOBBY.to);
  };

  if (!session) {
    return (
      <PokerShell back={LOBBY} onBack={onBack}>
        {children}
        <p className="pk-muted" role="status">Shuffling up</p>
      </PokerShell>
    );
  }

  const midHand = session.phase === 'playing';
  const getUpText = midHand ? 'Get up after this hand' : 'Get up';

  return (
    <PokerShell back={LOBBY} onBack={onBack}>
      {children}
      <div className="pk-tablepage">
        <div className="pk-tablepage__main">
          {session.phase === 'ended' ? (
            <SessionEnd session={session} />
          ) : (
            <>
              <div className="pk-tablepage__meta">
                <button type="button" className="pk-btn pk-btn--fold" data-hot disabled={session.getUpPending} onClick={getUp}>
                  {session.getUpPending ? 'Leaving after this hand' : getUpText}
                </button>
              </div>
              <div ref={tableRegion} className="pk-table-region" tabIndex={-1} role="region" aria-label="Poker table">
                <TableView session={session} />
              </div>
              <RebuyBanner session={session} onRebuy={rebuy} onGetUp={getUp} />
              <ActionBar turn={turn} sizing={sizing} dispatch={dispatch} />
            </>
          )}
        </div>
        <ActionLog session={session} yourTurn={Boolean(turn)} />
      </div>
    </PokerShell>
  );
}
