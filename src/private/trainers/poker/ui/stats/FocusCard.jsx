import { Link } from 'react-router-dom';
import Kpi from '../../../lib/Kpi';

/** The top leak in plain language, linking to every hand in that spot (spec §7.4 focus). */
export default function FocusCard({ view }) {
  return (
    <div className="pk-focus">
      <p className="pk-focus__label">{view.label}</p>
      <h3 className="pk-focus__title">{view.title}</h3>
      <p className="pk-focus__body">{view.body}</p>
      <dl className="trn-kpis">
        <Kpi label="Lost" value={view.rateText} hint="per 100 reviewed hands" />
        <Kpi label="Decisions" value={view.decisions} hint="confident grades" />
      </dl>
      <div className="pk-focus__actions">
        <Link to={view.href} className="pk-btn pk-btn--raise" data-hot>See hands in this spot</Link>
        {view.examples.map((ex) => (
          <Link key={ex.id} to={ex.href} className="pk-example" data-hot>{ex.label}</Link>
        ))}
      </div>
    </div>
  );
}
