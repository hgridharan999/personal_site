// src/private/trainers/poker/ui/table/TableView.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TableArt from '../sprites/TableArt';
import Seat, { BetChips } from './Seat';
import Board from './Board';
import { seatViews, tableCenter, streetKey, chipsToCollect } from '../../lib/tableView.js';
import './table.css';

// Bets swept off the table when a street closes; each flies to the pot and is removed when its animation ends.
function useFlyingChips(key, seats) {
  const prev = useRef(null);
  const [flying, setFlying] = useState([]);
  useEffect(() => {
    const swept = chipsToCollect(prev.current, { key, seats });
    prev.current = { key, seats };
    if (swept.length > 0) setFlying(swept.map((chip) => ({ ...chip, id: `${key}-${chip.slot}` })));
  }, [key, seats]);
  const landed = useCallback((id) => setFlying((list) => list.filter((chip) => chip.id !== id)), []);
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
