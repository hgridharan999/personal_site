// Generates tonight's flaw puzzle on demand: the code picks the flaw, setting and choices; the
// model writes the argument. The first insert for a night wins, so the row is always re-read.
import { getPuzzles, insertPuzzles, recentFlawKeys } from './gamesQueries.js';
import { flawByKey, pickFlaw, flawChoices, pickOne, SETTINGS } from './flaws.js';
import { addDays } from './dates.js';

export async function runPuzzles({ sql, model, night, deadline, rand = Math.random }) {
  const existing = await getPuzzles(sql, night);
  if (existing) return existing;

  const recent = await recentFlawKeys(sql, addDays(night, -7));
  const flawKey = pickFlaw({ recentFlawKeys: recent, rand });
  const setting = pickOne(SETTINGS, rand);
  const { choices, answerIndex } = flawChoices(flawKey, rand);
  const flaw = flawByKey(flawKey);

  const { argument, explanation } = await model.writeFlaw({
    flaw: { key: flaw.key, name: flaw.name, definition: flaw.definition },
    setting,
    deadline,
  });

  await insertPuzzles(sql, night, {
    flaw_key: flawKey, setting, argument, choices, answer_index: answerIndex, explanation,
  });
  return getPuzzles(sql, night);
}
