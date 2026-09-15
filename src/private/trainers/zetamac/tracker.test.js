import { describe, it, expect } from 'vitest';
import { startProblem, handleInput, handleDeleteKey, unfinishedAttempt, zetamacTotals } from './tracker.js';

const problem = { qtype: 'z.mul', prompt: '7 × 83', answer: 581, factKey: 'mul:7x83', a: 7, b: 83 };

describe('tracker', () => {
  it('accepts an exact trimmed match and records time', () => {
    let s = startProblem(problem, 3, 1000);
    ({ state: s } = handleInput(s, '5', 1500));
    ({ state: s } = handleInput(s, '58', 1800));
    const { attempt } = handleInput(s, ' 581 ', 3140.4);
    expect(attempt).toEqual({
      idx: 3, qtype: 'z.mul', factKey: 'mul:7x83', prompt: '7 × 83',
      answer: '581', response: '581', isCorrect: true, timeMs: 2140, corrections: 0,
    });
  });

  it('counts entering a full-length wrong state once, plus deletes', () => {
    let s = startProblem(problem, 0, 0);
    let r = handleInput(s, '582', 10); s = r.state;
    expect(r.attempt).toBeNull();
    expect(s.corrections).toBe(1);
    r = handleInput(s, '5822', 20); s = r.state;
    expect(s.corrections).toBe(1);
    s = handleDeleteKey(s);
    r = handleInput(s, '582', 30); s = r.state;
    s = handleDeleteKey(s);
    r = handleInput(s, '58', 40); s = r.state;
    expect(s.corrections).toBe(3);
    r = handleInput(s, '581', 50);
    expect(r.attempt.corrections).toBe(3);
  });

  it('does not accept a prefix or a numerically equal but different string', () => {
    const s = startProblem({ ...problem, answer: 5, prompt: '10 ÷ 2' }, 0, 0);
    expect(handleInput(s, '05', 1).attempt).toBeNull();
    expect(handleInput(s, '5.0', 1).attempt).toBeNull();
  });

  it('unfinishedAttempt', () => {
    const s = startProblem(problem, 7, 0);
    expect(unfinishedAttempt(s, ' 58')).toMatchObject({ idx: 7, response: '58', isCorrect: false, timeMs: null });
    expect(unfinishedAttempt(s, '')).toMatchObject({ response: null });
  });

  it('zetamacTotals counts correct answers only', () => {
    const attempts = [{ isCorrect: true }, { isCorrect: true }, { isCorrect: false }];
    expect(zetamacTotals(attempts)).toEqual({ correct: 2, wrong: 0, unanswered: 0, score: 2 });
  });
});
