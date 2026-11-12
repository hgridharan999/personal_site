// Which screen /nightly shows, from tonight's session and what the page is doing. Pure, so the
// rules that keep grading content hidden until a session is graded are tested without React.

/**
 * Display names for the question types. A local copy on purpose: the frontend never imports
 * from api/, and these names are only labels.
 */
export const TYPE_NAMES = Object.freeze({
  second_order: 'Second-order effects',
  incentives: 'Incentives',
  find_flaw: 'Find the flaw',
  forecast: 'Forecast',
  base_rates: 'Base rates',
  estimate: 'Estimate',
  decide: 'Decide',
  compress: 'Compress',
  case_rep: 'Case rep',
});

export const typeName = (key) => TYPE_NAMES[key] ?? key;

/** True while the server is still making a brief or a grade, so the page should keep polling. */
export const isBusy = (session) => session?.status === 'generating' || session?.status === 'grading';

/** `complete` and `missed` are reserved for later features; this build never sets them. */
const RESERVED = new Set(['complete', 'missed']);

/**
 * @param {{ session: object|null }|null} today  the last `today` response, or null before the first
 * @param {{ generating?: boolean, grading?: boolean, error?: unknown }} ui
 * @returns {'loading'|'empty'|'generating'|'form'|'locked'|'grading'|'gradeFailed'|'graded'|'error'}
 */
export function viewFor(today, ui = {}) {
  const { generating = false, grading = false, error = null } = ui;
  if (error) return 'error';
  if (!today) return 'loading';

  const { session } = today;
  if (!session) return generating ? 'generating' : 'empty';

  switch (session.status) {
    case 'generating': return 'generating';
    case 'generated': return 'form';
    // A submitted session without an error is about to be graded (the page calls grade once on
    // mount); a refresh mid-grade lands on `grading`. Neither ever offers Retry.
    case 'submitted': return session.gradeError && !grading ? 'gradeFailed' : 'grading';
    case 'grading': return 'grading';
    case 'graded': return 'graded';
    default: return RESERVED.has(session.status) ? 'locked' : 'error';
  }
}

const MESSAGES = {
  NIGHT_CLOSED: 'This night closed at 3am. Your draft is saved on this device.',
  GENERATION_FAILED: 'The brief did not come together. Try again.',
  GRADING_FAILED: 'Grading did not finish. Try again.',
  NOT_OPEN: 'These answers were already sent.',
  NOT_PUBLISHABLE: 'This take cannot be published now.',
};
const OFFLINE = 'Could not reach the server. Try again.';

/** The line the page shows for a failed call. Server wording is shown only for a 400. */
export function messageFor(error) {
  if (MESSAGES[error?.code]) return MESSAGES[error.code];
  if (error?.status === 401) return 'Your sign-in ran out. Sign in again; your draft is saved.';
  if (error?.status === 400 && error.message) return error.message;
  return OFFLINE;
}
