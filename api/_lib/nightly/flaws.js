import { sample } from './picker.js';

export const FLAWS = Object.freeze([
  { key: 'survivorship', name: 'Survivorship bias', definition: 'Drawing conclusions from the cases that survived a filter while ignoring those that were filtered out.' },
  { key: 'base_rate', name: 'Base rate neglect', definition: 'Ignoring how common something is overall when judging how likely it is given a specific piece of evidence.' },
  { key: 'correlation_causation', name: 'Correlation as causation', definition: 'Treating two things that move together as proof that one causes the other, ignoring confounders or reverse causation.' },
  { key: 'selection_bias', name: 'Selection bias', definition: 'Generalizing from a sample that was not chosen representatively of the population in question.' },
  { key: 'small_sample', name: 'Small sample', definition: 'Drawing a firm conclusion from too few observations to rule out chance.' },
  { key: 'regression_to_mean', name: 'Regression to the mean', definition: 'Crediting an intervention for an extreme result that would have drifted back toward average anyway.' },
  { key: 'sunk_cost', name: 'Sunk cost', definition: 'Continuing an effort because of what has already been spent rather than what it will return from here.' },
  { key: 'percentage_points', name: 'Percentage versus percentage points', definition: 'Confusing a relative percentage change with an absolute change in percentage points, or the reverse.' },
  { key: 'cherry_picked_window', name: 'Cherry-picked window', definition: 'Choosing the start and end dates of a comparison so the trend looks the way the argument needs.' },
  { key: 'goodhart', name: "Goodhart's law", definition: 'Once a measure becomes a target, people optimize the measure and it stops tracking the thing it was meant to track.' },
].map((f) => Object.freeze(f)));

export const SETTINGS = Object.freeze([
  'a SaaS startup', 'a hospital system', 'a retail chain', 'a logistics company', 'a bank',
  'a school district', 'a manufacturing plant', 'a restaurant group', 'a city government', 'a game studio',
  'a sales team', 'a customer support desk',
]);

export function flawByKey(key) {
  const flaw = FLAWS.find((f) => f.key === key);
  if (!flaw) throw new Error(`Unknown flaw key: ${key}`);
  return flaw;
}

/** A flaw key not used recently; falls back to every key if all are recent. */
export function pickFlaw({ recentFlawKeys, rand = Math.random }) {
  const recent = new Set(recentFlawKeys);
  const open = FLAWS.filter((f) => !recent.has(f.key));
  return sample(open.length ? open : FLAWS, 1, rand)[0].key;
}

/** Four shuffled flaw names: the answer plus three distractors. */
export function flawChoices(key, rand = Math.random) {
  const answer = flawByKey(key).name;
  const distractors = sample(FLAWS.filter((f) => f.key !== key), 3, rand).map((f) => f.name);
  const choices = sample([answer, ...distractors], 4, rand);
  return { choices, answerIndex: choices.indexOf(answer) };
}

export const pickOne = (list, rand = Math.random) => sample(list, 1, rand)[0];
