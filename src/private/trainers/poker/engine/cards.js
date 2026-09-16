// Cards are integers 0..51: rank * 4 + suit. Rank 0..12 = 2..A, suit 0..3 = c, d, h, s.

export const RANKS = '23456789TJQKA';
export const SUITS = 'cdhs';

export const rankOf = (card) => card >> 2;
export const suitOf = (card) => card & 3;

export function parseCard(text) {
  const rank = RANKS.indexOf(text[0]);
  const suit = SUITS.indexOf(text[1]);
  if (text.length !== 2 || rank < 0 || suit < 0) throw new Error(`Bad card: ${text}`);
  return rank * 4 + suit;
}

export function parseCards(text) {
  if (text.length % 2 !== 0) throw new Error(`Bad cards: ${text}`);
  const cards = [];
  for (let i = 0; i < text.length; i += 2) cards.push(parseCard(text.slice(i, i + 2)));
  return cards;
}

export const cardToString = (card) => RANKS[card >> 2] + SUITS[card & 3];

export const cardsToString = (cards) => cards.map(cardToString).join('');

export const newDeck = () => Array.from({ length: 52 }, (_, i) => i);

/** Fisher–Yates on a copy. `rng` returns floats in [0, 1). */
export function shuffle(deck, rng) {
  const out = deck.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
