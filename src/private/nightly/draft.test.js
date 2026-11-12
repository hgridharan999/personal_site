import { describe, it, expect } from 'vitest';
import {
  loadDraft, saveDraft, clearDraft, emptyDraft, draftProblems, toSubmitBody, fieldId, errorId, MAX_CHARS,
} from './draft.js';

/** An in-memory Storage with the three methods the helpers use. */
function memoryStorage() {
  const map = new Map();
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

const throwing = {
  getItem: () => { throw new Error('blocked'); },
  setItem: () => { throw new Error('full'); },
  removeItem: () => { throw new Error('blocked'); },
};

const draft = { answers: ['one', 'two', 'three'], storyIndex: 1, take: 'I saw a queue at the pharmacy.' };

describe('draft storage', () => {
  it('round-trips a draft', () => {
    const storage = memoryStorage();
    saveDraft(storage, '2026-11-12', draft);
    expect(loadDraft(storage, '2026-11-12')).toEqual(draft);
  });

  it('keys drafts by night, so two nights do not share one', () => {
    const storage = memoryStorage();
    saveDraft(storage, '2026-11-12', draft);
    saveDraft(storage, '2026-11-13', { ...draft, take: 'another' });
    expect([...storage.map.keys()].sort()).toEqual(['nightly:draft:2026-11-12', 'nightly:draft:2026-11-13']);
    expect(loadDraft(storage, '2026-11-12').take).toBe(draft.take);
    expect(loadDraft(storage, '2026-11-13').take).toBe('another');
  });

  it('returns null for a night with no draft', () => {
    expect(loadDraft(memoryStorage(), '2026-11-12')).toBeNull();
  });

  it('returns null and no-ops when storage throws or is missing', () => {
    expect(loadDraft(throwing, '2026-11-12')).toBeNull();
    expect(() => saveDraft(throwing, '2026-11-12', draft)).not.toThrow();
    expect(() => clearDraft(throwing, '2026-11-12')).not.toThrow();
    expect(loadDraft(null, '2026-11-12')).toBeNull();
    expect(() => saveDraft(undefined, '2026-11-12', draft)).not.toThrow();
  });

  it('returns null for unreadable or wrongly shaped data', () => {
    const storage = memoryStorage();
    storage.setItem('nightly:draft:2026-11-12', '{not json');
    expect(loadDraft(storage, '2026-11-12')).toBeNull();
    storage.setItem('nightly:draft:2026-11-12', '"a string"');
    expect(loadDraft(storage, '2026-11-12')).toBeNull();
  });

  it('repairs a partial draft into the full shape', () => {
    const storage = memoryStorage();
    storage.setItem('nightly:draft:2026-11-12', JSON.stringify({ answers: ['a'], storyIndex: 7, take: 3 }));
    expect(loadDraft(storage, '2026-11-12')).toEqual({ answers: ['a', '', ''], storyIndex: null, take: '' });
  });

  it('clears only the given night', () => {
    const storage = memoryStorage();
    saveDraft(storage, '2026-11-12', draft);
    saveDraft(storage, '2026-11-13', draft);
    clearDraft(storage, '2026-11-12');
    expect(loadDraft(storage, '2026-11-12')).toBeNull();
    expect(loadDraft(storage, '2026-11-13')).toEqual(draft);
  });
});

describe('emptyDraft', () => {
  it('has three blank answers, no story and a blank take', () => {
    expect(emptyDraft()).toEqual({ answers: ['', '', ''], storyIndex: null, take: '' });
  });
});

describe('draftProblems', () => {
  it('is empty for a complete draft', () => {
    expect(draftProblems(draft)).toEqual([]);
  });

  it('lists each missing piece with the field it belongs to, treating whitespace as blank', () => {
    expect(draftProblems({ answers: ['ok', '  ', ''], storyIndex: null, take: '\n' })).toEqual([
      { field: 'a1', message: 'Answer question 2.' },
      { field: 'a2', message: 'Answer question 3.' },
      { field: 'story', message: 'Pick the story your take is on.' },
      { field: 'take', message: 'Write your take.' },
    ]);
  });
});

describe('field ids', () => {
  it('gives each field the id of its control, and its error an id of its own', () => {
    expect(fieldId('a0')).toBe('nt-a0');
    expect(fieldId('story')).toBe('nt-story');
    expect(fieldId('take')).toBe('nt-take');
    expect(errorId('a2')).toBe('nt-a2-err');
  });

  it('points every problem at a distinct control id', () => {
    const fields = draftProblems(emptyDraft()).map((p) => p.field);
    expect(fields).toEqual(['a0', 'a1', 'a2', 'story', 'take']);
    expect(new Set(fields.map(fieldId)).size).toBe(fields.length);
  });

  it('caps each text at the 4000 characters the server accepts', () => {
    expect(MAX_CHARS).toBe(4000);
  });
});

describe('toSubmitBody', () => {
  it('builds the submit body the API expects, trimmed', () => {
    expect(toSubmitBody('11111111-1111-4111-8111-111111111111', { ...draft, take: '  a take  ' })).toEqual({
      sessionId: '11111111-1111-4111-8111-111111111111',
      answers: [{ idx: 0, answer: 'one' }, { idx: 1, answer: 'two' }, { idx: 2, answer: 'three' }],
      take: { storyIndex: 1, body: 'a take' },
    });
  });
});
