import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { canonicalJson, configKey } from './configKey.js';

describe('canonicalJson', () => {
  it('sorts keys recursively and drops undefined', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: undefined } }))
      .toBe('{"a":{"d":[3,{"y":2,"z":1}]},"b":1}');
  });
});

describe('configKey', () => {
  it('is a sha-256 hex of the canonical json', async () => {
    const input = { trainer: 'zetamac', config: { duration: 120, add: true } };
    const expected = createHash('sha256')
      .update('{"config":{"add":true,"duration":120},"profileVersion":null,"trainer":"zetamac"}')
      .digest('hex');
    expect(await configKey(input)).toBe(expected);
  });
  it('ignores key order and distinguishes different settings', async () => {
    const a = await configKey({ trainer: 'zetamac', config: { add: true, duration: 120 } });
    const b = await configKey({ trainer: 'zetamac', config: { duration: 120, add: true } });
    const c = await configKey({ trainer: 'zetamac', config: { duration: 60, add: true } });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  it('includes profile version', async () => {
    const v1 = await configKey({ trainer: 'optiver', config: {}, profileVersion: 1 });
    const v2 = await configKey({ trainer: 'optiver', config: {}, profileVersion: 2 });
    expect(v1).not.toBe(v2);
  });
});
