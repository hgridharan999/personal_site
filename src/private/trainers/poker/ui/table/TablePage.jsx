// src/private/trainers/poker/ui/table/TablePage.jsx
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import PokerShell from '../PokerShell';
import TableScreen from './TableScreen';
import { listPersonas } from '../../bots/personas.js';
import { parseTableConfig } from '../../lib/lineup.js';

const noop = () => {};

/**
 * Route: /me/poker/table/:sessionId. The lobby passes { tableMode, lineup, speed } as router state.
 * Session callbacks (contracts §4) default to no-ops and `profile` (contracts §4.1) to null;
 * Phase 4 wires persistence and the loaded profile through them. `children` (e.g. Phase 4's save status)
 * render inside the poker frame, above the table.
 */
export default function TablePage({
  profile = null, onSessionStart = noop, onHandComplete = noop, onSessionEnd = noop, children = null,
}) {
  const { sessionId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  // Read once: the router state is cleared below so a reload cannot restart the same session id.
  const [config] = useState(() => parseTableConfig(location.state, listPersonas()));

  useEffect(() => {
    if (location.state) navigate(location.pathname, { replace: true, state: null });
    // Runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!config) {
    return (
      <PokerShell back={{ to: '/me/poker', label: 'Lobby' }}>
        <div className="pk-closed">
          <h1 className="pk-title">Table closed</h1>
          <p className="pk-muted">This table is no longer running. Sessions are not saved yet, so a reloaded table cannot be resumed.</p>
          <Link to="/me/poker" className="pk-btn pk-btn--raise" data-hot>Back to the lobby</Link>
        </div>
      </PokerShell>
    );
  }

  return (
    <TableScreen
      key={sessionId}
      id={sessionId}
      config={config}
      profile={profile}
      onSessionStart={onSessionStart}
      onHandComplete={onHandComplete}
      onSessionEnd={onSessionEnd}
    >
      {children}
    </TableScreen>
  );
}
