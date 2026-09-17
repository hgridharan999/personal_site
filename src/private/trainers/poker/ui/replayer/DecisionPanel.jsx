import { explainDecision, optionLabel, formatEv } from '../../analysis/explain.js';
import { optionKey } from '../../analysis/options.js';
import { chartForDecision } from './replayModel.js';
import { gradeText, bbText } from '../review/reviewView.js';

function EvTable({ decision }) {
  const chosen = optionKey(decision.action, decision.size);
  const best = optionKey(decision.recommended.action, decision.recommended.size);
  const rows = Object.entries(decision.recommended.evByOption).sort(([, a], [, b]) => b - a);
  if (rows.length === 0) return <p className="pk-muted">Graded by the preflop chart, so there are no simulated EVs.</p>;
  return (
    <table className="pk-replay__ev">
      <caption className="pk-sr-only">EV by option</caption>
      <thead><tr><th scope="col">Option</th><th scope="col">EV</th><th scope="col"><span className="pk-sr-only">Notes</span></th></tr></thead>
      <tbody>
        {rows.map(([key, ev]) => (
          <tr key={key} className={key === chosen ? 'pk-replay__chosen' : undefined}>
            <td>{optionLabel(key)}</td>
            <td>{formatEv(ev)}</td>
            <td>{[key === best && 'best', key === chosen && 'your play'].filter(Boolean).join(', ')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Grade, recommended action, EV by option and explanation for one hero decision (spec §7.3). */
export default function DecisionPanel({ hand, decision }) {
  if (!decision) {
    return (
      <section className="pk-box pk-replay__decision" aria-labelledby="pk-replay-decision">
        <h2 id="pk-replay-decision" className="pk-h2">Decision</h2>
        <p className="pk-muted">Step to one of your actions to see its grade.</p>
      </section>
    );
  }
  const chart = chartForDecision(hand, decision);
  return (
    <section className="pk-box pk-replay__decision" aria-labelledby="pk-replay-decision">
      <h2 id="pk-replay-decision" className="pk-h2">Your decision</h2>
      <p className={`pk-grade pk-grade--${decision.grade}`}>{gradeText(decision.grade, decision.confident)}</p>
      <p>
        You: {optionLabel(optionKey(decision.action, decision.size))} · Best: {optionLabel(optionKey(decision.recommended.action, decision.recommended.size))}
        {decision.evLoss > 0 && ` · Lost ${bbText(decision.evLoss)}`}
      </p>
      <EvTable decision={decision} />
      <p className="pk-replay__explain">{explainDecision(decision, { chart })}</p>
    </section>
  );
}
