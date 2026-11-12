// What the nightly API sends back, built from an explicit allow-list per status. Until a session is
// graded the response carries no grading field at all (not even as null), so nothing the grader
// wrote can colour the answers before they are locked and scored.

const BRIEF_STATUSES = new Set(['generated', 'submitted', 'grading', 'graded']);
const WRITTEN_STATUSES = new Set(['submitted', 'grading', 'graded']);

function answerView(a, graded) {
  const base = { idx: a.idx, questionType: a.question_type, prompt: a.prompt, answer: a.answer };
  return graded ? { ...base, score: a.score, feedback: a.feedback } : base;
}

function takeView(t, graded) {
  if (!t) return null;
  const base = { storyIndex: t.story_index, body: t.body };
  if (!graded) return base;
  return {
    ...base,
    modelTake: t.model_take,
    followUp: t.follow_up,
    published: t.published,
    publishedAt: t.published_at,
  };
}

/**
 * @param {object} row       a nightly_sessions row (date already text)
 * @param {object[]} answers nightly_answers rows for the session
 * @param {object|null} take the nightly_takes row, or null
 */
export function sessionView(row, answers = [], take = null) {
  const { status } = row;
  const view = { id: row.id, date: row.date, status };
  if (!BRIEF_STATUSES.has(status)) return view;
  Object.assign(view, { stories: row.stories, niche: row.niche, questions: row.questions });
  if (!WRITTEN_STATUSES.has(status)) return view;

  const graded = status === 'graded';
  view.answers = [...answers].sort((a, b) => a.idx - b.idx).map((a) => answerView(a, graded));
  view.take = takeView(take, graded);
  if (status === 'submitted' && row.grade_error) view.gradeError = row.grade_error;
  return view;
}

/** One public note: the published take and the story it answers. Never the blind take or follow-up. */
export function noteView(row) {
  return { date: row.date, body: row.body, headline: row.headline, url: row.url, source: row.source };
}
