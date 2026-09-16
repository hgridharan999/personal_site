// src/private/trainers/poker/ui/table/TableView.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TableArt from '../sprites/TableArt';
import Seat, { BetChips } from './Seat';
import Board from './Board';
import { seatViews, tableCenter, streetKey, chipsToCollect } from '../../lib/tableView.js';
import './table.css';

// Bets swept off the table when a street closes; each flies to the pot and is removed when its
// animation ends. Chips from an earlier sweep that are still in flight are kept, not replaced, so
// they aren't unmounted mid-animation. Under reduced motion the pk-fly animation is disabled in CSS,
// so onAnimationEnd never fires there: those chips are cleared right away instead of piling up.
function useFlyingChips(key, seats) {
  const prev = useRef(null);
  const [flying, setFlying] = useState([]);
  const landed = useCallback((id) => setFlying((list) => list.filter((chip) => chip.id !== id)), []);
  useEffect(() => {
    const swept = chipsToCollect(prev.current, { key, seats });
    prev.current = { key, seats };
    if (swept.length === 0) return undefined;
    const newChips = swept.map((chip) => ({ ...chip, id: `${key}-${chip.slot}` }));
    setFlying((current) => [...current, ...newChips]);
    const reducedMotion = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reducedMotion) return undefined;
    const newIds = new Set(newChips.map((chip) => chip.id));
    const timer = setTimeout(() => setFlying((current) => current.filter((chip) => !newIds.has(chip.id))), 0);
    return () => clearTimeout(timer);
  }, [key, seats]);
  return [flying, landed];
}

/** The pixel table with seats, bets, board and pot. Pure rendering of a TableSession. */
export default function TableView({ session }) {
  const seats = useMemo(() => seatViews(session), [session]);
  const center = useMemo(() => tableCenter(session), [session]);
  const [flying, landed] = useFlyingChips(streetKey(session), seats);

  return (
    <div className="pk-table">
      <TableArt />
      {seats.map((seat) => <Seat key={seat.seat} seat={seat} handNo={center.handNo} />)}
      <Board board={center.board} pot={center.pot} handNo={center.handNo} />
      {flying.map((chip) => (
        <BetChips key={chip.id} amount={chip.amount} slot={chip.slot} className="pk-fly" onAnimationEnd={() => landed(chip.id)} />
      ))}
    </div>
  );
}
