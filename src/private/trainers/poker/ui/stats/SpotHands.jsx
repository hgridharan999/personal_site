import { Link } from 'react-router-dom';
import { getPokerSpotHands } from '../../lib/persistence/api.js';
import { usePokerResource } from '../shared/usePokerResource.js';
import { STATS_HREF, spotHandsView } from './statsView';
import StatsPanel from './StatsPanel';

const LOGIN_FROM = STATS_HREF;
const loadSpotHands = (spot) => getPokerSpotHands(spot);

/** The hand list filtered to one spot (the focus card's link), newest first. */
export default function SpotHands({ spot }) {
  const { status, data, error, reload } = usePokerResource(loadSpotHands, spot, LOGIN_FROM);
  const view = data ? spotHandsView(data) : null;
  const title = view ? `Hands · ${view.label}` : 'Hands in this spot';

  return (
    <StatsPanel id="pk-spot" title={title} wide status={status} error={error} onRetry={reload} view={view}>
      {(v) => (
        <div className="pk-table-wrap">
          <table className="pk-datatable">
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Hand</th>
                <th scope="col">Decisions</th>
                <th scope="col">EV lost</th>
                <th scope="col">Worst grade</th>
                <th scope="col">Net</th>
                <th scope="col"><span className="pk-sr-only">Replay</span></th>
              </tr>
            </thead>
            <tbody>
              {v.rows.map((r) => (
                <tr key={r.key}>
                  <td>{r.day}</td>
                  <th scope="row">#{r.handNo}</th>
                  <td>{r.decisions}</td>
                  <td>{r.evLossText}</td>
                  <td>{r.gradeText}</td>
                  <td>{r.netText}</td>
                  <td><Link to={r.href} data-hot>Replay</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </StatsPanel>
  );
}
