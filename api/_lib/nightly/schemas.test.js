import { describe, expect, it } from 'vitest';
import { BlindTake, Brief, GradeResult, SessionIdBody, SubmitBody } from './schemas.js';

const story = (n) => ({ headline: `h${n}`, summary: `s${n}`, url: `https://example.com/${n}`, source: 'Example' });
const brief = () => ({
  stories: [story(1), story(2), story(3)],
  niche: { ...story(4), topic: 'mycology' },
  questions: [
    { type: 'forecast', story_index: 0, prompt: 'p' },
    { type: 'decide', story_index: 1, prompt: 'p' },
    { type: 'estimate', story_index: 2, prompt: 'p' },
  ],
});
const id = '123e4567-e89b-42d3-a456-426614174000';
const submit = () => ({
  sessionId: id,
  answers: [0, 1, 2].map((idx) => ({ idx, answer: ' text ' })),
  take: { storyIndex: 1, body: 'take' },
});

describe('Brief', () => {
  it('accepts a valid brief', () => expect(Brief.safeParse(brief()).success).toBe(true));
  it('rejects duplicate question types', () => {
    const b = brief();
    b.questions[1].type = 'forecast';
    expect(Brief.safeParse(b).success).toBe(false);
  });
  it('rejects a non-URL', () => {
    const b = brief();
    b.stories[0].url = 'not a url';
    expect(Brief.safeParse(b).success).toBe(false);
  });
});

describe('SubmitBody', () => {
  it('accepts and trims a valid body', () => {
    const r = SubmitBody.safeParse(submit());
    expect(r.success).toBe(true);
    expect(r.data.answers[0].answer).toBe('text');
  });
  it('rejects 2 answers', () => {
    const b = submit();
    b.answers.pop();
    expect(SubmitBody.safeParse(b).success).toBe(false);
  });
  it('rejects duplicate idx', () => {
    const b = submit();
    b.answers[2].idx = 0;
    expect(SubmitBody.safeParse(b).success).toBe(false);
  });
  it('rejects a blank take after trim', () => {
    const b = submit();
    b.take.body = '   ';
    expect(SubmitBody.safeParse(b).success).toBe(false);
  });
});

describe('small schemas', () => {
  it('SessionIdBody needs a uuid', () => {
    expect(SessionIdBody.safeParse({ sessionId: id }).success).toBe(true);
    expect(SessionIdBody.safeParse({ sessionId: 'x' }).success).toBe(false);
  });
  it('GradeResult bounds scores', () => {
    const g = { scores: [0, 1, 2].map((idx) => ({ idx, score: 3, feedback: 'f' })), followUp: 'q' };
    expect(GradeResult.safeParse(g).success).toBe(true);
    g.scores[0].score = 6;
    expect(GradeResult.safeParse(g).success).toBe(false);
  });
  it('BlindTake needs text', () => {
    expect(BlindTake.safeParse({ take: '' }).success).toBe(false);
    expect(BlindTake.safeParse({ take: 'x' }).success).toBe(true);
  });
});
