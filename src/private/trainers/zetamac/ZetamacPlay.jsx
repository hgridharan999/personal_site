import { useCallback, useEffect, useState } from 'react';
import ZetamacSetup from './ZetamacSetup';
import ZetamacGame from './ZetamacGame';
import ZetamacResults from './ZetamacResults';
import { ZETAMAC_DEFAULTS } from './generator';
import { buildZetamacPayload } from './payload';
import { useGameSubmission } from '../lib/useGameSubmission';

export default function ZetamacPlay({ onBusyChange }) {
  const [phase, setPhase] = useState('setup');
  const [game, setGame] = useState(null); // { options, mode, gameNo }
  const [result, setResult] = useState(null);
  const { status, error, submit, reset } = useGameSubmission();

  useEffect(() => () => onBusyChange(false), [onBusyChange]);

  const start = (options, mode) => {
    reset();
    setResult(null);
    setGame((g) => ({ options, mode, gameNo: (g?.gameNo ?? 0) + 1 }));
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
    return <ZetamacGame key={game.gameNo} options={game.options} onFinish={finish} />;
  }
  if (phase === 'results') {
    return (
      <ZetamacResults
        result={result}
        options={game.options}
        mode={game.mode}
        saveStatus={status}
        saveError={error}
        onPlayAgain={() => start(game.options, game.mode)}
        onSettings={() => { reset(); setPhase('setup'); }}
      />
    );
  }
  return <ZetamacSetup initialOptions={game?.options ?? ZETAMAC_DEFAULTS} onStart={start} />;
}
