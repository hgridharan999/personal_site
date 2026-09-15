import { barPercent, isFiniteNumber } from './scale';

export default function BarList({ items, label }) {
  const max = Math.max(0, ...items.map((i) => (isFiniteNumber(i.value) ? i.value : 0)));
  return (
    <ul className="trn-barlist" aria-label={label}>
      {items.map((item) => (
        <li key={item.key ?? item.label} className="trn-barlist-row">
          <span className="trn-barlist-label">{item.label}</span>
          <span className="trn-barlist-track" aria-hidden="true">
            <span className="trn-barlist-fill" style={{ width: `${barPercent(item.value, max)}%` }} />
          </span>
          <span className="trn-barlist-value">{item.display}</span>
          {item.hint && <span className="trn-barlist-hint trn-muted">{item.hint}</span>}
        </li>
      ))}
    </ul>
  );
}
