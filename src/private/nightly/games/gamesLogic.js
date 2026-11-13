// Pure helpers for the Games section: answer parsing, the 14-night history grid, and the score
// log form. No React and no imports from api/, so it all runs in plain vitest.

const DAY_MS = 86400000;
const HISTORY_NIGHTS = 14;
const PUZZLE_ROWS = [
  { key: 'puzzle_sprint', name: 'Sprint', unit: 'of 5' },
  { key: 'puzzle_flaw', name: 'Spot the flaw', unit: 'of 1' },
];

/**
 * Reads a typed answer: strips spaces, commas, $, %, a x sign, and one trailing x, M or k (kept as
 * typed, not multiplied: the prompts already ask "in $M"). Keeps a leading minus.
 */
export function parseAnswer(text) {
  const cleaned = String(text ?? '')
    .replace(/[\s,$%×]/g, '')
    .replace(/[xmk]$/i, '')
    .replace(/^[−–]/, '-');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** How many sprint answers are blank or unreadable (would be sent as null). */
export const unreadableCount = (texts) => texts.filter((t) => parseAnswer(t) === null).length;

export const unreadableNotice = (count) => (
  `${count} ${count === 1 ? 'answer is' : 'answers are'} blank or unreadable. Press Submit again to finish anyway.`
);

/** The log entries that differ from tonight's logged scores, compared as numbers (1.9 equals 1.90). */
export function changedEntries(entries, logged) {
  return entries.filter(({ game, score }) => {
    const prev = logged?.[game];
    return prev === undefined || prev === null || Number(prev) !== Number(score);
  });
}

/** `n` night strings ending with `night`, oldest first. UTC arithmetic, so DST cannot shift a day. */
export function nightsBack(night, n) {
  const end = Date.parse(`${night}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => new Date(end - (n - 1 - i) * DAY_MS).toISOString().slice(0, 10));
}

/** Sprint and Spot the flaw first, then the catalog in its order; one cell per night, null if unplayed. */
export function historyGrid(payload) {
  const nights = nightsBack(payload.night, HISTORY_NIGHTS);
  const scores = new Map((payload.history ?? []).map((h) => [`${h.game}|${h.night}`, h.score]));
  const defs = [...PUZZLE_ROWS, ...(payload.catalog ?? [])];
  const rows = defs.map(({ key, name, unit }) => ({
    key,
    name,
    unit,
    cells: nights.map((night) => scores.get(`${key}|${night}`) ?? null),
  }));
  return { nights, rows };
}

export const formatScore = (value, decimals) => Number(value).toLocaleString('en-US', {
  minimumFractionDigits: decimals,
  maximumFractionDigits: decimals,
});

export function formatSeconds(s) {
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const sprintSummary = (result) => `${result.score}/5 in ${formatSeconds(result.seconds)}`;

/** Input strings for the log form, from tonight's logged scores. */
export function logInputs(catalog, logged) {
  return Object.fromEntries(catalog.map(({ key, decimals }) => {
    const v = logged?.[key];
    return [key, v === undefined || v === null ? '' : formatScore(v, decimals).replace(/,/g, '')];
  }));
}

function decimalsOf(n) {
  const [, frac = ''] = String(n).split('.');
  return frac.length;
}

/** Reads the log form: blanks skipped, each filled input checked against its game's range and decimals. */
export function readLogInputs(catalog, inputs) {
  const entries = [];
  const errors = {};
  for (const { key, name, min, max, decimals } of catalog) {
    const raw = inputs?.[key];
    if (raw === undefined || raw === null || String(raw).trim() === '') continue;
    const score = parseAnswer(raw);
    if (score === null) errors[key] = `${name}: enter a number`;
    else if (score < min || score > max) errors[key] = `${name}: enter ${formatScore(min, 0)} to ${formatScore(max, 0)}`;
    else if (decimalsOf(score) > decimals) {
      errors[key] = decimals === 0 ? `${name}: whole numbers only` : `${name}: up to ${decimals} decimals`;
    } else entries.push({ game: key, score });
  }
  return { entries, errors };
}
