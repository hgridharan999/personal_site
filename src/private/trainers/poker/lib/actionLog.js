// Human-readable lines for the action log and the aria-live announcer.
// Hole cards are read only through viewFor(state, heroSeat), so bots' unrevealed cards never appear.
import { applyEvent, legalActions } from '../engine/handState.js';
import { categoryOf, CATEGORY_NAMES } from '../engine/evaluator.js';
import { viewFor } from '../engine/view.js';
import { cardText, formatBbLabel } from './format.js';

const STREET_BY_BOARD_SIZE = { 3: 'Flop', 4: 'Turn', 5: 'River' };

/** "You fold" / "Moss folds". */
const says = (name, verb) => (name === 'You' ? `You ${verb}` : `${name} ${verb}s`);

const cardsText = (cards) => cards.map(cardText).join(' ');

function describeAct(event, before, after, nameOf) {
  const name = nameOf(event.seat);
  const player = after.players.find((p) => p.seat === event.seat);
  const allIn = player.stack === 0 ? ' (all-in)' : '';
  if (event.action === 'fold') return says(name, 'fold');
  if (event.action === 'check') return says(name, 'check');
  if (event.action === 'call') return `${says(name, 'call')} ${formatBbLabel(legalActions(before).toCall)}${allIn}`;
  if (event.action === 'bet') return `${says(name, 'bet')} ${formatBbLabel(event.amount)}${allIn}`;
  return `${says(name, 'raise')} to ${formatBbLabel(event.amount)}${allIn}`;
}

function describe(event, before, after, { nameOf, heroSeat }) {
  if (event.type === 'start') {
    const blind = (seat) => after.players.find((p) => p.seat === seat).committed;
    return [
      `${says(nameOf(after.sbSeat), 'post')} ${formatBbLabel(blind(after.sbSeat))}`,
      `${says(nameOf(after.bbSeat), 'post')} ${formatBbLabel(blind(after.bbSeat))}`,
    ];
  }
  if (event.type === 'hole') {
    if (event.seat !== heroSeat) return [];
    return [`You are dealt ${cardsText(viewFor(after, heroSeat).players.find((p) => p.seat === heroSeat).hole)}`];
  }
  if (event.type === 'board') return [`${STREET_BY_BOARD_SIZE[after.board.length]}: ${cardsText(after.board)}`];
  if (event.type === 'act') return [describeAct(event, before, after, nameOf)];
  return [];
}

/** Showdown reveals and winners for a completed hand. */
export function resultLines(state, { nameOf, heroSeat }) {
  if (!state?.result) return [];
  const { awards, showdown, scores, shown } = state.result;
  const view = viewFor(state, heroSeat);
  const lines = shown.map((seat) => `${says(nameOf(seat), 'show')} ${cardsText(view.players.find((p) => p.seat === seat).hole)}`);
  const winners = Object.keys(awards).map(Number).filter((seat) => awards[seat] > 0).sort((a, b) => a - b);
  for (const seat of winners) {
    const made = showdown && scores?.[seat] !== undefined ? ` with ${CATEGORY_NAMES[categoryOf(scores[seat])].toLowerCase()}` : '';
    lines.push(`${says(nameOf(seat), 'win')} ${formatBbLabel(awards[seat])}${made}`);
  }
  return lines;
}

/**
 * Every line for a hand so far. `events` is the full hand log; `nameOf(seat)` returns "You" for the hero.
 * @returns {string[]}
 */
export function logLines(events, { nameOf, heroSeat }) {
  const lines = [];
  let state = null;
  for (const event of events) {
    const before = state;
    state = applyEvent(state, event);
    lines.push(...describe(event, before, state, { nameOf, heroSeat }));
  }
  return [...lines, ...resultLines(state, { nameOf, heroSeat })];
}
