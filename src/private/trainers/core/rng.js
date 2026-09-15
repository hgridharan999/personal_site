// Injectable randomness: production passes Math.random, tests pass mulberry32(seed).

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Same arithmetic as Zetamac's randGen: min + floor(random * (max - min + 1)).
export const randInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));

export const pick = (rng, items) => items[Math.floor(rng() * items.length)];

export function weightedPick(rng, items, weightOf = (x) => x.weight) {
  const total = items.reduce((sum, x) => sum + weightOf(x), 0);
  let r = rng() * total;
  for (const item of items) {
    r -= weightOf(item);
    if (r < 0) return item;
  }
  return items[items.length - 1];
}
