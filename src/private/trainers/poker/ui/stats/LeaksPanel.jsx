import { Link } from 'react-router-dom';
import BarList from '../../../stats/charts/BarList';

/** Spots ranked by BB lost per 100 hands (single-hue bars), with a table view and example hands. */
export default function LeaksPanel({ view }) {
  return (
    <div className="pk-leaks">
      <p className="pk-muted">BB lost per 100 reviewed hands, from confident grades only.</p>
      <BarList label="BB lost per 100 hands by spot" items={view.items} />
      <details className="pk-details">
        <summary>Table and example hands</summary>
        <div className="pk-table-wrap">
          <table className="pk-datatable">
            <thead>
              <tr>
                <th scope="col">Spot</th>
                <th scope="col">Lost</th>
                <th scope="col">Decisions</th>
                <th scope="col">Mistakes</th>
                <th scope="col">Per decision</th>
                <th scope="col">Examples</th>
              </tr>
            </thead>
            <tbody>
              {view.items.map((item) => (
                <tr key={item.key}>
                  <th scope="row"><Link to={item.href} data-hot>{item.label}</Link></th>
                  <td>{item.display}</td>
                  <td>{item.decisions}</td>
                  <td>{item.mistakes}</td>
                  <td>{item.perDecisionText}</td>
                  <td>
                    {item.examples.map((ex) => (
                      <Link key={ex.id} to={ex.href} className="pk-example" data-hot>{ex.label}</Link>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
