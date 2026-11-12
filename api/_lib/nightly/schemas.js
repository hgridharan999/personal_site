import { z } from 'zod';
import { TYPE_KEYS } from './types.js';

const text = z.string().min(1);
const idx = z.int().min(0).max(2);
const body = z.string().trim().min(1).max(4000);

export const Story = z.object({ headline: text, summary: text, url: z.url(), source: text });
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
