import TableArt from '../sprites/TableArt';
import Seat from '../table/Seat';
import Board from '../table/Board';
import '../table/table.css';

/**
 * The Phase 2 pixel table drawn from a replay frame (no chip animations).
 * `.pk-table` sizes itself from container-query units, which need a real ancestor
 * container (`container-type: size` with a resolved height) or `160cqh` collapses to
 * zero — the table page gets that from its 100dvh flex layout, so the replayer wraps
 * the table in its own sized region instead (`.pk-replay__table-region`, replayer.css).
 */
export default function ReplayTable({ frame, handNo }) {
  return (
    <div className="pk-replay__table-region">
      <div className="pk-table">
        <TableArt />
        {frame.seats.map((seat) => <Seat key={seat.seat} seat={seat} handNo={handNo} />)}
        <Board board={frame.center.board} pot={frame.center.pot} handNo={handNo} />
      </div>
    </div>
  );
}
