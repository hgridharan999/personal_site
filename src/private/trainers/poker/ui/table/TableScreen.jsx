// src/private/trainers/poker/ui/table/TableScreen.jsx
import { useEffect, useMemo } from 'react';
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
 * A running table session: the table, the hero's controls, the log and the end-of-session panel.
 * `session` here is the hero-safe snapshot from useTableSession, not the driver's raw session.
 */
export default function TableScreen({ id, config, profile, onSessionStart, onHandComplete, onSessionEnd }) {
  const navigate = useNavigate();
  const { session, act, rebuy, getUp } = useTableSession({ id, config, profile, onSessionStart, onHandComplete, onSessionEnd });
  const turn = useMemo(() => (session ? heroTurn(session) : null), [session]);
  const turnKey = session?.hand ? `${session.hand.no}:${session.hand.eventCount}` : '';
  const { sizing, dispatch } = useHeroControls({ turn, turnKey, onAct: act });
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
        <p className="pk-muted" role="status">Shuffling up</p>
      </PokerShell>
    );
  }

  const midHand = session.phase === 'playing';
  const getUpText = midHand ? 'Get up after this hand' : 'Get up';

  return (
    <PokerShell back={LOBBY} onBack={onBack}>
      <div className="pk-tablepage">
        <div className="pk-tablepage__main">
          <TableView session={session} />
          {session.phase === 'ended' ? (
            <SessionEnd session={session} />
          ) : (
            <>
              <RebuyBanner session={session} onRebuy={rebuy} onGetUp={getUp} />
              <ActionBar turn={turn} sizing={sizing} dispatch={dispatch} />
              <div className="pk-tablepage__meta">
                <button type="button" className="pk-btn pk-btn--fold" data-hot disabled={session.getUpPending} onClick={getUp}>
                  {session.getUpPending ? 'Leaving after this hand' : getUpText}
                </button>
              </div>
            </>
          )}
        </div>
        <ActionLog session={session} yourTurn={Boolean(turn)} />
      </div>
    </PokerShell>
  );
}
