import SubShell from './SubShell';
import { THESIS } from './data';

/**
 * Standalone Investment Thesis page (linked from Theses) — the headline plus a
 * numbered list of the core beliefs.
 */
export default function AscentThesis() {
  return (
    <SubShell title="Investment Thesis" instrument="thesis">
      <div style={{ flex: '1 1 auto', minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 'clamp(16px, 2.4vh, 30px)', borderTop: '1px solid var(--line)', paddingTop: 'clamp(16px, 3vh, 40px)' }}>
        <span className="asc-mono asc-amber">{THESIS.headline}</span>
        <ol className="asc-thesis-list">
          {THESIS.points.map((p, i) => (
            <li key={i}>
              <span className="asc-mono asc-thesis-idx">{String(i + 1).padStart(2, '0')}</span>
              <p>{p}</p>
            </li>
          ))}
        </ol>
      </div>
    </SubShell>
  );
}
