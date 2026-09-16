// src/private/trainers/poker/ui/table/RebuyBanner.jsx
import { canRebuy } from '../../lib/tableCore.js';
import { formatBb } from '../../lib/format.js';
import { BUY_IN } from '../../lib/constants.js';

/** Rebuy prompt: forced at 0 chips, offered under 40 BB, and a note while a rebuy is queued. */
export default function RebuyBanner({ session, onRebuy, onGetUp }) {
  const stack = session.seats.find((s) => s.seat === session.heroSeat).stack;
  const topUp = `${formatBb(BUY_IN)} BB`;

  if (session.phase === 'needsRebuy') {
    return (
      <div className="pk-banner" role="alert">
        <p>You&apos;re out of chips. Rebuy to {topUp} or get up.</p>
        <div className="pk-banner__actions">
          <button type="button" className="pk-btn pk-btn--raise" data-hot onClick={onRebuy}>Rebuy</button>
          <button type="button" className="pk-btn pk-btn--fold" data-hot onClick={onGetUp}>Get up</button>
        </div>
      </div>
    );
  }
  if (session.rebuyPending) {
    return <div className="pk-banner" role="status"><p>Rebuy queued: you top up to {topUp} after this hand.</p></div>;
  }
  if (!canRebuy(session)) return null;
  const when = session.phase === 'playing' ? 'after this hand' : 'now';
  return (
    <div className="pk-banner" role="status">
      <p>You&apos;re under 40 BB ({formatBb(stack)} BB). Rebuy to {topUp} {when}?</p>
      <div className="pk-banner__actions">
        <button type="button" className="pk-btn pk-btn--raise" data-hot onClick={onRebuy}>Rebuy</button>
      </div>
    </div>
  );
}
