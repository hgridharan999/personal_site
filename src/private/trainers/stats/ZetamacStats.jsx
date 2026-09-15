import { useState } from 'react';
import HeatGrid from './charts/HeatGrid';
import BarList from './charts/BarList';
import Kpi from '../lib/Kpi';
import { useStats } from './useStats';
import { QTYPE_LABEL, readiness } from './derive';
import { ConfigPicker, EmptyStats, ProgressSection, RecentGames, Section, SpeedSection, StatusView } from './sections';
import { formatSeconds } from '../core/format';
import { factPrompt } from '../core/facts';
import { ZETAMAC_BENCHMARKS } from '../core/benchmarks';

const GRID_ROWS = Array.from({ length: 11 }, (_, i) => i + 2); // 2–12
const GRID_COLS = Array.from({ length: 19 }, (_, i) => i + 2); // 2–20

function carriesLabel({ qtype, carries }) {
  const noun = qtype === 'z.sub' ? 'borrow' : 'carry';
  const plural = qtype === 'z.sub' ? 'borrows' : 'carries';
  return `${QTYPE_LABEL[qtype]} · ${carries} ${carries === 1 ? noun : plural}`;
}

export default function ZetamacStats() {
  const [selection, setSelection] = useState({ mode: 'standard', configKey: undefined });
  const { status, data, error, reload } = useStats({ trainer: 'zetamac', ...selection });

  if (!data) return <StatusView status={status} error={error} onRetry={reload} />;

  const picker = (
    <ConfigPicker trainer="zetamac" configs={data.configs} mode={selection.mode} configKey={data.configKey} onChange={setSelection} />
  );
  if (data.series.length === 0) {
    return <div className="trn-stats">{picker}<EmptyStats trainer="zetamac" hasOtherConfigs={data.configs.length > 0} /></div>;
  }

  const ready = readiness(data.series, ZETAMAC_BENCHMARKS[0]);

  return (
    <div className="trn-stats">
      {status === 'error' && <StatusView status={status} error={error} onRetry={reload} />}
      {picker}

      <ProgressSection series={data.series} />

      <Section title="Weak spots">
        <BarList
          label="Median time by operation"
          items={data.byType.map((t) => ({
            key: t.qtype,
            label: QTYPE_LABEL[t.qtype],
            value: t.medianMs,
            display: formatSeconds(t.medianMs),
            hint: `${t.n} solved · p90 ${formatSeconds(t.p90Ms)} · ${t.avgCorrections.toFixed(2)} corrections each`,
          }))}
        />

        <h3 className="asc-mono trn-subhead trn-subhead--sm">Times tables (2–12 × 2–20)</h3>
        <HeatGrid
          cells={data.timesGrid}
          rows={GRID_ROWS}
          cols={GRID_COLS}
          label={`Median time for multiplication facts 2–12 × 2–20. ${data.timesGrid.length} of ${GRID_ROWS.length * GRID_COLS.length} facts seen.`}
        />

        {data.slowFacts.length > 0 && (
          <>
            <h3 className="asc-mono trn-subhead trn-subhead--sm">Slowest facts (seen at least twice)</h3>
            <div className="trn-table-wrap">
              <table className="trn-table">
                <thead>
                  <tr><th scope="col">Fact</th><th scope="col">Median</th><th scope="col">Seen</th><th scope="col">Corrections each</th></tr>
                </thead>
                <tbody>
                  {data.slowFacts.map((f) => (
                    <tr key={f.factKey}>
                      <td>{factPrompt(f.factKey)}</td>
                      <td>{formatSeconds(f.medianMs)}</td>
                      <td>{f.n}</td>
                      <td>{f.avgCorrections.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {data.carries.length > 0 && (
          <>
            <h3 className="asc-mono trn-subhead trn-subhead--sm">Addition and subtraction by carries / borrows</h3>
            <BarList
              label="Mean time by number of carries or borrows"
              items={data.carries.map((c) => ({
                key: `${c.qtype}-${c.carries}`,
                label: carriesLabel(c),
                value: c.meanMs,
                display: formatSeconds(c.meanMs),
                hint: `n=${c.n}`,
              }))}
            />
          </>
        )}
      </Section>

      <SpeedSection trainer="zetamac" histogram={data.histogram} overall={data.overall} pace={data.pace} slowest={data.slowest} />

      {selection.mode === 'standard' && (
        <Section title="Readiness" note="Benchmarks for the standard game are community estimates. Sources disagree, so treat them as rough.">
          <dl className="trn-kpis">
            <Kpi label={`Last ${ready.n} average`} value={ready.mean.toFixed(1)} />
            <Kpi label="Consistency (std dev)" value={ready.sd == null ? '—' : ready.sd.toFixed(1)} />
          </dl>
          <ul className="trn-bands" aria-label="Unofficial benchmark bands">
            {ZETAMAC_BENCHMARKS.map((b) => (
              <li key={b} className={ready.mean >= b ? 'trn-ok' : 'trn-muted'}>
                {ready.mean >= b ? '✓' : '·'} {b}+
              </li>
            ))}
          </ul>
        </Section>
      )}

      <RecentGames trainer="zetamac" series={data.series} />
    </div>
  );
}
