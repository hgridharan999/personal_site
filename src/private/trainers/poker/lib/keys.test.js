import { describe, it, expect } from 'vitest';
import { keyToCommand } from './keys.js';

const idle = { heroTurn: true, sizing: false };
const sizing = { heroTurn: true, sizing: true };

describe('keyToCommand', () => {
  it('maps action keys, ignoring case', () => {
    expect(keyToCommand({ key: 'f' }, idle)).toEqual({ type: 'fold' });
    expect(keyToCommand({ key: 'F', shiftKey: true }, idle)).toEqual({ type: 'fold' });
    expect(keyToCommand({ key: 'c' }, idle)).toEqual({ type: 'checkCall' });
    expect(keyToCommand({ key: 'r' }, idle)).toEqual({ type: 'openSizing' });
  });

  it('maps 1-5 to the presets', () => {
    expect(['1', '2', '3', '4', '5'].map((key) => keyToCommand({ key }, idle))).toEqual(
      [0, 1, 2, 3, 4].map((index) => ({ type: 'preset', index })),
    );
    expect(keyToCommand({ key: '6' }, idle)).toBeNull();
    expect(keyToCommand({ key: '0' }, idle)).toBeNull();
  });

  it('nudges by 0.5 BB, or 5 BB with Shift, in or out of sizing', () => {
    expect(keyToCommand({ key: 'ArrowUp' }, idle)).toEqual({ type: 'nudge', units: 1 });
    expect(keyToCommand({ key: 'ArrowDown' }, sizing)).toEqual({ type: 'nudge', units: -1 });
    expect(keyToCommand({ key: 'ArrowUp', shiftKey: true }, sizing)).toEqual({ type: 'nudge', units: 10 });
    expect(keyToCommand({ key: 'ArrowDown', shiftKey: true }, idle)).toEqual({ type: 'nudge', units: -10 });
  });

  it('confirms and cancels only while sizing', () => {
    expect(keyToCommand({ key: 'Enter' }, sizing)).toEqual({ type: 'confirm' });
    expect(keyToCommand({ key: 'Escape' }, sizing)).toEqual({ type: 'cancel' });
    expect(keyToCommand({ key: 'Enter' }, idle)).toBeNull();
    expect(keyToCommand({ key: 'Escape' }, idle)).toBeNull();
  });

  it('leaves digits and letters to the size input while sizing', () => {
    for (const key of ['1', '5', '.', 'f', 'c', 'r', 'Backspace']) expect(keyToCommand({ key }, sizing)).toBeNull();
  });

  it('does nothing when it is not the hero\'s turn or a modifier is held', () => {
    expect(keyToCommand({ key: 'f' }, { heroTurn: false, sizing: false })).toBeNull();
    expect(keyToCommand({ key: 'c', ctrlKey: true }, idle)).toBeNull();
    expect(keyToCommand({ key: 'r', metaKey: true }, idle)).toBeNull();
    expect(keyToCommand({ key: '1', altKey: true }, idle)).toBeNull();
    expect(keyToCommand({ key: 'x' }, idle)).toBeNull();
  });
});
