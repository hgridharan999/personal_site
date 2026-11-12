import { describe, expect, it } from 'vitest';
import { noteView, sessionView } from './views.js';

const GRADING_KEYS = ['score', 'feedback', 'modelTake', 'followUp', 'model_take', 'follow_up', 'published', 'publishedAt'];

/** Every key at any depth of a JSON value. */
function deepKeys(value) {
  if (Array.isArray(value)) return value.flatMap(deepKeys);
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => [k, ...deepKeys(v)]);
  return [];
}

const story = (n) => ({ headline: `h${n}`, summary: `s${n}`, url: `https://example.com/${n}`, source: 'Example' });
const brief = {
  stories: [story(0), story(1), story(2)],
  niche: { ...story(3), topic: 'mycology' },
  questions: [
    { type: 'forecast', story_index: 0, prompt: 'p0' },
    { type: 'decide', story_index: 1, prompt: 'p1' },
    { type: 'estimate', story_index: 2, prompt: 'p2' },
  ],
};
// Full DB rows, grading columns filled in, so any leak shows up.
const row = (status, extra = {}) => ({
  id: 'sid', date: '2026-11-12', status, ...brief,
  grade_error: 'old failure', generation_started_at: new Date(), grading_started_at: new Date(),
  ...extra,
});
const answers = [2, 0, 1].map((idx) => ({
  idx, question_type: brief.questions[idx].type, prompt: `p${idx}`, answer: `a${idx}`, score: 4, feedback: `f${idx}`,
}));
const take = {
  story_index: 1, body: 'my take', model_take: 'blind', follow_up: 'why?', published: true,
  published_at: '2026-11-13T02:00:00.000Z',
};

describe('sessionView allow-list', () => {
  it('generating: id, date and status only', () => {
    expect(sessionView(row('generating', { stories: null, niche: null, questions: null }), answers, take))
      .toEqual({ id: 'sid', date: '2026-11-12', status: 'generating' });
  });

  it('generated: adds the brief, and nothing written or graded', () => {
    const v = sessionView(row('generated'), answers, take);
    expect(Object.keys(v).sort()).toEqual(['date', 'id', 'niche', 'questions', 'status', 'stories']);
    expect(v.stories).toEqual(brief.stories);
    expect(v.niche).toEqual(brief.niche);
    expect(v.questions).toEqual(brief.questions);
  });

  for (const status of ['submitted', 'grading']) {
    it(`${status}: adds answers and the take, with no grading field at any depth`, () => {
      const v = sessionView(row(status), answers, take);
      for (const key of GRADING_KEYS) expect(deepKeys(v), key).not.toContain(key);
      expect(v.answers).toEqual([0, 1, 2].map((idx) => ({
        idx, questionType: brief.questions[idx].type, prompt: `p${idx}`, answer: `a${idx}`,
      })));
      expect(v.take).toEqual({ storyIndex: 1, body: 'my take' });
      expect(v.stories).toEqual(brief.stories);
    });
  }

  it('submitted carries gradeError only when set; grading never does', () => {
    expect(sessionView(row('submitted'), answers, take).gradeError).toBe('old failure');
    expect('gradeError' in sessionView(row('submitted', { grade_error: null }), answers, take)).toBe(false);
    expect('gradeError' in sessionView(row('grading'), answers, take)).toBe(false);
  });

  it('graded: answers get score and feedback; the take gets the blind take, follow-up and publish state', () => {
    const v = sessionView(row('graded'), answers, take);
    expect(v.answers[0]).toEqual({ idx: 0, questionType: 'forecast', prompt: 'p0', answer: 'a0', score: 4, feedback: 'f0' });
    expect(v.take).toEqual({
      storyIndex: 1, body: 'my take', modelTake: 'blind', followUp: 'why?', published: true,
      publishedAt: '2026-11-13T02:00:00.000Z',
    });
    expect('gradeError' in v).toBe(false);
  });

  it('never passes through unknown columns', () => {
    const v = sessionView(row('graded', { secret_column: 'x' }), answers, take);
    expect(deepKeys(v)).not.toContain('secret_column');
    expect(deepKeys(v)).not.toContain('grading_started_at');
  });

  it('reserved statuses show only the basics', () => {
    expect(sessionView(row('missed'), answers, take)).toEqual({ id: 'sid', date: '2026-11-12', status: 'missed' });
  });

  it('a submitted session with no take row shows take: null', () => {
    expect(sessionView(row('submitted'), [], null).take).toBeNull();
  });
});

describe('noteView', () => {
  it('returns only the public columns', () => {
    const v = noteView({
      date: '2026-11-12', body: 'b', headline: 'h', url: 'https://x.com', source: 's', model_take: 'no', follow_up: 'no',
    });
    expect(v).toEqual({ date: '2026-11-12', body: 'b', headline: 'h', url: 'https://x.com', source: 's' });
  });
});
