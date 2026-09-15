import { useState } from 'react';
import { Link } from 'react-router-dom';
import BarList from './charts/BarList';
import Kpi from '../lib/Kpi';
import { useStats } from './useStats';
import { QTYPE_LABEL, readiness } from './derive';
import { ConfigPicker, EmptyStats, ProgressSection, RecentGames, Section, SpeedSection, StatusView } from './sections';
import { formatSeconds, formatPercent, formatDay } from '../core/format';
import { OPTIVER_PASS_LINE } from '../core/benchmarks';
import { OPTIVER_RULES } from '../optiver/grade';

export default function OptiverStats() {
  const [selection, setSelection] = useState({ mode: 'standard', configKey: undefined });
  const { status, data, error, reload } = useStats({ trainer: 'optiver', ...selection });

  if (!data) return <StatusView status={status} error={error} onRetry={reload} />;

  const picker = (
    <ConfigPicker trainer="optiver" configs={data.configs} mode={selection.mode} configKey={data.configKey} onChange={setSelection} />
  );
  if (data.series.length === 0) {
    return <div className="trn-stats">{picker}<EmptyStats trainer="optiver" hasOtherConfigs={data.configs.length > 0} /></div>;
  }

  const ready = readiness(data.series, OPTIVER_PASS_LINE);
  const mostMissed = [...data.byType].sort((a, b) => a.accuracy - b.accuracy);

  return (
    <div className="trn-stats">
      {status === 'error' && <StatusView status={status} error={error} onRetry={reload} />}
      {data.configs.length > 1 && picker}

      <Section title="Readiness" note={`The ${OPTIVER_PASS_LINE} net pass line is an unofficial estimate from public reports.`}>
        <dl className="trn-kpis">
          <Kpi label={`Last ${ready.n} average`} value={ready.mean.toFixed(1)} />
          <Kpi label={`At or above ${OPTIVER_PASS_LINE}`} value={`${ready.atOrAbove} / ${ready.n}`} hint={formatPercent(ready.share)} />
          <Kpi label="Consistency (std dev)" value={ready.sd == null ? '—' : ready.sd.toFixed(1)} />
          <Kpi label="Avg questions reached" value={ready.avgReached.toFixed(1)} hint={`of ${OPTIVER_RULES.questions}`} />
        </dl>
      </Section>

      <ProgressSection
        series={data.series}
        scoreLabel="Net score"
        refLines={[{ y: OPTIVER_PASS_LINE, label: `est. pass line ${OPTIVER_PASS_LINE}` }]}
      />

      <Section title="Weak spots">
        <h3 className="asc-mono trn-subhead trn-subhead--sm">Accuracy by question type, most missed first</h3>
        <BarList
          label="Share of answers wrong, by question type"
          items={mostMissed.map((t) => ({
            key: t.qtype,
            label: QTYPE_LABEL[t.qtype],
            value: 1 - t.accuracy,
            display: `${formatPercent(t.accuracy)} correct`,
            hint: `${t.n} answered · median ${formatSeconds(t.medianMs)} · p90 ${formatSeconds(t.p90Ms)}`,
          }))}
        />

        {data.wrongLog.length > 0 && (
          <>
            <h3 className="asc-mono trn-subhead trn-subhead--sm">Recent wrong answers</h3>
            <div className="trn-table-wrap">
              <table className="trn-table">
                <thead>
                  <tr>
                    <th scope="col">Question</th><th scope="col">Your answer</th><th scope="col">Correct answer</th>
                    <th scope="col">Date</th><th scope="col"><span className="trn-sr-only">Game</span></th>
                  </tr>
                </thead>
                <tbody>
                  {data.wrongLog.map((w) => (
                    <tr key={`${w.sessionId}-${w.idx}`}>
                      <td>{w.prompt}</td>
                      <td className="trn-bad">{w.response}</td>
                      <td>{w.answer}</td>
                      <td>{formatDay(w.startedAt)}</td>
                      <td><Link to={`/me/optiver/game/${w.sessionId}`} className="trn-link" data-hot>Open game</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Section>

      <SpeedSection trainer="optiver" histogram={data.histogram} overall={data.overall} pace={data.pace} slowest={data.slowest} />

      <RecentGames trainer="optiver" series={data.series} />
    </div>
  );
}
