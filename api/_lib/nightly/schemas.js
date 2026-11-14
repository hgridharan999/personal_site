import { z } from 'zod';
import { TYPE_KEYS } from './types.js';
import { GAMES, gameByKey, hasAtMostDecimals } from './games.js';

const text = z.string().min(1);
const idx = z.int().min(0).max(2);
const body = z.string().trim().min(1).max(4000);

// http(s) only: these links are rendered as hrefs, so javascript: and data: must never pass.
const webUrl = z.url({ protocol: /^https?$/ });

export const Story = z.object({ headline: text, summary: text, url: webUrl, source: text });
export const Niche = Story.extend({ topic: text });
export const Question = z.object({ type: z.enum(TYPE_KEYS), story_index: idx, prompt: text });

export const Brief = z
  .object({
    stories: Story.array().length(3),
    niche: Niche,
    questions: Question.array().length(3),
  })
  .refine((b) => new Set(b.questions.map((q) => q.type)).size === b.questions.length, {
    message: 'question types must be distinct',
    path: ['questions'],
  });

export const SubmitBody = z.object({
  sessionId: z.uuid(),
  answers: z
    .array(z.object({ idx, answer: body }))
    .length(3)
    .refine((a) => new Set(a.map((x) => x.idx)).size === a.length, {
      message: 'answer idx values must be distinct',
    }),
  take: z.object({ storyIndex: idx, body }),
});

export const SessionIdBody = z.object({ sessionId: z.uuid() });

export const GradeResult = z.object({
  scores: z.array(z.object({ idx, score: z.int().min(1).max(5), feedback: text })).length(3),
  followUp: text,
});

export const BlindTake = z.object({ take: text });

export const FlawDraft = z.object({ argument: text, explanation: text });

const night = z.iso.date();

export const SolveBody = z.discriminatedUnion('puzzle', [
  z.object({
    puzzle: z.literal('sprint'),
    night,
    answer: z.object({
      answers: z.array(z.number().finite().nullable()).length(5),
      seconds: z.number().min(0).max(3600),
    }),
  }),
  z.object({
    puzzle: z.literal('flaw'),
    night,
    answer: z.object({ choice: z.int().min(0).max(3) }),
  }),
]);

export const LogBody = z
  .object({
    night,
    game: z.enum(GAMES.map((g) => g.key)),
    score: z.number().finite(),
  })
  .superRefine((b, ctx) => {
    const g = gameByKey(b.game);
    if (b.score < g.min || b.score > g.max || !hasAtMostDecimals(b.score, g.decimals)) {
      ctx.addIssue({
        code: 'custom',
        path: ['score'],
        message: `score must be ${g.min} to ${g.max} with at most ${g.decimals} decimals`,
      });
    }
  });
