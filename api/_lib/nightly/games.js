// Hari's five external daily games. He edits this list as his games change.
// Scoring was read from each game's own site on 2026-11-13; Krillion's range came from a third-party guide.
// Farflung and Hopdown publish no maximum, so their 100000 is only a guard against typos.

export const GAMES = Object.freeze([
  { key: 'krillion', name: 'Krillion', unit: 'points', min: 0, max: 700, decimals: 0, lowerIsBetter: false, url: 'https://krillion.io' },
  { key: 'chainle', name: 'Chainle', unit: 'points', min: 0, max: 5000, decimals: 0, lowerIsBetter: false, url: 'https://chainle.io' },
  { key: 'fermi', name: 'Fermi', unit: '× off', min: 1, max: 1000, decimals: 2, lowerIsBetter: true, url: 'https://fermi.gg' },
  { key: 'farflung', name: 'Farflung', unit: 'km', min: 0, max: 100000, decimals: 0, lowerIsBetter: false, url: 'https://farflung.game' },
  { key: 'hopdown', name: 'Hopdown', unit: 'metres', min: 0, max: 100000, decimals: 0, lowerIsBetter: false, url: 'https://hopdown.io' },
].map((g) => Object.freeze(g)));

export const PUZZLE_GAMES = Object.freeze({ sprint: 'puzzle_sprint', flaw: 'puzzle_flaw' });

export const gameByKey = (key) => GAMES.find((g) => g.key === key);

/** Float-tolerant: 1.94 has at most 2 decimals, 1.945 does not. */
export function hasAtMostDecimals(n, decimals) {
  const scaled = n * 10 ** decimals;
  return Math.abs(scaled - Math.round(scaled)) < 1e-9;
}
