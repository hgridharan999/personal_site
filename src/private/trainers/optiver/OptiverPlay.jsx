import { useCallback, useEffect, useState } from 'react';
import OptiverGame from './OptiverGame';
import OptiverResults from './OptiverResults';
import { buildOptiverPayload } from './payload';
import { PROFILE_V1 } from './profile-v1';
import { useGameSubmission } from '../lib/useGameSubmission';

export default function OptiverPlay({ onBusyChange }) {
  const [phase, setPhase] = useState('intro');
  const [testNo, setTestNo] = useState(0);
  const [result, setResult] = useState(null);
  const { status, error, submit, reset } = useGameSubmission();

  useEffect(() => () => onBusyChange(false), [onBusyChange]);

  const start = () => {
    reset();
    setResult(null);
    setTestNo((n) => n + 1);
    setPhase('testing');
    onBusyChange(true);
  };

  const finish = useCallback(({ attempts, startedAt, durationMs }) => {
    onBusyChange(false);
    setResult({ attempts, durationMs });
    setPhase('results');
    submit(() => buildOptiverPayload({ id: crypto.randomUUID(), startedAt, durationMs, attempts }));
  }, [onBusyChange, submit]);

  if (phase === 'testing') return <OptiverGame key={testNo} onFinish={finish} />;
  if (phase === 'results') {
    return <OptiverResults result={result} saveStatus={status} saveError={error} onRetake={start} />;
  }

  return (
    <div className="trn-intro">
      <ul className="trn-rules">
        <li>80 questions, 8 minutes. One at a time: no skipping, no going back.</li>
        <li>Type the answer and press Enter. Any equal value counts: 13/20, 26/40 and 0.65 are all correct.</li>
        <li>+1 for correct, −1 for wrong, 0 for questions you don&apos;t reach.</li>
        <li>The timer and question counter stay hidden until the end.</li>
        <li>No calculator, no paper.</li>
      </ul>
      <p className="trn-muted asc-mono">
        Difficulty profile v{PROFILE_V1.version}: estimated from public reports of the real test
      </p>
      <button type="button" className="trn-btn trn-btn--primary" data-hot onClick={start}>Start the test</button>
    </div>
  );
}
