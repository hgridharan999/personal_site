import { useCallback, useState } from 'react';
import { submitGame } from './outboxInstance.js';
import { useOutboxStatus } from './useOutboxStatus.js';

// Save status of the most recently finished game, derived from the outbox.
export function useGameSubmission() {
  const [id, setId] = useState(null);
  const [error, setError] = useState(null);
  const { pendingIds, failed } = useOutboxStatus();

  const submit = useCallback(async (buildPayload) => {
    setError(null);
    try {
      const payload = await buildPayload();
      const sending = submitGame(payload); // enqueues synchronously before its first await
      setId(payload.session.id);
      await sending;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not prepare this game for saving');
    }
  }, []);

  const reset = useCallback(() => {
    setId(null);
    setError(null);
  }, []);

  let status = 'idle';
  if (error) status = 'error';
  else if (id && failed.some((f) => f.id === id)) status = 'failed';
  else if (id && pendingIds.includes(id)) status = 'saving';
  else if (id) status = 'saved';

  return { status, error, submit, reset };
}
