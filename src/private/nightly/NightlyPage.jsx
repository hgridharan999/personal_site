import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import PrivateShell from '../PrivateShell';
import { formatLongDate } from '../../site/format';
import { browserStorage, useNightly } from './useNightly';
import NightlyForm from './NightlyForm';
import NightlyGraded from './NightlyGraded';
import { LockedAnswers } from './NightlyAnswers';
import { Empty, Failure, Generating, Grading, GradeFailed, Loading } from './NightlyStates';
import { messageFor } from './view';
import './nightly.css';

// Read out by one live region that stays mounted, since each view replaces the one before it.
const ANNOUNCE = {
  loading: 'Loading tonight',
  generating: "Generating tonight's brief",
  form: "Tonight's brief is ready",
  grading: 'Answers locked. Grading',
  gradeFailed: 'Grading did not finish',
  graded: 'Graded',
};

/**
 * The private nightly room: read the brief, answer three questions, write a take, lock it, get
 * graded, then publish the take to /notes or keep it. One page that follows the session's
 * status; nothing about the grading appears until the session is graded.
 */
export default function NightlyPage() {
  const storage = useMemo(browserStorage, []);
  const nightly = useNightly(storage);
  const { today, view } = nightly;

  return (
    <PrivateShell className="nt" customCursor={false}>
      <div className="asc-topbar">
        <Link to="/me" className="asc-back asc-mono">
          <ArrowLeft size={14} aria-hidden="true" /> <span className="b-name">Base camp</span>
        </Link>
      </div>

      <main className="nt-main" aria-busy={view === 'loading'}>
        <header className="nt-head">
          <p className="asc-mono nt-kicker">
            {today?.night ? <time dateTime={today.night}>{formatLongDate(today.night)}</time> : 'Tonight'}
          </p>
          <h1 className="nt-title"><span className="asc-serif-it asc-amber">Nightly</span></h1>
        </header>
        <p className="nt-sr" role="status">{ANNOUNCE[view] ?? ''}</p>
        <Body nightly={nightly} storage={storage} />
      </main>
    </PrivateShell>
  );
}

function Body({ nightly, storage }) {
  const { today, view, error, flags, notice, load, runGenerate, runGrade, runSubmit, runPublish } = nightly;
  const session = today?.session;
  const noticeFor = (action) => (notice?.action === action ? notice : null);

  switch (view) {
    case 'loading': return <Loading />;
    case 'error': return <Failure message="Could not load tonight's session." detail={messageFor(error)} onRetry={load} />;
    case 'empty': return <Empty notice={noticeFor('generate')} onGenerate={runGenerate} />;
    case 'generating': return <Generating notice={noticeFor('generate')} onRetry={runGenerate} busy={flags.generating} />;
    case 'form':
      return (
        <NightlyForm
          key={session.id}
          session={session}
          storage={storage}
          submitting={flags.submitting}
          notice={noticeFor('submit')}
          onSubmit={runSubmit}
        />
      );
    case 'grading':
      return (
        <>
          <Grading notice={noticeFor('grade') ?? noticeFor('submit')} onRetry={() => runGrade(session.id)} busy={flags.grading} />
          <LockedAnswers session={session} />
        </>
      );
    case 'gradeFailed':
      return (
        <>
          <GradeFailed onRetry={() => runGrade(session.id)} />
          <LockedAnswers session={session} />
        </>
      );
    case 'graded':
      return <NightlyGraded key={session.id} session={session} publishing={flags.publishing} notice={noticeFor('publish')} onPublish={runPublish} />;
    default:
      // 'locked': a status this build never sets; show what there is, read-only
      return <LockedAnswers session={session} title="This night is closed" />;
  }
}
