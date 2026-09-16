import { describe, it, expect } from 'vitest';
import { newAnnouncement } from './announce.js';

describe('newAnnouncement', () => {
  it('announces every line of a hand the first time it is seen', () => {
    expect(newAnnouncement(null, ['Moss posts 0.5 BB', 'You post 1.0 BB'], 1)).toEqual({
      text: 'Moss posts 0.5 BB. You post 1.0 BB',
      mark: { handNo: 1, count: 2 },
    });
  });

  it('announces all lines added since the last mark, not only the last one', () => {
    const lines = ['a', 'b', 'Moss folds', 'Pip calls 1.0 BB', 'Flop: A♥ K♣ 2♦'];
    expect(newAnnouncement({ handNo: 3, count: 2 }, lines, 3)).toEqual({
      text: 'Moss folds. Pip calls 1.0 BB. Flop: A♥ K♣ 2♦',
      mark: { handNo: 3, count: 5 },
    });
  });

  it('announces nothing when no line was added', () => {
    expect(newAnnouncement({ handNo: 3, count: 2 }, ['a', 'b'], 3)).toEqual({ text: '', mark: { handNo: 3, count: 2 } });
  });

  it('starts over on a new hand even if the new log is longer than the old count', () => {
    expect(newAnnouncement({ handNo: 3, count: 1 }, ['x', 'y'], 4).text).toBe('x. y');
    expect(newAnnouncement({ handNo: 3, count: 9 }, ['x'], 4).text).toBe('x');
  });

  it('starts over when the log shrank within the same hand number', () => {
    expect(newAnnouncement({ handNo: 2, count: 5 }, ['x', 'y'], 2).text).toBe('x. y');
  });

  it('announces nothing before the first hand', () => {
    expect(newAnnouncement(null, [], 0)).toEqual({ text: '', mark: { handNo: 0, count: 0 } });
  });
});
