import { describe, it, expect, vi } from 'vitest';
import { runPuzzles } from './puzzleGen.js';
import { mockSql } from '../testing.js';

const NIGHT = '2026-11-13';

function db(routes) {
  return mockSql((text) => {
    const hit = routes.find(([fragment]) => text.includes(fragment));
    if (!hit) return [];
    return typeof hit[1] === 'function' ? hit[1]() : hit[1];
  });
}
const issued = (sql, fragment) => sql.queries.filter((q) => q.text.includes(fragment));

const EXISTING = { night: NIGHT, flaw: { flaw_key: 'sunk_cost', choices: ['a', 'b', 'c', 'd'], answer_index: 0 } };

describe('runPuzzles', () => {
  it('returns the existing row without calling the model', async () => {
    const sql = db([['FROM nightly_puzzles WHERE night', [EXISTING]]]);
    const model = { writeFlaw: vi.fn() };
    const row = await runPuzzles({ sql, model, night: NIGHT, deadline: 1 });
    expect(row).toEqual(EXISTING);
    expect(model.writeFlaw).not.toHaveBeenCalled();
    expect(issued(sql, 'INSERT')).toHaveLength(0);
  });

  it('generates, inserts and re-reads when missing', async () => {
    let inserted = null;
    let reads = 0;
    const sql = mockSql((text, values) => {
      if (text.includes('INSERT INTO nightly_puzzles')) { inserted = JSON.parse(values.find((v) => typeof v === 'string' && v.startsWith('{'))); return []; }
      if (text.includes('SELECT flaw->>')) return [];
      if (text.includes('FROM nightly_puzzles WHERE night')) { reads += 1; return reads === 1 ? [] : [{ night: NIGHT, flaw: inserted }]; }
      return [];
    });
    const model = { writeFlaw: vi.fn().mockResolvedValue({ argument: 'arg', explanation: 'exp' }) };
    const row = await runPuzzles({ sql, model, night: NIGHT, deadline: 5, rand: () => 0.3 });
    expect(model.writeFlaw).toHaveBeenCalledTimes(1);
    expect(issued(sql, 'INSERT INTO nightly_puzzles')).toHaveLength(1);
    const call = model.writeFlaw.mock.calls[0][0];
    expect(call.deadline).toBe(5);
    expect(inserted.argument).toBe('arg');
    expect(inserted.explanation).toBe('exp');
    expect(inserted.setting).toBe(call.setting);
    expect(inserted.choices[inserted.answer_index]).toBe(call.flaw.name);
    expect(inserted.flaw_key).toBe(call.flaw.key);
    expect(row.flaw).toEqual(inserted);
    // the three wrong choices go to the model as flaws to avoid
    expect(call.avoid).toHaveLength(3);
    const wrong = inserted.choices.filter((_, i) => i !== inserted.answer_index);
    expect(call.avoid.map((a) => a.name).sort()).toEqual([...wrong].sort());
    call.avoid.forEach((a) => expect(Object.keys(a).sort()).toEqual(['definition', 'key', 'name']));
  });

  it('inserts nothing and rethrows when the model fails', async () => {
    const sql = db([]);
    const model = { writeFlaw: vi.fn().mockRejectedValue(new Error('boom')) };
    await expect(runPuzzles({ sql, model, night: NIGHT, deadline: 1 })).rejects.toThrow('boom');
    expect(issued(sql, 'INSERT')).toHaveLength(0);
  });
});
