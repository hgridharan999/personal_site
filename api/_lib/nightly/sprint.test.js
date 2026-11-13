import { describe, it, expect } from 'vitest';
import { seededRand, SPRINT_KINDS, sprintProblems, isCorrect, scoreSprint } from './sprint.js';
import { addDays } from './dates.js';

describe('seededRand', () => {
  it('is deterministic and in [0,1)', () => {
    const a = seededRand('x');
    const b = seededRand('x');
    for (let i = 0; i < 50; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('sprintProblems', () => {
  it('is deterministic per night and differs between nights', () => {
    expect(sprintProblems('2026-11-13')).toEqual(sprintProblems('2026-11-13'));
    expect(sprintProblems('2026-11-13')).not.toEqual(sprintProblems('2026-11-14'));
  });

  it('gives clean answers and readable prompts across 200 nights', () => {
    let night = '2026-11-13';
    for (let i = 0; i < 200; i++, night = addDays(night, 1)) {
      const problems = sprintProblems(night);
      expect(problems.map((p) => p.kind)).toEqual(SPRINT_KINDS);
      for (const p of problems) {
        expect(Number.isFinite(p.answer)).toBe(true);
        expect(p.answer).not.toBe(0);
        expect(Math.round(p.answer * 10)).toBe(p.answer * 10);
        expect(p.prompt.length).toBeGreaterThan(0);
        expect(p.prompt).not.toMatch(/NaN|undefined/);
      }
    }
  });
});

describe('isCorrect', () => {
  it('accepts answers within 1%', () => {
    expect(isCorrect(2400, 2400)).toBe(true);
    expect(isCorrect(2420, 2400)).toBe(true);
  });
  it('rejects far, null and NaN answers', () => {
    expect(isCorrect(2430, 2400)).toBe(false);
    expect(isCorrect(null, 5)).toBe(false);
    expect(isCorrect(NaN, 5)).toBe(false);
  });
});

describe('scoreSprint', () => {
  const night = '2026-11-13';
  const right = sprintProblems(night).map((p) => p.answer);
  it('scores a perfect sprint', () => {
    expect(scoreSprint(night, right)).toEqual({ score: 5, correct: [true, true, true, true, true] });
  });
  it('marks a null answer wrong', () => {
    const r = scoreSprint(night, [null, ...right.slice(1)]);
    expect(r.score).toBe(4);
    expect(r.correct[0]).toBe(false);
  });
});
