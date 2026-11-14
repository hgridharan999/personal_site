// The door on the Kilimanjaro band: what a pointer up on it means. Pure, so it runs in node.
// A mouse click opens it. A touch or pen has no hover, so its first tap lifts the door (arms
// it) and a second tap within ARM_MS opens it; a first tap that has gone stale arms it again.

export const ARM_MS = 4000;

const IDLE = Object.freeze({ armedAt: null });

/** `state` is `{ armedAt }` (a timestamp, or null). Returns the next state and whether to open. */
export function doorTap(state, { pointerType, now }) {
  if (pointerType === 'mouse') return { state: IDLE, open: true };
  const armed = state.armedAt !== null && now - state.armedAt <= ARM_MS;
  if (armed) return { state: IDLE, open: true };
  return { state: { armedAt: now }, open: false };
}
