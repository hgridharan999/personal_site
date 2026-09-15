import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import PrivateShell from '../../PrivateShell';
import { ApiError, getSession } from '../lib/api';
import Kpi from '../lib/Kpi';
import ReviewTable from '../optiver/ReviewTable';
import { configLabel } from './derive';
import { formatSeconds, formatClock } from '../core/format';
import { median } from '../core/stats';
import { OPTIVER_RULES } from '../optiver/grade';
import '../trainers.css';

const TRAINERS = ['zetamac', 'optiver'];

function ZetamacDetail({ session, attempts }) {
  const solved = attempts.filter((a) => a.isCorrect);
  return (
    <>
      <dl className="trn-kpis">
        <Kpi label="Score" value={session.score} />
        <Kpi label="Median time" value={formatSeconds(median(solved.map((a) => a.timeMs)))} />
        <Kpi label="Corrections" value={attempts.reduce((sum, a) => sum + a.corrections, 0)} />
      </dl>
      <div className="trn-table-wrap">
        <table className="trn-table">
          <thead>
            <tr><th scope="col">#</th><th scope="col">Problem</th><th scope="col">Answer</th><th scope="col">Time</th><th scope="col">Corrections</th></tr>
          </thead>
          <tbody>
            {attempts.map((a) => (
              <tr key={a.idx}>
                <td>{a.idx + 1}</td>
                <td>{a.prompt}</td>
                <td>{a.answer}</td>
                <td>{a.timeMs === null ? <span className="trn-muted">unfinished{a.response ? ` (typed ${a.response})` : ''}</span> : formatSeconds(a.timeMs)}</td>
                <td>{a.corrections}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function OptiverDetail({ session, attempts }) {
  return (
    <>
      <dl className="trn-kpis">
        <Kpi label="Net score" value={session.score} />
        <Kpi label="Correct" value={session.correct} />
        <Kpi label="Wrong" value={session.wrong} />
        <Kpi label="Reached" value={`${session.correct + session.wrong} / ${OPTIVER_RULES.questions}`} />
        <Kpi label="Time used" value={formatClock(session.durationMs)} />
      </dl>
      <ReviewTable attempts={attempts} />
    </>
  );
}

export default function GameDetail() {
  const { trainer, id } = useParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const [nonce, setNonce] = useState(0);
  const valid = TRAINERS.includes(trainer);

  useEffect(() => {
    if (!valid) return undefined;
    let live = true;
    setState({ status: 'loading', data: null, error: null });
    getSession(id)
      .then((data) => {
        if (live) setState({ status: 'ready', data, error: null });
      })
      .catch((err) => {
        if (!live) return;
        if (err instanceof ApiError && err.status === 401) {
          navigate('/login', { replace: true, state: { from: pathname } });
          return;
        }
        const notFound = err instanceof ApiError && (err.status === 404 || err.status === 400);
        setState({ status: 'error', data: null, error: notFound ? 'This game was not found.' : (err.message || 'Request failed') });
      });
    return () => { live = false; };
  }, [valid, id, nonce, navigate, pathname]);

  if (!valid) return <Navigate to="/me" replace />;

  const { status, data, error } = state;
  const session = data?.session;

  return (
    <PrivateShell>
      <div className="asc-topbar">
        <Link to={`/me/${trainer}?tab=stats`} data-hot className="asc-back asc-mono">
          <ArrowLeft size={14} /> <span className="b-name">Stats</span>
        </Link>
      </div>
      <main className="asc-wrap trn-page">
        <header className="trn-head">
          <div>
            <h1 className="asc-h">Game</h1>
            {session && (
              <p className="trn-muted asc-mono">
                {new Date(session.startedAt).toLocaleString()} · {configLabel({ trainer: session.trainer, mode: session.mode, config: session.config })}
              </p>
            )}
          </div>
        </header>
        <section className="trn-body trn-results">
          {status === 'loading' && <p className="trn-muted asc-mono" role="status">Loading game…</p>}
          {status === 'error' && (
            <p className="trn-bad" role="alert">
              {error}{' '}
              <button type="button" className="trn-link" data-hot onClick={() => setNonce((n) => n + 1)}>Retry</button>
            </p>
          )}
          {session && session.trainer === 'zetamac' && <ZetamacDetail session={session} attempts={data.attempts} />}
          {session && session.trainer === 'optiver' && <OptiverDetail session={session} attempts={data.attempts} />}
        </section>
      </main>
    </PrivateShell>
  );
}
