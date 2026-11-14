// The unsent answers and take, kept in localStorage per night until submit succeeds, so a refresh
// or a night that closed at 3am loses nothing. Storage can be missing, blocked or full: every
// access is wrapped, and a failure reads as "no draft" or does nothing.

const keyFor = (night) => `nightly:draft:${night}`;

export const emptyDraft = () => ({ answers: ['', '', ''], storyIndex: null, take: '' });

const isStoryIndex = (value) => Number.isInteger(value) && value >= 0 && value <= 2;

/** Coerces whatever was stored into `{ answers: string[3], storyIndex, take }`, or null. */
function normalize(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const answers = Array.isArray(value.answers) ? value.answers : [];
  return {
    answers: [0, 1, 2].map((i) => (typeof answers[i] === 'string' ? answers[i] : '')),
    storyIndex: isStoryIndex(value.storyIndex) ? value.storyIndex : null,
    take: typeof value.take === 'string' ? value.take : '',
  };
}

export function loadDraft(storage, night) {
  try {
    const raw = storage.getItem(keyFor(night));
    return raw ? normalize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveDraft(storage, night, draft) {
  try {
    const value = normalize(draft);
    if (value) storage.setItem(keyFor(night), JSON.stringify(value));
  } catch {
    // blocked or full: the draft lives only in the page until submit
  }
}

export function clearDraft(storage, night) {
  try {
    storage.removeItem(keyFor(night));
  } catch {
    // nothing to clear
  }
}

const blank = (text) => typeof text !== 'string' || text.trim() === '';

/** The longest answer or take the server accepts, so the boxes stop there too. */
export const MAX_CHARS = 4000;

/** The form's fields are `a0`..`a2`, `story` and `take`: each control's id, and its error's. */
export const fieldId = (field) => `nt-${field}`;
export const errorId = (field) => `nt-${field}-err`;

/**
 * What still needs filling before submit, as `{ field, message }` in page order, so the form can
 * mark and focus the first one. The server checks the same rules again.
 */
export function draftProblems(draft) {
  const problems = draft.answers
    .map((answer, i) => (blank(answer) ? { field: `a${i}`, message: `Answer question ${i + 1}.` } : null))
    .filter(Boolean);
  if (!isStoryIndex(draft.storyIndex)) problems.push({ field: 'story', message: 'Pick the story your take is on.' });
  if (blank(draft.take)) problems.push({ field: 'take', message: 'Write your take.' });
  return problems;
}

/** The submit action's body, from a complete draft. */
export function toSubmitBody(sessionId, draft) {
  return {
    sessionId,
    answers: draft.answers.map((answer, idx) => ({ idx, answer: answer.trim() })),
    take: { storyIndex: draft.storyIndex, body: draft.take.trim() },
  };
}
