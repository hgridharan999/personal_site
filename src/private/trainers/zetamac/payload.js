import { configKey } from '../core/configKey.js';
import { zetamacTotals } from './tracker.js';

export async function buildZetamacPayload({ id, options, mode, startedAt, attempts }) {
  const config = { ...options };
  return {
    session: {
      id,
      trainer: 'zetamac',
      mode,
      config,
      configKey: await configKey({ trainer: 'zetamac', config }),
      profileVersion: null,
      startedAt,
      durationMs: options.duration * 1000,
      ...zetamacTotals(attempts),
    },
    attempts,
  };
}
