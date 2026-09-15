import { useCallback, useEffect, useState } from 'react';
import ZetamacSetup from './ZetamacSetup';
import ZetamacGame from './ZetamacGame';
import ZetamacResults from './ZetamacResults';
import DrillPanel from './DrillPanel';
import { ZETAMAC_DEFAULTS } from './generator';
import { buildZetamacPayload } from './payload';
import { useGameSubmission } from '../lib/useGameSubmission';

export default function ZetamacPlay({ onBusyChange }) {
  const [phase, setPhase] = useState('setup');
  const [game, setGame] = useState(null); // { options, mode, source, gameNo }
  const [result, setResult] = useState(null);
  const { status, error, submit, reset } = useGameSubmission();

  useEffect(() => () => onBusyChange(false), [onBusyChange]);

  const start = (options, mode, source = undefined) => {
    reset();
    setResult(null);
    setGame((g) => ({ options, mode, source, gameNo: (g?.gameNo ?? 0) + 1 }));
    setPhase('playing');
    onBusyChange(true);
  };

  const finish = useCallback(({ attempts, startedAt }) => {
    onBusyChange(false);
    setResult({ attempts, startedAt });
    setPhase('results');
    submit(() => buildZetamacPayload({ id: crypto.randomUUID(), options: game.options, mode: game.mode, startedAt, attempts }));
  }, [game, onBusyChange, submit]);

  if (phase === 'playing') {
    return (
      <ZetamacGame
        key={game.gameNo}
        options={game.options}
        onFinish={finish}
        {...(game.source ? { makeNextProblem: game.source } : {})}
      />
    );
  }
  if (phase === 'results') {
    return (
      <ZetamacResults
        result={result}
        options={game.options}
        mode={game.mode}
        saveStatus={status}
        saveError={error}
        onPlayAgain={() => start(game.options, game.mode, game.source)}
        onSettings={() => { reset(); setPhase('setup'); }}
      />
    );
  }
  return (
    <ZetamacSetup
      initialOptions={game?.mode === 'custom' ? game.options : ZETAMAC_DEFAULTS}
      onStart={start}
      extra={<DrillPanel onStart={(source) => start({ ...ZETAMAC_DEFAULTS }, 'drill', source)} />}
    />
  );
}
