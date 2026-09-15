import { describe, it, expect, vi, afterEach } from 'vitest';

const ORIGINAL = process.env.DATABASE_URL;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL;
  vi.restoreAllMocks();
  vi.resetModules();
});

async function freshDb() {
  vi.resetModules();
  return import('./db.js');
}

describe('getSql', () => {
  it('returns null when DATABASE_URL is unset', async () => {
    delete process.env.DATABASE_URL;
    const { getSql } = await freshDb();
    expect(getSql()).toBeNull();
  });

  it('returns null for a malformed DATABASE_URL without logging the connection string', async () => {
    process.env.DATABASE_URL = 'postgres//bad url with password=secret';
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { getSql } = await freshDb();
    expect(() => getSql()).not.toThrow();
    expect(getSql()).toBeNull();
    expect(errors).toHaveBeenCalled();
    const logged = errors.mock.calls.flat().map(String).join(' ');
    expect(logged).toContain('DATABASE_URL is malformed');
    expect(logged).not.toContain('secret');
  });
});
