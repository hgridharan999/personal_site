// src/private/trainers/poker/leaks/spotCopy.test.js
import { describe, it, expect } from 'vitest';
import { SPOT_SITUATIONS, parseSpot, spotLabel, focusCopy } from './spotCopy.js';

describe('parseSpot', () => {
  it('reads street, situation and position', () => {
    expect(parseSpot('pf.vs_3bet')).toEqual({ street: 'preflop', situation: 'vs_3bet', position: null });
    expect(parseSpot('river.facing_bet.oop')).toEqual({ street: 'river', situation: 'facing_bet', position: 'oop' });
    expect(parseSpot('flop.cbet.ip')).toEqual({ street: 'flop', situation: 'cbet', position: 'ip' });
    expect(parseSpot('turn.no_bet.multiway.oop')).toEqual({ street: 'turn', situation: 'no_bet', position: 'oop' });
  });

  it('returns null for anything outside the grammar', () => {
    for (const bad of ['', 'pf', 'preflop.open', 'river.', null, undefined, 42]) {
      expect(parseSpot(bad), String(bad)).toBeNull();
    }
  });
});

describe('spotLabel', () => {
  it('labels known, unknown and unparseable spots', () => {
    expect(spotLabel('pf.open')).toBe('Preflop · first in');
    expect(spotLabel('river.facing_bet.oop')).toBe('River · facing a bet · out of position');
    expect(spotLabel('flop.cbet.ip')).toBe('Flop · c-bet chance · in position');
    expect(spotLabel('turn.overbet_probe')).toBe('Turn · overbet probe');
    expect(spotLabel('weird')).toBe('weird');
  });
});

describe('focusCopy', () => {
  it('has specific copy for every preflop and postflop situation', () => {
    for (const situation of SPOT_SITUATIONS.preflop) {
      expect(focusCopy(`pf.${situation}`).title, situation).not.toBe('Preflop decisions');
    }
    for (const street of ['flop', 'turn', 'river']) {
      for (const situation of SPOT_SITUATIONS.postflop) {
        const { title, body } = focusCopy(`${street}.${situation}`);
        expect(title, `${street}.${situation}`).not.toMatch(/decisions$/);
        expect(body.length).toBeGreaterThan(40);
      }
    }
  });

  it('falls back to street copy, then to generic copy', () => {
    const turn = focusCopy('turn.overbet_probe');
    expect(turn.title).toBe('Turn decisions');
    expect(turn.body).toContain('turn spot');
    expect(focusCopy('pf.cbet').title).toBe('Preflop decisions');
    expect(focusCopy('weird').title).toBe('Your costliest spot');
  });

  it('adds the position and the costliest action', () => {
    expect(focusCopy('river.facing_bet.oop').body).toContain('out of position');
    expect(focusCopy('flop.cbet.ip').body).toContain('in position');
    expect(focusCopy('pf.open', { costliestAction: 'call' }).body.endsWith('Most of the EV lost came from calling.')).toBe(true);
    expect(focusCopy('pf.open', { costliestAction: 'dance' }).body).not.toContain('Most of the EV lost');
    expect(focusCopy('pf.open', { costliestAction: null }).body).not.toContain('Most of the EV lost');
  });
});
