// src/private/trainers/poker/bots/index.test.js
import { describe, it, expect } from 'vitest';
import { listPersonas } from './personas.js';
import { BOT_VERSION, createBrain } from './index.js';
import { BOT_VERSION as LEAF_BOT_VERSION } from './version.js';

describe('BOT_VERSION', () => {
  it('lives in the dependency-free version.js leaf and is re-exported by index.js', () => {
    expect(LEAF_BOT_VERSION).toBe('bots-v1');
    expect(BOT_VERSION).toBe(LEAF_BOT_VERSION);
  });
});

describe('createBrain', () => {
  it('returns a brain with a decide function for every persona', () => {
    for (const persona of listPersonas()) {
      const brain = createBrain(persona);
      expect(typeof brain.decide).toBe('function');
    }
  });

  it('throws on an unknown brain key', () => {
    expect(() => createBrain({ brain: 'nope' })).toThrow('Unknown brain: nope');
  });
});
