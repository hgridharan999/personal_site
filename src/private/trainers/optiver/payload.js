import { configKey } from '../core/configKey.js';
import { OPTIVER_RULES, scoreOptiver } from './grade.js';
import { PROFILE_V1 } from './profile-v1.js';

export async function buildOptiverPayload({ id, startedAt, durationMs, attempts, rules = OPTIVER_RULES, profile = PROFILE_V1 }) {
  const config = { ...rules };
  return {
    session: {
      id,
      trainer: 'optiver',
      mode: 'standard',
      config,
      configKey: await configKey({ trainer: 'optiver', config, profileVersion: profile.version }),
      profileVersion: profile.version,
      startedAt,
      durationMs,
      ...scoreOptiver(attempts, rules),
    },
    attempts,
  };
}
