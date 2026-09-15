import { useState } from 'react';
import { ZETAMAC_DEFAULTS, ZETAMAC_DURATIONS, isDefaultConfig, validateZetamacOptions } from './generator';

const OPERATIONS = [
  { key: 'add', label: 'Addition', range: 'add' },
  { key: 'sub', label: 'Subtraction', note: 'Addition problems in reverse.' },
  { key: 'mul', label: 'Multiplication', range: 'mul' },
  { key: 'div', label: 'Division', note: 'Multiplication problems in reverse.' },
];

function fromForm(form) {
  const options = {};
  for (const [k, v] of Object.entries(form)) {
    options[k] = typeof v === 'boolean' ? v : Number(v === '' ? NaN : v);
  }
  return options;
}

function RangeRow({ prefix, form, set }) {
  const name = prefix === 'add' ? 'Addition' : 'Multiplication';
  const field = (side, end) => {
    const key = `${prefix}_${side}_${end}`;
    return (
      <input
        type="number"
        inputMode="numeric"
        className="trn-num"
        aria-label={`${name} ${side} ${end}`}
        value={form[key]}
        onChange={(e) => set(key, e.target.value)}
      />
    );
  };
  return (
    <span className="trn-range">
      Range: ({field('left', 'min')} to {field('left', 'max')}) {prefix === 'add' ? '+' : '×'} ({field('right', 'min')} to {field('right', 'max')})
    </span>
  );
}

export default function ZetamacSetup({ initialOptions = ZETAMAC_DEFAULTS, onStart, extra = null }) {
  const [form, setForm] = useState(() => ({ ...initialOptions }));
  const [errors, setErrors] = useState([]);
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const startCustom = (e) => {
    e.preventDefault();
    const options = fromForm(form);
    const problems = validateZetamacOptions(options);
    setErrors(problems);
    if (problems.length === 0) onStart(options, isDefaultConfig(options) ? 'standard' : 'custom');
  };

  return (
    <div className="trn-setup">
      <div className="trn-setup-primary">
        <button type="button" className="trn-btn trn-btn--primary" data-hot onClick={() => onStart({ ...ZETAMAC_DEFAULTS }, 'standard')}>
          Start standard game
        </button>
        <p className="trn-muted">120 seconds · + − × ÷ · the exact arithmetic.zetamac.com defaults</p>
        {extra}
      </div>

      <form className="trn-form" onSubmit={startCustom} noValidate aria-labelledby="trn-custom-title">
        <h2 id="trn-custom-title" className="asc-mono trn-subhead">Custom game</h2>
        {OPERATIONS.map((op) => (
          <div key={op.key} className="trn-op">
            <label className="trn-check">
              <input type="checkbox" checked={form[op.key]} onChange={(e) => set(op.key, e.target.checked)} /> {op.label}
            </label>
            {op.range ? <RangeRow prefix={op.range} form={form} set={set} /> : <span className="trn-muted">{op.note}</span>}
          </div>
        ))}
        <label className="trn-field">
          Duration{' '}
          <select value={form.duration} onChange={(e) => set('duration', e.target.value)}>
            {ZETAMAC_DURATIONS.map((d) => <option key={d} value={d}>{d} seconds</option>)}
          </select>
        </label>
        {errors.length > 0 && (
          <ul className="trn-errors" role="alert">
            {errors.map((msg) => <li key={msg}>{msg}</li>)}
          </ul>
        )}
        <button type="submit" className="trn-btn" data-hot>Start custom game</button>
      </form>
    </div>
  );
}
