import { describe, expect, it } from 'vitest';
import { BlindTake, Brief, FlawDraft, GradeResult, LogBody, SessionIdBody, SolveBody, SubmitBody } from './schemas.js';

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
  it('rejects javascript: and data: URLs in stories and the niche item', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>']) {
      const s = brief();
      s.stories[0].url = url;
      expect(Brief.safeParse(s).success, url).toBe(false);
      const n = brief();
      n.niche.url = url;
      expect(Brief.safeParse(n).success, url).toBe(false);
    }
  });
  it('accepts plain http URLs', () => {
    const b = brief();
    b.stories[0].url = 'http://example.com/a';
    expect(Brief.safeParse(b).success).toBe(true);
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

describe('FlawDraft', () => {
  it('needs argument and explanation', () => {
    expect(FlawDraft.safeParse({ argument: 'a', explanation: 'b' }).success).toBe(true);
    expect(FlawDraft.safeParse({ argument: 'a' }).success).toBe(false);
  });
});

describe('LogBody', () => {
  const night = '2026-11-13';
  const ok = (game, score) => LogBody.safeParse({ night, game, score }).success;
  it('accepts valid scores', () => {
    expect(ok('krillion', 540)).toBe(true);
    expect(ok('fermi', 1.94)).toBe(true);
  });
  it('rejects bad decimals, range, game and missing night', () => {
    expect(ok('krillion', 540.5)).toBe(false);
    expect(ok('krillion', 701)).toBe(false);
    expect(ok('fermi', 0.5)).toBe(false);
    expect(ok('fermi', 1.945)).toBe(false);
    expect(ok('puzzle_sprint', 3)).toBe(false);
    expect(ok('wordle', 3)).toBe(false);
    expect(LogBody.safeParse({ game: 'krillion', score: 5 }).success).toBe(false);
  });
  it('puts score errors at path score', () => {
    const r = LogBody.safeParse({ night, game: 'krillion', score: 701 });
    expect(r.error.issues[0].path).toEqual(['score']);
  });
});

describe('SolveBody', () => {
  const night = '2026-11-13';
  const sprint = (answers) => ({ puzzle: 'sprint', night, answer: { answers, seconds: 42 } });
  it('accepts both branches, including null answers', () => {
    expect(SolveBody.safeParse(sprint([1, 2, 3, 4, 5])).success).toBe(true);
    expect(SolveBody.safeParse(sprint([1, null, 3, 4, 5])).success).toBe(true);
    expect(SolveBody.safeParse({ puzzle: 'flaw', night, answer: { choice: 3 } }).success).toBe(true);
  });
  it('rejects bad shapes', () => {
    expect(SolveBody.safeParse(sprint([1, 2, 3, 4])).success).toBe(false);
    expect(SolveBody.safeParse({ puzzle: 'flaw', night, answer: { choice: 4 } }).success).toBe(false);
    expect(SolveBody.safeParse({ puzzle: 'estimate', night, answer: {} }).success).toBe(false);
  });
});
