// src/private/trainers/poker/ui/table/Board.jsx
import Card from '../sprites/Card';
import { formatBb } from '../../lib/format.js';

const BOARD_SLOTS = [0, 1, 2, 3, 4];

/** Community cards (empty outlines for undealt ones) and the pot. */
export default function Board({ board, pot, handNo }) {
  return (
    <div className="pk-board">
      <div className="pk-board__cards" role="group" aria-label={board.length ? 'Board' : 'Board, no cards yet'}>
        {BOARD_SLOTS.map((i) => (i < board.length
          ? <Card key={`${handNo}-${board[i]}`} card={board[i]} className="pk-card--deal" />
          : <div key={`slot-${i}`} className="pk-card-slot" aria-hidden="true" />))}
      </div>
      {pot > 0 && <div key={`${handNo}-${pot}`} className="pk-pot">Pot {formatBb(pot)} BB</div>}
    </div>
  );
}
