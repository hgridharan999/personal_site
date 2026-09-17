import { summaryView } from './reviewView.js';

/** Hands, net, all-in adjusted net, EV lost per 100 decisions and the count by grade (spec §7.2). */
export default function ReviewSummary({ summary }) {
  const view = summaryView(summary);
  return (
    <section className="pk-box pk-review__summary" aria-labelledby="pk-review-summary">
      <h2 id="pk-review-summary" className="pk-h2">Summary</h2>
      <dl className="pk-review__tiles">
        {view.tiles.map((tile) => (
          <div key={tile.key}>
            <dt>{tile.label}</dt>
            <dd>{tile.value}</dd>
          </div>
        ))}
      </dl>
      {view.decisions === 0 ? (
        <p className="pk-muted">No graded decisions yet.</p>
      ) : (
        <ul className="pk-review__grades" aria-label="Decisions by grade">
          {view.grades.map((g) => (
            <li key={g.grade} className={`pk-grade pk-grade--${g.grade}`}>{g.label}: {g.count}</li>
          ))}
          <li className="pk-muted">Debatable: {view.debatable} (not counted as leaks)</li>
        </ul>
      )}
    </section>
  );
}
