import { Link } from 'react-router-dom';
import { costliestView } from './reviewView.js';

export default function CostliestDecisions({ costliest }) {
  const items = costliestView(costliest);
  return (
    <section className="pk-box" aria-labelledby="pk-review-costliest">
      <h2 id="pk-review-costliest" className="pk-h2">Costliest decisions</h2>
      {items.length === 0 ? (
        <p className="pk-muted">No decision in this session lost EV.</p>
      ) : (
        <ol className="pk-review__costliest">
          {items.map((item) => (
            <li key={item.key}>
              <Link to={item.href} className="pk-review__link" data-hot>{item.title}</Link>
              <span>{item.actionText}</span>
              <span>{item.gradeText} · lost {item.lossText}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
