import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import SiteShell from '../../site/SiteShell';
import { formatLongDate } from '../../site/format';
import { browserStorage, useNightly } from './useNightly';
import NightlyForm from './NightlyForm';
import NightlyGraded from './NightlyGraded';
import { LockedAnswers } from './NightlyAnswers';
import { Empty, Failure, Generating, Grading, GradeFailed, Loading } from './NightlyStates';
import { failureCopy } from './view';
import './nightly.css';

// Read out by one live region that stays mounted, since each view replaces the one before it.
// Generating, Grading and the graded view are left out: their heading takes focus when it
// arrives, and is read out then, so a status line here would say it twice.
const ANNOUNCE = {
  loading: 'Loading tonight',
  form: "Tonight's brief is ready",
  gradeFailed: 'Grading did not finish',
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

  const intro = today?.night ? <time dateTime={today.night}>{formatLongDate(today.night)}</time> : 'Tonight';

  return (
    <SiteShell title="Nightly" intro={intro} noindex footer={false}>
      <p className="nt-back">
        <Link to="/me">Back to /me</Link>
      </p>
      <p className="sr-only" role="status">{ANNOUNCE[view] ?? ''}</p>
      <Body nightly={nightly} storage={storage} />
    </SiteShell>
  );
}

function Body({ nightly, storage }) {
  const { today, view, error, flags, notice, load, runGenerate, runGrade, runSubmit, runPublish } = nightly;
  const session = today?.session;
  const noticeFor = (action) => (notice?.action === action ? notice : null);

  switch (view) {
    case 'loading': return <Loading />;
    case 'error': {
      const { title, detail } = failureCopy(error);
      return <Failure message={title} detail={detail} onRetry={load} />;
    }
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
          <GradeFailed notice={noticeFor('grade')} onRetry={() => runGrade(session.id)} />
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
