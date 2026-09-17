import { describe, it, expect } from 'vitest';
import { parseCards } from '../engine/cards.js';
import {
  CLASS_COUNT, COMBO_COUNT, COMBO_CARDS, COMBO_CLASS, CLASS_COMBOS,
  classOf, kindOf, className, parseClass, combosIn, comboOf, classWeightsToCombos,
} from './handClass.js';

const cls = (text) => classOf(...parseCards(text));

describe('hand classes', () => {
  it('maps cards to pair, suited and offsuit classes regardless of order', () => {
    expect(className(cls('AhAs'))).toBe('AA');
    expect(className(cls('AsKs'))).toBe('AKs');
    expect(className(cls('KsAs'))).toBe('AKs');
    expect(className(cls('Kd7c'))).toBe('K7o');
    expect(className(cls('2c3d'))).toBe('32o');
    expect(kindOf(parseClass('AA'))).toBe('pair');
    expect(kindOf(parseClass('T9s'))).toBe('suited');
    expect(kindOf(parseClass('T9o'))).toBe('offsuit');
  });

  it('round-trips all 169 class names', () => {
    const names = new Set();
    for (let i = 0; i < CLASS_COUNT; i += 1) {
      expect(parseClass(className(i))).toBe(i);
      names.add(className(i));
    }
    expect(names.size).toBe(169);
    expect(() => parseClass('AKx')).toThrow();
    expect(() => parseClass('KAs')).toThrow();
  });

  it('enumerates 1,326 combos with the right count per class', () => {
    expect(COMBO_COUNT).toBe(1326);
    let total = 0;
    for (let i = 0; i < CLASS_COUNT; i += 1) {
      expect(CLASS_COMBOS[i].length).toBe(combosIn(i));
      total += CLASS_COMBOS[i].length;
    }
    expect(total).toBe(1326);
    const [a, b] = parseCards('Td9d');
    const combo = comboOf(a, b);
    expect(comboOf(b, a)).toBe(combo);
    expect([COMBO_CARDS[2 * combo], COMBO_CARDS[2 * combo + 1]].sort((x, y) => x - y)).toEqual([a, b].sort((x, y) => x - y));
    expect(COMBO_CLASS[combo]).toBe(parseClass('T9s'));
  });

  it('expands class weights to combo weights', () => {
    const weights = new Float32Array(169);
    weights[parseClass('AKs')] = 0.5;
    const combos = classWeightsToCombos(weights);
    let sum = 0;
    for (const w of combos) sum += w;
    expect(sum).toBeCloseTo(2, 6);
  });
});
