// One KPI cell. Render inside <dl className="trn-kpis">.
export default function Kpi({ label, value, hint }) {
  return (
    <div className="trn-kpi">
      <dt className="asc-mono">{label}</dt>
      <dd>{value}</dd>
      {hint && <dd className="trn-kpi-hint">{hint}</dd>}
    </div>
  );
}
