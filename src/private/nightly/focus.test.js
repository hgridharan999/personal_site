import { describe, it, expect } from 'vitest';
import { focusLost } from './focus.js';

describe('focusLost', () => {
  const body = { tag: 'body' };

  it('is true when nothing, or only the body, has focus (a focused control just unmounted)', () => {
    expect(focusLost({ body, activeElement: body })).toBe(true);
    expect(focusLost({ body, activeElement: null })).toBe(true);
  });

  it('is false while Hari is on a control, so focus is never taken from him', () => {
    expect(focusLost({ body, activeElement: { tag: 'button' } })).toBe(false);
  });

  it('is false without a document (nothing to move)', () => {
    expect(focusLost(undefined)).toBe(false);
  });
});
