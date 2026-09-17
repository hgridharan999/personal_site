import PokerShell from '../../ui/PokerShell';
import { pokerPersistence } from './pokerOutboxInstance.js';
import { usePokerSaveStatus } from './usePokerSaveStatus.js';
import { usePokerProfile } from './usePokerProfile.js';
import PokerSaveStatus from './PokerSaveStatus.jsx';

const LOBBY = { to: '/me/poker', label: 'Lobby' };

/** Gives the Phase 2 table page its persistence props (contracts §4) and the loaded profile. */
export function withPokerPersistence(TablePage) {
  function PersistedTable(props) {
    const save = usePokerSaveStatus();
    const { status, profile } = usePokerProfile();
    // The table reads `profile` once when its session starts, so it mounts only after the load settles.
    if (status === 'loading') {
      return (
        <PokerShell back={LOBBY}>
          <p className="pk-muted" role="status">Loading your profile…</p>
        </PokerShell>
      );
    }
    return (
      <TablePage
        {...props}
        profile={profile}
        onSessionStart={pokerPersistence.onSessionStart}
        onHandComplete={pokerPersistence.onHandComplete}
        onSessionEnd={pokerPersistence.onSessionEnd}
      >
        <PokerSaveStatus save={save} />
      </TablePage>
    );
  }
  PersistedTable.displayName = `withPokerPersistence(${TablePage.displayName || TablePage.name || 'TablePage'})`;
  return PersistedTable;
}
