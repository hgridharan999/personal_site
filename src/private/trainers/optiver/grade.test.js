import { describe, it, expect } from 'vitest';
import { rat, fromString } from '../core/rational.js';
import { OPTIVER_RULES, sanitizeInput, gradeResponse, buildOptiverAttempts, scoreOptiver } from './grade.js';

const q = (answer, extra = {}) => ({ idx: 0, qtype: 'o.frac.addsub', prompt: 'p', answer, answerText: 'x', ...extra });

describe('OPTIVER_RULES', () => {
  it('matches the decided rules', () => {
    expect(OPTIVER_RULES).toEqual({
      questions: 80, timeLimitMs: 480000, pointsCorrect: 1, pointsWrong: -1, pointsUnreached: 0,
      skipping: false, goBack: false, timerVisible: false, answerFormat: 'typed',
    });
  });
});

describe('sanitizeInput', () => {
  it('keeps digits . / - only, max 32 chars', () => {
    expect(sanitizeInput('1a3/2 0')).toBe('13/20');
    expect(sanitizeInput('-0.5x')).toBe('-0.5');
    expect(sanitizeInput('9'.repeat(40))).toHaveLength(32);
  });
});

describe('gradeResponse', () => {
  it.each([
    [rat(1n, 2n), '.5', true], [rat(1n, 2n), '0.50', true], [rat(1n, 2n), '1/2', true], [rat(1n, 2n), '2/4', true],
    [rat(13n, 20n), '13/20', true], [rat(13n, 20n), '26/40', true], [rat(13n, 20n), '0.65', true],
    [rat(1n, 3n), '0.33', false], [rat(1n, 3n), '1/3', true], [rat(1n, 3n), '2/6', true],
    [fromString('7.5'), '15/2', true], [rat(581n), '581', true], [rat(581n), '582', false], [rat(0n), '-0', true],
  ])('answer %o, input %s → correct %s', (answer, input, expected) => {
    expect(gradeResponse(q(answer), input)).toEqual({ valid: true, response: input.trim(), isCorrect: expected });
  });
  it.each(['', '   ', '-', '.', '3/', '1/0', '1.2.3', '/'])('invalid input %j does nothing', (input) => {
    expect(gradeResponse(q(rat(1n)), input)).toEqual({ valid: false });
  });
});

describe('buildOptiverAttempts + scoreOptiver', () => {
  const questions = Array.from({ length: 80 }, (_, i) => ({
    idx: i, qtype: 'o.int.add', prompt: `${i} + 1`, answer: rat(BigInt(i + 1)), answerText: String(i + 1),
  }));

  it('fills unreached questions and scores +1/−1/0', () => {
    const answers = [
      { response: '1', isCorrect: true, timeMs: 5000 },
      { response: '3', isCorrect: false, timeMs: 7000 },
      { response: '3', isCorrect: true, timeMs: 4000 },
    ];
    const attempts = buildOptiverAttempts(questions, answers);
    expect(attempts).toHaveLength(80);
    expect(attempts[1]).toEqual({
      idx: 1, qtype: 'o.int.add', factKey: null, prompt: '1 + 1', answer: '2',
      response: '3', isCorrect: false, timeMs: 7000, corrections: 0,
    });
    expect(attempts[3]).toMatchObject({ response: null, isCorrect: false, timeMs: null });
    expect(scoreOptiver(attempts)).toEqual({ correct: 2, wrong: 1, unanswered: 77, score: 1 });
  });

  it('a perfect test scores 80', () => {
    const answers = questions.map((x) => ({ response: x.answerText, isCorrect: true, timeMs: 6000 }));
    expect(scoreOptiver(buildOptiverAttempts(questions, answers))).toEqual({ correct: 80, wrong: 0, unanswered: 0, score: 80 });
  });
});
