import { Link } from 'react-router-dom';
import LineChart from './charts/LineChart';
import Histogram from './charts/Histogram';
import BarList from './charts/BarList';
import Kpi from '../lib/Kpi';
import { formatSeconds, formatDay } from '../core/format';
import { OPTIVER_RULES } from '../optiver/grade';
import { configLabel, formatTrend, progressSummary } from './derive';

const RECENT_GAMES = 20;
const BEST_DAYS = 14;

export function Section({ title, note, children }) {
  return (
    <section className="trn-section" aria-label={title}>
      <h2 className="asc-mono trn-subhead">{title}</h2>
      {note && <p className="trn-muted trn-note">{note}</p>}
      {children}
    </section>
  );
}

export function StatusView({ status, error, onRetry }) {
  if (status === 'loading') return <p className="trn-muted asc-mono" role="status">Loading stats…</p>;
  if (status !== 'error') return null;
  return (
    <p className="trn-bad" role="alert">
      Couldn&apos;t load stats: {error}.{' '}
      <button type="button" className="trn-link" data-hot onClick={onRetry}>Retry</button>
    </p>
  );
}

export function EmptyStats({ trainer, hasOtherConfigs }) {
  return (
    <div className="trn-empty">
      <p>{hasOtherConfigs ? 'No games with these settings yet.' : 'No games yet — play one to see stats.'}</p>
      <Link to={`/me/${trainer}`} className="trn-btn trn-btn--primary" data-hot>Play</Link>
    </div>
  );
}

export function ConfigPicker({ trainer, configs, mode, configKey, onChange }) {
  if (configs.length === 0) return null;
  const value = `${mode}|${configKey ?? ''}`;
  const known = configs.some((c) => c.mode === mode && c.configKey === configKey);
  return (
    <label className="trn-field trn-picker">
      Settings{' '}
      <select
        value={value}
        onChange={(e) => {
          const [nextMode, nextKey] = e.target.value.split('|');
          onChange({ mode: nextMode, configKey: nextKey || undefined });
        }}
      >
        {!known && <option value={value}>Standard · no games yet</option>}
        {configs.map((c) => (
          <option key={`${c.mode}|${c.configKey}`} value={`${c.mode}|${c.configKey}`}>
            {configLabel({ trainer, mode: c.mode, config: c.config })} · {c.games} game{c.games === 1 ? '' : 's'}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ProgressSection({ series, refLines = [], scoreLabel = 'Score' }) {
  const p = progressSummary(series);
  const points = series.map((s, i) => ({ x: i + 1, y: s.score, title: `Game ${i + 1} · ${formatDay(s.startedAt)}: ${s.score}` }));
  const overlay = p.rolling.map((y, i) => ({ x: i + 1, y }));
  const days = p.bestPerDay.slice(-BEST_DAYS);

  return (
    <Section title="Progress">
      <dl className="trn-kpis">
        <Kpi label="Games" value={p.games} />
        <Kpi label={`Best ${scoreLabel.toLowerCase()}`} value={p.best ?? '—'} />
        <Kpi label="Latest" value={p.latest ?? '—'} />
        <Kpi label="Trend" value={formatTrend(p.trendPerWeek)} />
      </dl>
      <LineChart
        points={points}
        overlay={overlay}
        refLines={refLines}
        formatX={(x) => `#${x}`}
        label={`${scoreLabel} for each of ${p.games} games with a 10-game rolling average. Best ${p.best}, latest ${p.latest}.`}
      />
      <p className="trn-muted asc-mono trn-legend">Dots: each game · line: 10-game rolling average</p>
      {days.length > 1 && (
        <>
          <h3 className="asc-mono trn-subhead trn-subhead--sm">Best per day</h3>
          <BarList label={`Best ${scoreLabel.toLowerCase()} per day, last ${BEST_DAYS} days`} items={days.map((d) => ({ key: d.day, label: d.day.slice(5), value: d.y, display: d.y }))} />
        </>
      )}
    </Section>
  );
}

export function SpeedSection({ trainer, histogram, overall, pace, slowest }) {
  if (overall.n === 0) return null;
  const pacePoints = pace.rows.map((r) => ({
    x: r.bucket + 1,
    y: r.medianMs,
    title: `Questions ${r.bucket + 1}–${r.bucket + pace.bucketSize}: ${formatSeconds(r.medianMs)} (n=${r.n})`,
  }));

  return (
    <Section title="Speed">
      <dl className="trn-kpis">
        <Kpi label="Timed answers" value={overall.n} />
        <Kpi label="Median" value={formatSeconds(overall.medianMs)} />
        <Kpi label="90th percentile" value={formatSeconds(overall.p90Ms)} />
      </dl>
      <Histogram
        bins={histogram.bins}
        binWidthMs={histogram.binWidthMs}
        markers={[{ valueMs: overall.medianMs, label: 'median' }, { valueMs: overall.p90Ms, label: 'p90' }]}
        label={`Time per question. Median ${formatSeconds(overall.medianMs)}, 90th percentile ${formatSeconds(overall.p90Ms)}.`}
      />
      {pacePoints.length > 1 && (
        <>
          <h3 className="asc-mono trn-subhead trn-subhead--sm">Pace through a game</h3>
          <LineChart
            points={pacePoints}
            yFromZero
            formatX={(x) => `#${x}`}
            formatY={(ms) => formatSeconds(ms, 1)}
            label={`Median time by position in the game, in buckets of ${pace.bucketSize} questions.`}
          />
          <p className="trn-muted trn-note">Rising means slowing down late in a game; falling means rushing.</p>
        </>
      )}
      {slowest.length > 0 && (
        <>
          <h3 className="asc-mono trn-subhead trn-subhead--sm">Slowest questions</h3>
          <div className="trn-table-wrap">
            <table className="trn-table">
              <thead>
                <tr>
                  <th scope="col">Question</th><th scope="col">Answer</th><th scope="col">Time</th>
                  <th scope="col">Date</th><th scope="col"><span className="trn-sr-only">Game</span></th>
                </tr>
              </thead>
              <tbody>
                {slowest.map((s) => (
                  <tr key={`${s.sessionId}-${s.idx}`}>
                    <td>{s.prompt}</td>
                    <td>{s.answer}</td>
                    <td>{formatSeconds(s.timeMs)}</td>
                    <td>{formatDay(s.startedAt)}</td>
                    <td><Link to={`/me/${trainer}/game/${s.sessionId}`} className="trn-link" data-hot>Open game</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Section>
  );
}

export function RecentGames({ trainer, series }) {
  const recent = [...series].reverse().slice(0, RECENT_GAMES);
  const optiver = trainer === 'optiver';
  return (
    <Section title="Games">
      <div className="trn-table-wrap">
        <table className="trn-table">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">{optiver ? 'Net score' : 'Score'}</th>
              {optiver && <><th scope="col">Correct</th><th scope="col">Wrong</th><th scope="col">Reached</th></>}
              <th scope="col"><span className="trn-sr-only">Details</span></th>
            </tr>
          </thead>
          <tbody>
            {recent.map((g) => (
              <tr key={g.id}>
                <td>{new Date(g.startedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                <td>{g.score}</td>
                {optiver && <><td>{g.correct}</td><td>{g.wrong}</td><td>{g.correct + g.wrong} / {OPTIVER_RULES.questions}</td></>}
                <td><Link to={`/me/${trainer}/game/${g.id}`} className="trn-link" data-hot>Details</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {series.length > RECENT_GAMES && (
        <p className="trn-muted trn-note">Showing the latest {RECENT_GAMES} of {series.length} games.</p>
      )}
    </Section>
  );
}
