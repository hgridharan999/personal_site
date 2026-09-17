// scripts/poker/cli.slow.test.js
// Opt-in (POKER_SLOW=1): runs the real CLIs end to end on tiny budgets in a temp directory.
import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARCHETYPES } from '../../src/private/trainers/poker/bots/dials.js';

const BENCHMARK_SCRIPT = fileURLToPath(new URL('./benchmark.js', import.meta.url));
const TRAIN_SCRIPT = fileURLToPath(new URL('./train.js', import.meta.url));
const SPAWN_TIMEOUT_MS = 550_000; // leaves headroom under the test's own 600_000ms timeout for cleanup/assertions
const run = (args) => spawnSync(process.execPath, args, { encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS });

let tempDirs = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe.skipIf(!process.env.POKER_SLOW)('poker CLIs', () => {
  it('benchmark --smoke writes results and exits 0 on pass or 1 on fail', () => {
    const dir = mkdtempSync(join(tmpdir(), 'poker-bench-'));
    tempDirs.push(dir);
    const data = join(dir, 'bots-test.json');
    const personas = [{ id: 'duchess', name: 'Duchess', tag: 'DCH', style: 'tight-aggressive', brain: 'heuristic', dials: ARCHETYPES['tight-aggressive'] }];
    writeFileSync(data, JSON.stringify({ version: 'bots-test', personas, benchmark: null }));
    const result = run([BENCHMARK_SCRIPT, '--smoke', '--threads', '2', '--data', data, '--write']);
    const context = `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`;
    expect([0, 1], context).toContain(result.status);
    expect(result.stdout, context).toContain('group vs previous version: skipped');
    const written = JSON.parse(readFileSync(data, 'utf8'));
    // 4 baselines (gating, adapt off) + 3 probes gating with adapt on + 3 probes informational with adapt off
    expect(written.benchmark.matchups.length, context).toBe(10);
    expect(written.benchmark.matchups.filter((m) => m.gating).length, context).toBe(7);
    expect(written.benchmark.passed, context).toBe(result.status === 0);
    expect(written.benchmark.hands, context).toBe(3000);
  }, 600_000);

  it('benchmark refuses --write below the 180-hand minimum and exits 2', () => {
    const dir = mkdtempSync(join(tmpdir(), 'poker-bench-'));
    tempDirs.push(dir);
    const data = join(dir, 'bots-test.json');
    const personas = [{ id: 'duchess', name: 'Duchess', tag: 'DCH', style: 'tight-aggressive', brain: 'heuristic', dials: ARCHETYPES['tight-aggressive'] }];
    writeFileSync(data, JSON.stringify({ version: 'bots-test', personas, benchmark: null }));
    const result = run([BENCHMARK_SCRIPT, '--hands', '60', '--threads', '1', '--data', data, '--write']);
    const context = `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`;
    expect(result.status, context).toBe(2);
  }, 30_000);

  it('benchmark exits 2 (not 1) when the data file is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'poker-bench-'));
    tempDirs.push(dir);
    const missing = join(dir, 'does-not-exist.json');
    const result = run([BENCHMARK_SCRIPT, '--smoke', '--threads', '1', '--data', missing]);
    const context = `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`;
    expect(result.status, context).toBe(2);
  }, 30_000);

  it('train --smoke writes a bots file with eight personas', () => {
    const dir = mkdtempSync(join(tmpdir(), 'poker-train-'));
    tempDirs.push(dir);
    const out = join(dir, 'bots-test.json');
    const started = Date.now();
    const result = run([TRAIN_SCRIPT, '--smoke', '--threads', '2', '--version', 'bots-test', '--out', out]);
    const context = `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`;
    expect(result.status, context).toBe(0);
    expect(Date.now() - started, context).toBeLessThan(60_000);
    expect(result.stdout.split('\n').filter((line) => line.startsWith('gen ')).length, context).toBe(2);
    const data = JSON.parse(readFileSync(out, 'utf8'));
    expect(data.version).toBe('bots-test');
    expect(data.personas.length).toBe(8);
    expect(data.training.generations).toBe(2);
    expect(data.training.threads).toBe(2);
    expect(data.benchmark).toBeNull();
  }, 600_000);

  it('train exits 2 on bad budget flags', () => {
    const result = run([TRAIN_SCRIPT, '--population', 'many']);
    expect(result.status, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`).toBe(2);
  }, 30_000);
});
