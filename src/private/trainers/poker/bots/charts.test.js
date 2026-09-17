import { describe, it, expect } from 'vitest';
import { CLASS_COUNT, combosIn, parseClass } from './handClass.js';
import { CHART_SPECS } from '../../../../../scripts/poker/lib/chartGen.js';
import { chartKeys, chartFreqs, scaledFreqs, hasChart, STRENGTH_ORDER, RANK_PCT, topShareWeights } from './charts.js';

const c = parseClass;
// Share of all 1,326 combos that take an action, weighted by frequency.
const share = (key, action) => {
  let sum = 0;
  for (let cls = 0; cls < CLASS_COUNT; cls += 1) sum += chartFreqs(key, cls)[action] * combosIn(cls);
  return sum / 1326;
};

describe('preflop charts', () => {
  it('ships one chart per spec with 169 valid frequencies', () => {
    expect(chartKeys().sort()).toEqual(Object.keys(CHART_SPECS).sort());
    for (const key of chartKeys()) {
      for (let cls = 0; cls < CLASS_COUNT; cls += 1) {
        const { raise, call } = chartFreqs(key, cls);
        expect(raise + call).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
    expect(STRENGTH_ORDER.length).toBe(169);
    expect(new Set(STRENGTH_ORDER).size).toBe(169);
    expect(STRENGTH_ORDER[0]).toBe(c('AA'));
    expect(() => chartFreqs('open.BB', 0)).toThrow('Unknown chart: open.BB');
    expect(hasChart('open.UTG')).toBe(true);
  });

  it('opening ranges have the specified widths within 2 points and widen by position', () => {
    for (const key of ['open.UTG', 'open.HJ', 'open.CO', 'open.BTN', 'open.SB']) {
      expect(Math.abs(share(key, 'raise') - CHART_SPECS[key].value)).toBeLessThan(0.02);
    }
    // Tuning the order must not move the opening widths far from their tuned values (in combo share).
    const tuned = { 'open.UTG': 0.169, 'open.HJ': 0.191, 'open.CO': 0.259, 'open.BTN': 0.43, 'open.SB': 0.361 };
    for (const [key, width] of Object.entries(tuned)) expect(Math.abs(share(key, 'raise') - width), key).toBeLessThanOrEqual(0.02);
    expect(share('open.UTG', 'raise')).toBeLessThan(share('open.CO', 'raise'));
    expect(share('open.CO', 'raise')).toBeLessThan(share('open.BTN', 'raise'));
  });

  it('makes sensible calls on landmark hands', () => {
    expect(chartFreqs('open.UTG', c('AA')).raise).toBe(1);
    expect(chartFreqs('open.UTG', c('72o')).raise).toBe(0);
    expect(chartFreqs('open.BTN', c('K9o')).raise).toBe(1);
    expect(chartFreqs('vsOpen.BB.BTN', c('KK')).raise).toBe(1);
    expect(chartFreqs('vsOpen.BB.BTN', c('T9s')).call).toBe(1);
    expect(chartFreqs('vsOpen.HJ.UTG', c('K4o'))).toEqual({ raise: 0, call: 0 });
    expect(chartFreqs('vs4bet.oop', c('AA')).raise).toBe(1);
  });

  it('orders strength sensibly', () => {
    expect(RANK_PCT[c('AKs')]).toBeLessThan(RANK_PCT[c('AKo')]);
    expect(RANK_PCT[c('JTs')]).toBeLessThan(RANK_PCT[c('JTo')]);
    expect(RANK_PCT[c('KQs')]).toBeLessThan(RANK_PCT[c('72o')]);
  });

  it('scales ranges: a wider multiplier plays weaker hands, a tighter one folds marginal ones', () => {
    expect(chartFreqs('open.UTG', c('K9s')).raise).toBe(0);
    expect(scaledFreqs('open.UTG', c('K9s'), 1.6).raise).toBe(1);
    expect(scaledFreqs('open.UTG', c('KJo'), 0.6).raise).toBe(0);
    expect(scaledFreqs('open.UTG', c('AA'), 0.5).raise).toBe(1);
    expect(scaledFreqs('open.UTG', c('K9s'), 1, 1)).toEqual(chartFreqs('open.UTG', c('K9s')));
  });

  it('topShareWeights keeps the strongest share of combos', () => {
    const w = topShareWeights(0.1);
    let combos = 0;
    for (let cls = 0; cls < CLASS_COUNT; cls += 1) combos += w[cls] * combosIn(cls);
    expect(combos / 1326).toBeGreaterThan(0.08);
    expect(combos / 1326).toBeLessThan(0.12);
    expect(w[c('AA')]).toBe(1);
    expect(w[c('72o')]).toBe(0);
  });

  it('topShareWeights ranks AK with the hands a raiser re-raises, so a 4-bet range holds AKo', () => {
    const w = topShareWeights(0.035);
    for (const hand of ['AA', 'KK', 'QQ', 'AKs', 'AKo']) expect(w[c(hand)], hand).toBe(1);
    for (const hand of ['99', 'KQs']) expect(w[c(hand)], hand).toBe(0);
  });
});

const facingAggression = () => chartKeys().filter((key) => /^(vsOpen|squeeze|vs3bet|vs4bet)\./.test(key));
const cont = (f) => f.raise + f.call;
// Share of all combos with an action under scaled frequencies.
const scaledShare = (key, raiseMul, callMul, pick) => {
  let sum = 0;
  for (let cls = 0; cls < CLASS_COUNT; cls += 1) sum += pick(scaledFreqs(key, cls, raiseMul, callMul)) * combosIn(cls);
  return sum / 1326;
};

describe('scaled chart properties', () => {
  const MULS = [0.3, 0.5, 0.8, 1, 1.25, 1.6, 2.5];
  const EPS = 1e-9;

  it('premiums always continue: AA, KK and AKs in every facing-aggression chart at any dial', () => {
    for (const key of facingAggression()) {
      for (const hand of ['AA', 'KK', 'AKs']) {
        for (const raiseMul of [0.3, 0.5, 1, 1.5]) {
          for (const callMul of [0.3, 0.5, 1, 1.5]) {
            const f = scaledFreqs(key, c(hand), raiseMul, callMul);
            expect(cont(f), `${key} ${hand} ${raiseMul} ${callMul}`).toBeGreaterThanOrEqual(0.95);
          }
        }
      }
    }
  });

  it('tightening the raise dial turns value raises into calls instead of folds', () => {
    expect(cont(scaledFreqs('vsOpen.BB.BTN', c('AQo'), 0.6))).toBeGreaterThanOrEqual(cont(chartFreqs('vsOpen.BB.BTN', c('AQo'))));
    const qq = scaledFreqs('vs4bet.oop', c('QQ'), 0.5);
    expect(qq.raise).toBeLessThan(chartFreqs('vs4bet.oop', c('QQ')).raise);
    expect(cont(qq)).toBeGreaterThanOrEqual(cont(chartFreqs('vs4bet.oop', c('QQ'))));
    expect(cont(scaledFreqs('vs4bet.oop', c('AKs'), 0.5))).toBeGreaterThanOrEqual(0.95);
    // Suited bluffs below the calling range fold instead.
    expect(chartFreqs('vsOpen.HJ.UTG', c('A5s'))).toEqual({ raise: 0.4, call: 0 });
    expect(scaledFreqs('vsOpen.HJ.UTG', c('A5s'), 0.5)).toEqual({ raise: 0, call: 0 });
    // Raise-or-fold charts stay raise-or-fold.
    expect(scaledFreqs('open.CO', c('KTo'), 0.5).call).toBe(0);
  });

  it('a tighter raise dial keeps the raise frequency of premium value hands', () => {
    const premiumKeys = chartKeys().filter((key) => /^(vs3bet|vs4bet|squeeze)\./.test(key));
    for (const key of premiumKeys) {
      for (const hand of ['AA', 'KK']) {
        const base = chartFreqs(key, c(hand)).raise;
        for (const raiseMul of [0.3, 0.5]) {
          for (const callMul of [0.5, 1, 1.5]) {
            expect(scaledFreqs(key, c(hand), raiseMul, callMul).raise, `${key} ${hand} ${raiseMul} ${callMul}`).toBe(base);
          }
        }
      }
    }
    for (const key of premiumKeys.filter((k) => !k.startsWith('vs4bet.'))) {
      for (const hand of ['QQ', 'AKs', 'AKo']) {
        const base = chartFreqs(key, c(hand)).raise;
        for (const raiseMul of [0.3, 0.5]) expect(scaledFreqs(key, c(hand), raiseMul).raise, `${key} ${hand} ${raiseMul}`).toBe(base);
      }
    }
    for (const key of facingAggression().filter((k) => k.startsWith('vsOpen.'))) {
      for (const hand of ['AA', 'KK']) expect(scaledFreqs(key, c(hand), 0.3).raise, `${key} ${hand}`).toBe(chartFreqs(key, c(hand)).raise);
    }
    // Tightening still shrinks the raising range as a whole.
    for (const key of premiumKeys) {
      expect(scaledShare(key, 0.5, 1, (f) => f.raise), key).toBeLessThan(scaledShare(key, 1, 1, (f) => f.raise));
    }
  });

  it('frequencies are valid and monotone in both multipliers for every chart and class', () => {
    for (const key of chartKeys()) {
      for (let cls = 0; cls < CLASS_COUNT; cls += 1) {
        const grid = MULS.map((raiseMul) => MULS.map((callMul) => scaledFreqs(key, cls, raiseMul, callMul)));
        for (let i = 0; i < MULS.length; i += 1) {
          for (let j = 0; j < MULS.length; j += 1) {
            const f = grid[i][j];
            const at = `${key} ${cls} raiseMul=${MULS[i]} callMul=${MULS[j]}`;
            // Plain comparisons keep this loop fast; expect() runs only on a failure to report it.
            const bad = f.raise < 0 || f.call < -EPS || cont(f) > 1 + EPS
              || (i > 0 && (cont(f) < cont(grid[i - 1][j]) - EPS || f.raise < grid[i - 1][j].raise - EPS))
              || (j > 0 && (cont(f) < cont(grid[i][j - 1]) - EPS || f.raise < grid[i][j - 1].raise - EPS));
            if (bad) expect({ at, f, lowerRaiseMul: grid[i - 1]?.[j], lowerCallMul: grid[i][j - 1] }).toBe('monotone');
          }
        }
      }
    }
  });

  it('total raise and continue shares grow with the multipliers', () => {
    for (const key of chartKeys()) {
      let prev = null;
      for (const mul of MULS) {
        const now = {
          raise: scaledShare(key, mul, 1, (f) => f.raise),
          cont: scaledShare(key, 1, mul, cont),
          both: scaledShare(key, mul, mul, cont),
        };
        if (prev) {
          expect(now.raise, `${key} ${mul}`).toBeGreaterThanOrEqual(prev.raise - EPS);
          expect(now.cont, `${key} ${mul}`).toBeGreaterThanOrEqual(prev.cont - EPS);
          expect(now.both, `${key} ${mul}`).toBeGreaterThanOrEqual(prev.both - EPS);
        }
        prev = now;
      }
    }
  });
});

describe('chart landmarks', () => {
  const raise = (key, hand) => chartFreqs(key, c(hand)).raise;

  it('UTG opens pairs, suited broadways and aces, KQo/AJo+ and good suited connectors, not weak offsuit aces or kings', () => {
    for (const hand of ['AA', 'TT', '77', '55', '33', '22']) expect(raise('open.UTG', hand), hand).toBeGreaterThanOrEqual(0.5);
    for (const hand of ['AKs', 'AQs', 'AJs', 'ATs', 'KQs', 'KJs', 'KTs', 'QJs', 'QTs', 'JTs', 'T9s', 'AKo', 'AQo', 'AJo', 'KQo']) {
      expect(raise('open.UTG', hand), hand).toBeGreaterThanOrEqual(0.9);
    }
    expect(raise('open.UTG', '98s')).toBeGreaterThanOrEqual(0.5);
    for (const hand of ['A5s', 'A4s', 'A3s', 'A2s']) expect(raise('open.UTG', hand), hand).toBeGreaterThanOrEqual(0.3);
    for (const hand of ['A8o', 'K9o', 'A5o']) expect(raise('open.UTG', hand), hand).toBe(0);
  });

  it('CO opens suited connectors to 65s and small suited kings; BTN opens 40-48% with most suited hands', () => {
    for (const hand of ['87s', '76s', '65s', 'K8s', 'K6s', 'K5s']) expect(raise('open.CO', hand), hand).toBeGreaterThanOrEqual(0.5);
    expect(raise('open.CO', 'A5o')).toBeLessThanOrEqual(0.5);

    expect(share('open.BTN', 'raise')).toBeGreaterThan(0.4);
    expect(share('open.BTN', 'raise')).toBeLessThan(0.48);
    expect(raise('open.BTN', '54s')).toBeGreaterThanOrEqual(0.9);
    let suited = 0;
    for (let cls = 0; cls < CLASS_COUNT; cls += 1) if (Math.floor(cls / 13) > cls % 13) suited += chartFreqs('open.BTN', cls).raise;
    expect(suited / 78).toBeGreaterThan(0.65); // most suited classes
    expect(raise('open.BTN', 'K6o')).toBeLessThanOrEqual(0.5);
    expect(raise('open.BTN', 'J6s')).toBeLessThanOrEqual(0.5);
    for (const hand of ['65s', '54s', '22']) expect(raise('open.SB', hand), hand).toBeGreaterThanOrEqual(0.5);
  });

  it('late position opens offsuit aces, broadways and gappers before small offsuit connectors', () => {
    const cont1 = (key, hand) => cont(chartFreqs(key, c(hand)));
    for (const hand of ['K8o', 'Q8o', 'J8o', 'T8o']) {
      expect(raise('open.BTN', hand), hand).toBeGreaterThanOrEqual(0.5);
      for (const small of ['98o', '87o', '76o', '65o', '54o']) expect(cont1('open.BTN', hand), `${hand} ${small}`).toBeGreaterThanOrEqual(cont1('open.BTN', small));
    }
    for (const hand of ['76o', '65o', '54o']) expect(raise('open.BTN', hand), hand).toBe(0);
    for (const hand of ['A5o', 'A4o', 'A3o', 'A2o']) {
      expect(raise('open.SB', hand), hand).toBeGreaterThanOrEqual(0.5);
      for (const small of ['54o', '65o', '76o', '87o']) expect(cont1('open.SB', hand), `${hand} ${small}`).toBeGreaterThanOrEqual(cont1('open.SB', small));
    }
    for (const hand of ['A5o', 'A4o', 'A3o', 'A2o']) expect(RANK_PCT[c(hand)], hand).toBeLessThan(RANK_PCT[c('98o')]);
  });

  it('the big blind defends about 40/45/50/60% against UTG/HJ/CO/BTN opens and 60-65% against the SB', () => {
    const defend = (opener) => share(`vsOpen.BB.${opener}`, 'raise') + share(`vsOpen.BB.${opener}`, 'call');
    const targets = { UTG: 0.4, HJ: 0.45, CO: 0.5, BTN: 0.6 };
    for (const [opener, target] of Object.entries(targets)) expect(Math.abs(defend(opener) - target), opener).toBeLessThan(0.025);
    expect(defend('SB')).toBeGreaterThanOrEqual(0.6);
    expect(defend('SB')).toBeLessThanOrEqual(0.65);
  });

  it('facing an open, TT and JJ mostly flat while AKo and AQs mostly 3-bet', () => {
    const keys = chartKeys().filter((key) => key.startsWith('vsOpen.'));
    for (const key of keys) {
      expect(raise(key, 'TT'), key).toBeLessThanOrEqual(0.5);
      expect(raise(key, 'AKo'), key).toBeGreaterThanOrEqual(0.8);
      expect(raise(key, 'AQs'), key).toBeGreaterThanOrEqual(0.5);
      expect(cont(chartFreqs(key, c('JJ'))), key).toBe(1);
    }
    expect(keys.filter((key) => raise(key, 'JJ') <= 0.5).length / keys.length).toBeGreaterThanOrEqual(0.75);
  });

  it('facing a 3-bet, TT calls and QQ+/AK 4-bet or mix', () => {
    for (const key of chartKeys().filter((k) => k.startsWith('vs3bet.'))) {
      expect(chartFreqs(key, c('TT')).call, key).toBeGreaterThanOrEqual(0.7);
      for (const hand of ['AA', 'KK', 'QQ', 'AKs', 'AKo']) {
        expect(raise(key, hand), `${key} ${hand}`).toBeGreaterThanOrEqual(0.3);
        expect(cont(chartFreqs(key, c(hand))), `${key} ${hand}`).toBe(1);
      }
    }
  });

  it('facing a 4-bet at 100 BB, AA/KK 5-bet, QQ/AKs mix 5-bet and call, and AKo continues', () => {
    for (const key of ['vs4bet.ip', 'vs4bet.oop']) {
      for (const hand of ['AA', 'KK']) expect(raise(key, hand), `${key} ${hand}`).toBe(1);
      for (const hand of ['QQ', 'AKs']) {
        expect(raise(key, hand), `${key} ${hand}`).toBeGreaterThan(0);
        expect(raise(key, hand), `${key} ${hand}`).toBeLessThan(1);
        expect(cont(chartFreqs(key, c(hand))), `${key} ${hand}`).toBe(1);
      }
      expect(cont(chartFreqs(key, c('AKo'))), key).toBeGreaterThanOrEqual(0.9);
      expect(cont(chartFreqs(key, c('JJ'))), key).toBeGreaterThanOrEqual(cont(chartFreqs(key, c('AQs'))));
    }
  });

  it('over a limp, TT and 99 iso-raise from every position while small pairs may mix', () => {
    for (const key of chartKeys().filter((k) => k.startsWith('vsLimp.'))) {
      for (const hand of ['AA', 'JJ', 'TT', '99']) expect(raise(key, hand), `${key} ${hand}`).toBeGreaterThanOrEqual(0.8);
      for (const hand of ['AKo', 'AQs', 'KQs']) expect(raise(key, hand), `${key} ${hand}`).toBeGreaterThanOrEqual(0.8);
    }
  });

  it('a wider raise dial lets AKo 5-bet against a 4-bet', () => {
    for (const key of ['vs4bet.ip', 'vs4bet.oop']) {
      expect(raise(key, 'AKo'), key).toBe(0);
      for (const callMul of [0.5, 1, 1.5]) expect(scaledFreqs(key, c('AKo'), 1.5, callMul).raise, `${key} ${callMul}`).toBeGreaterThan(0);
    }
  });

  it('facing a 4-bet, AKo continues at least as often as AQs at any dial', () => {
    const MULS = [0.3, 0.4, 0.5, 0.6, 0.8, 1, 1.25, 1.6, 2.5];
    for (const key of ['vs4bet.ip', 'vs4bet.oop']) {
      for (const raiseMul of MULS) {
        for (const callMul of MULS) {
          const ako = cont(scaledFreqs(key, c('AKo'), raiseMul, callMul));
          const aqs = cont(scaledFreqs(key, c('AQs'), raiseMul, callMul));
          expect(ako, `${key} ${raiseMul} ${callMul}`).toBeGreaterThanOrEqual(aqs - 1e-9);
        }
      }
    }
  });

  it('a higher offsuit card with the same kicker continues at least as often (A-x >= K-x >= Q-x >= J-x >= T-x)', () => {
    const RANKS = '23456789TJQKA';
    const failures = [];
    for (const key of chartKeys()) {
      for (let kicker = 0; kicker < 12; kicker += 1) {
        for (let hi = Math.max(8, kicker + 1) + 1; hi <= 12; hi += 1) {
          const strong = `${RANKS[hi]}${RANKS[kicker]}o`;
          const weak = `${RANKS[hi - 1]}${RANKS[kicker]}o`;
          const [s, w] = [cont(chartFreqs(key, c(strong))), cont(chartFreqs(key, c(weak)))];
          if (s < w) failures.push(`${key} ${strong} ${s} < ${weak} ${w}`);
        }
      }
    }
    expect(failures).toEqual([]);
    for (const key of chartKeys()) expect(cont(chartFreqs(key, c('KJo'))), key).toBeGreaterThanOrEqual(cont(chartFreqs(key, c('QJo'))));
  });
});
