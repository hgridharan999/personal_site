import { z } from 'zod';

export const TRAINERS = ['zetamac', 'optiver'];
export const MODES = ['standard', 'custom', 'drill'];
export const QTYPES = [
  'z.add', 'z.sub', 'z.mul', 'z.div',
  'o.int.add', 'o.int.sub', 'o.int.mul', 'o.int.div',
  'o.dec.addsub', 'o.dec.mul', 'o.dec.div',
  'o.frac.of', 'o.frac.addsub', 'o.frac.muldiv',
];

// Generous enough for a 600 s custom Zetamac game with trivial ranges; a valid
// game the server rejects would sit in the outbox as permanently failed.
export const MAX_ATTEMPTS = 3000;

const configKey = z.string().regex(/^[0-9a-f]{64}$/);
const count = z.int().min(0).max(MAX_ATTEMPTS);

const attempt = z.object({
  idx: z.int().min(0).max(MAX_ATTEMPTS - 1),
  qtype: z.enum(QTYPES),
  factKey: z.string().max(64).nullable(),
  prompt: z.string().min(1).max(64),
  answer: z.string().min(1).max(64),
  response: z.string().max(32).nullable(),
  isCorrect: z.boolean(),
  timeMs: z.int().min(0).max(3600000).nullable(),
  corrections: z.int().min(0).max(1000),
});

export const sessionPayload = z
  .object({
    session: z.object({
      id: z.uuid(),
      trainer: z.enum(TRAINERS),
      mode: z.enum(MODES),
      config: z.record(z.string(), z.unknown()),
      configKey,
      profileVersion: z.int().min(1).nullable(),
      startedAt: z.iso.datetime(),
      durationMs: z.int().min(0).max(3600000),
      correct: count,
      wrong: count,
      unanswered: count,
      score: z.int().min(-MAX_ATTEMPTS).max(MAX_ATTEMPTS),
    }),
    attempts: z.array(attempt).max(MAX_ATTEMPTS),
  })
  .superRefine(({ session, attempts }, ctx) => {
    const issue = (message, path) => ctx.addIssue({ code: 'custom', message, path });
    const isOptiver = session.trainer === 'optiver';
    if (isOptiver && session.mode !== 'standard') issue('Optiver games are always standard mode', ['session', 'mode']);
    if (isOptiver !== (session.profileVersion !== null)) {
      issue('profileVersion is required for optiver and must be null for zetamac', ['session', 'profileVersion']);
    }
    const prefix = isOptiver ? 'o.' : 'z.';
    attempts.forEach((a, i) => {
      if (!a.qtype.startsWith(prefix)) issue('qtype does not match trainer', ['attempts', i, 'qtype']);
      if (a.idx !== i) issue('idx must equal position', ['attempts', i, 'idx']);
    });
    if (attempts.filter((a) => a.isCorrect).length !== session.correct) {
      issue('correct does not match attempts', ['session', 'correct']);
    }
  });

export const statsQuery = z.object({
  trainer: z.enum(TRAINERS),
  mode: z.enum(MODES).default('standard'),
  configKey: configKey.optional(),
});

export const idQuery = z.object({ id: z.uuid() });
