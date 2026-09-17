// scripts/poker/cli.slow.test.js
// Opt-in (POKER_SLOW=1): runs the real CLIs end to end on tiny budgets in a temp directory.
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ARCHETYPES } from '../../src/private/trainers/poker/bots/dials.js';

const run = (args) => spawnSync(process.execPath, args, { encoding: 'utf8' });

describe.skipIf(!process.env.POKER_SLOW)('poker CLIs', () => {
  it('benchmark --smoke writes results and exits 0 on pass or 1 on fail', () => {
    const dir = mkdtempSync(join(tmpdir(), 'poker-bench-'));
    const data = join(dir, 'bots-test.json');
    const personas = [{ id: 'duchess', name: 'Duchess', tag: 'DCH', style: 'tight-aggressive', brain: 'heuristic', dials: ARCHETYPES['tight-aggressive'] }];
    writeFileSync(data, JSON.stringify({ version: 'bots-test', personas, benchmark: null }));
    const result = run(['scripts/poker/benchmark.js', '--smoke', '--threads', '2', '--data', data, '--write']);
    expect([0, 1]).toContain(result.status);
    expect(result.stdout).toContain('group vs previous version: skipped');
    const written = JSON.parse(readFileSync(data, 'utf8'));
    // 4 baselines (gating, adapt off) + 3 probes gating with adapt on + 3 probes informational with adapt off
    expect(written.benchmark.matchups.length).toBe(10);
    expect(written.benchmark.matchups.filter((m) => m.gating).length).toBe(7);
    expect(written.benchmark.passed).toBe(result.status === 0);
    expect(written.benchmark.hands).toBe(3000);
  }, 600_000);
});
