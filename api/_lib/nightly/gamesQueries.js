// Queries for the nightly games. Dates are read as night::text and numeric as score::float8,
// because Neon returns numeric as a string. Puzzle results are insert-only; catalog scores upsert.

export async function getPuzzles(sql, night) {
  const [row] = await sql`
    SELECT night::text AS night, flaw FROM nightly_puzzles WHERE night = ${night}::date`;
  return row ?? null;
}

/** First insert wins: a second generation for the same night is dropped. */
export async function insertPuzzles(sql, night, flaw) {
  await sql`
    INSERT INTO nightly_puzzles (night, flaw)
    VALUES (${night}::date, ${JSON.stringify(flaw)}::jsonb)
    ON CONFLICT (night) DO NOTHING`;
}

export async function recentFlawKeys(sql, sinceNight) {
  const rows = await sql`
    SELECT flaw->>'flaw_key' AS flaw_key FROM nightly_puzzles WHERE night >= ${sinceNight}::date`;
  return rows.map((r) => r.flaw_key).filter(Boolean);
}

export async function getResults(sql, night) {
  return sql`
    SELECT game, score::float8 AS score, detail
    FROM nightly_game_results WHERE night = ${night}::date ORDER BY game`;
}

/** Both ends inclusive. */
export async function getHistory(sql, fromNight, toNight) {
  return sql`
    SELECT night::text AS night, game, score::float8 AS score
    FROM nightly_game_results
    WHERE night >= ${fromNight}::date AND night <= ${toNight}::date
    ORDER BY night, game`;
}

/** Insert-only. Returns true when a row was written, false when the puzzle was already solved. */
export async function insertPuzzleResult(sql, { night, game, score, detail }) {
  const rows = await sql`
    INSERT INTO nightly_game_results (night, game, score, detail)
    VALUES (${night}::date, ${game}, ${score}::numeric, ${JSON.stringify(detail)}::jsonb)
    ON CONFLICT DO NOTHING
    RETURNING game`;
  return rows.length > 0;
}

export async function upsertGameScore(sql, { night, game, score }) {
  await sql`
    INSERT INTO nightly_game_results (night, game, score)
    VALUES (${night}::date, ${game}, ${score}::numeric)
    ON CONFLICT (night, game) DO UPDATE SET score = EXCLUDED.score, updated_at = now()`;
}
