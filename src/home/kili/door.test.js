import { describe, expect, it } from 'vitest';
import { ARM_MS, doorTap } from './door.js';

// The door on the Kilimanjaro band: a mouse click opens it; on touch the first tap lifts it
// (arms) and a second tap within ARM_MS opens it.

const idle = { armedAt: null };

describe('doorTap', () => {
  it('waits four seconds for the second tap', () => {
    expect(ARM_MS).toBe(4000);
  });

  it('opens on a mouse click straight away', () => {
    expect(doorTap(idle, { pointerType: 'mouse', now: 1000 })).toEqual({ state: idle, open: true });
  });

  it('arms on the first touch, without opening', () => {
    expect(doorTap(idle, { pointerType: 'touch', now: 1000 })).toEqual({ state: { armedAt: 1000 }, open: false });
  });

  it('opens on a second touch within ARM_MS, and disarms', () => {
    const { state } = doorTap(idle, { pointerType: 'touch', now: 1000 });
    expect(doorTap(state, { pointerType: 'touch', now: 2000 })).toEqual({ state: idle, open: true });
  });

  it('re-arms instead of opening when the first touch is older than ARM_MS', () => {
    const { state } = doorTap(idle, { pointerType: 'touch', now: 1000 });
    expect(doorTap(state, { pointerType: 'touch', now: 6000 })).toEqual({ state: { armedAt: 6000 }, open: false });
  });

  it('treats a pen like a touch', () => {
    const { state, open } = doorTap(idle, { pointerType: 'pen', now: 1000 });
    expect(open).toBe(false);
    expect(doorTap(state, { pointerType: 'pen', now: 1500 }).open).toBe(true);
  });
});
