// Every nightly read and write. Neon over HTTP can't read-then-branch inside a transaction, so each
// state change is ONE conditional statement that only succeeds from the expected status (a CTE where
// several tables change). Zero rows back means the state was wrong. Dates are read as date::text.
// The 6-minute claim and lease windows are written literally: an interpolated value would be sent
// as a bind parameter, not SQL.

// ---- reads ------------------------------------------------------------------------------------

export async function getSessionByDate(sql, date) {
  const [row] = await sql`
    SELECT id, date::text AS date, status, stories, niche, questions, grade_error
    FROM nightly_sessions WHERE date = ${date}::date`;
  return row ?? null;
}

export async function getSessionById(sql, id) {
  const [row] = await sql`
    SELECT id, date::text AS date, status, stories, niche, questions, grade_error
    FROM nightly_sessions WHERE id = ${id}::uuid`;
  return row ?? null;
}

export async function getAnswersAndTake(sql, sessionId) {
  const [answers, takes] = await Promise.all([
    sql`
      SELECT idx, question_type, prompt, answer, score, feedback
      FROM nightly_answers WHERE session_id = ${sessionId}::uuid ORDER BY idx`,
    sql`
      SELECT story_index, body, model_take, follow_up, published, published_at
      FROM nightly_takes WHERE session_id = ${sessionId}::uuid`,
  ]);
  return { answers, take: takes[0] ?? null };
}

/** The question types of each brief dated from `from` up to (not including) `beforeDate`. */
export async function weekTypes(sql, from, beforeDate) {
  const rows = await sql`
    SELECT questions FROM nightly_sessions s
    WHERE s.date >= ${from}::date AND s.date < ${beforeDate}::date AND s.questions IS NOT NULL`;
  return rows.map((r) => (Array.isArray(r.questions) ? r.questions.map((q) => q?.type) : []));
}

/** Niche fields used on or after `sinceDate`. */
export async function recentNicheTopics(sql, sinceDate) {
  const rows = await sql`
    SELECT niche->>'topic' AS topic FROM nightly_sessions s
    WHERE s.date >= ${sinceDate}::date AND s.niche IS NOT NULL`;
  return rows.map((r) => r.topic).filter(Boolean);
}

/** Published takes, newest first, with the headline, url and source of the story each answers. */
export async function listNotes(sql, limit = 100) {
  return sql`
    SELECT s.date::text AS date, t.body,
           s.stories -> t.story_index::int ->> 'headline' AS headline,
           s.stories -> t.story_index::int ->> 'url' AS url,
           s.stories -> t.story_index::int ->> 'source' AS source
    FROM nightly_takes t JOIN nightly_sessions s ON s.id = t.session_id
    WHERE t.published
    ORDER BY s.date DESC
    LIMIT ${limit}::int`;
}

// ---- generate ---------------------------------------------------------------------------------

/** Claims the night, or a claim gone stale after 6 minutes. Returns the session id, or null. */
export async function claimGeneration(sql, date) {
  const [row] = await sql`
    INSERT INTO nightly_sessions (date, status, generation_started_at)
    VALUES (${date}::date, 'generating', now())
    ON CONFLICT (date) DO UPDATE SET generation_started_at = now()
      WHERE nightly_sessions.status = 'generating'
        AND nightly_sessions.generation_started_at < now() - interval '6 minutes'
    RETURNING id`;
  return row?.id ?? null;
}

/** Fills the brief and sets `generated`, only while the claim still holds. Returns the row or null. */
export async function saveBrief(sql, id, brief) {
  const [row] = await sql`
    UPDATE nightly_sessions
    SET stories = ${JSON.stringify(brief.stories)}::jsonb,
        niche = ${JSON.stringify(brief.niche)}::jsonb,
        questions = ${JSON.stringify(brief.questions)}::jsonb,
        status = 'generated'
    WHERE id = ${id}::uuid AND status = 'generating'
    RETURNING id, date::text AS date, status, stories, niche, questions, grade_error`;
  return row ?? null;
}

/** Drops a failed claim so Generate works again. */
export async function releaseClaim(sql, id) {
  await sql`DELETE FROM nightly_sessions WHERE id = ${id}::uuid AND status = 'generating'`;
}

// ---- submit -----------------------------------------------------------------------------------

/**
 * generated → submitted, plus the three answers and the take, in one statement that only runs for
 * tonight's session. `prompts` is `[{ idx, questionType, prompt }]` from the stored questions.
 * Returns the number of sessions moved (0 or 1).
 */
export async function submit(sql, { sessionId, night, answers, take, prompts }) {
  const byIdx = new Map(prompts.map((p) => [p.idx, p]));
  const rows = answers.map((a) => ({
    idx: a.idx,
    question_type: byIdx.get(a.idx).questionType,
    prompt: byIdx.get(a.idx).prompt,
    answer: a.answer,
  }));
  const [{ updated }] = await sql`
    WITH s AS (
      UPDATE nightly_sessions SET status = 'submitted', submitted_at = now()
      WHERE id = ${sessionId}::uuid AND status = 'generated' AND date = ${night}::date
      RETURNING id
    ), a AS (
      INSERT INTO nightly_answers (session_id, idx, question_type, prompt, answer)
      SELECT s.id, x.idx, x.question_type, x.prompt, x.answer
      FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)
        AS x(idx int, question_type text, prompt text, answer text)
      CROSS JOIN s
    ), t AS (
      INSERT INTO nightly_takes (session_id, story_index, body)
      SELECT s.id, ${take.storyIndex}::smallint, ${take.body}::text FROM s
    )
    SELECT count(*)::int AS updated FROM s`;
  return updated;
}

// ---- grade ------------------------------------------------------------------------------------

/** submitted → grading, or takes over a lease older than 6 minutes. True when this caller holds it. */
export async function claimGrading(sql, id) {
  const rows = await sql`
    UPDATE nightly_sessions SET status = 'grading', grading_started_at = now()
    WHERE id = ${id}::uuid
      AND (status = 'submitted'
           OR (status = 'grading' AND grading_started_at < now() - interval '6 minutes'))
    RETURNING id`;
  return rows.length > 0;
}

/** Scores, feedback, the blind take and the follow-up, and `graded`, gated on `grading`. */
export async function saveGrade(sql, id, result, blindTake) {
  const scores = result.scores.map(({ idx, score, feedback }) => ({ idx, score, feedback }));
  const [{ updated }] = await sql`
    WITH s AS (
      UPDATE nightly_sessions SET status = 'graded', graded_at = now(), grade_error = NULL
      WHERE id = ${id}::uuid AND status = 'grading'
      RETURNING id
    ), a AS (
      UPDATE nightly_answers AS n SET score = x.score, feedback = x.feedback
      FROM jsonb_to_recordset(${JSON.stringify(scores)}::jsonb) AS x(idx int, score int, feedback text), s
      WHERE n.session_id = s.id AND n.idx = x.idx
    ), t AS (
      UPDATE nightly_takes AS k SET model_take = ${blindTake}::text, follow_up = ${result.followUp}::text
      FROM s WHERE k.session_id = s.id
    )
    SELECT count(*)::int AS updated FROM s`;
  return updated;
}

/** grading → submitted with the error, so the page offers Retry. */
export async function failGrading(sql, id, message) {
  await sql`
    UPDATE nightly_sessions SET status = 'submitted', grade_error = ${message}::text, grading_started_at = NULL
    WHERE id = ${id}::uuid AND status = 'grading'`;
}

// ---- publish ----------------------------------------------------------------------------------

/** One-way: only a graded, not yet published take. True when it published. */
export async function publish(sql, id) {
  const rows = await sql`
    WITH s AS (SELECT id FROM nightly_sessions WHERE id = ${id}::uuid AND status = 'graded')
    UPDATE nightly_takes AS k SET published = true, published_at = now()
    FROM s WHERE k.session_id = s.id AND NOT k.published
    RETURNING k.session_id`;
  return rows.length > 0;
}
