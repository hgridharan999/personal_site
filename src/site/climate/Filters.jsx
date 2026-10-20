import { VERTICALS, activeCount, cleanYear } from './search';

const YEARS = [
  { key: 'yearMin', label: 'From', placeholder: '2000' },
  { key: 'yearMax', label: 'To', placeholder: String(new Date().getFullYear()) },
];

/**
 * Vertical chips and a founded-year range. It holds no state of its own: the page owns the form,
 * so this can be mounted in the aside or in the phone disclosure and move between them without
 * losing a selection. Ids are fixed because it is only ever mounted once.
 */
export default function Filters({ form, showTitle, onChange, onClear }) {
  const toggleVertical = (id) => onChange({ ...form, vertical: form.vertical === id ? null : id });

  return (
    <div className="sp-filters">
      <div className="sp-filters-top">
        {/* The phone disclosure's summary already says "Filters", so only the aside repeats it. */}
        {showTitle && <h2 className="head">Filters</h2>}
        {activeCount(form) > 0 && (
          <button type="button" className="sp-clear" onClick={onClear}>Clear all</button>
        )}
      </div>

      <div role="group" aria-labelledby="sp-verticals-label">
        <p className="head sp-group" id="sp-verticals-label">Climate verticals</p>
        <ul className="sp-chips" role="list">
          {VERTICALS.map(({ id, name }) => (
            <li key={id}>
              <button
                type="button"
                className="sp-chip"
                aria-pressed={form.vertical === id}
                onClick={() => toggleVertical(id)}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div role="group" aria-labelledby="sp-founded-label">
        <p className="head sp-group" id="sp-founded-label">Founded</p>
        <div className="sp-years">
          {YEARS.map(({ key, label, placeholder }) => (
            <div className="sp-year" key={key}>
              <label className="sp-status" htmlFor={`sp-${key}`}>{label}</label>
              <input
                id={`sp-${key}`}
                className="sp-input sp-input--sm"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                placeholder={placeholder}
                value={form[key]}
                onChange={(event) => onChange({ ...form, [key]: cleanYear(event.target.value) })}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
