import { describe, it, expect } from 'vitest';
import { viewFor, typeName, TYPE_NAMES, isBusy, messageFor, isAuthLost, failureCopy } from './view.js';

const idle = { generating: false, grading: false, error: null };
const today = (session) => ({ night: '2026-11-12', session });
const at = (status, extra = {}) => today({ id: 'a', date: '2026-11-12', status, ...extra });

describe('viewFor', () => {
  it('is loading before the first answer arrives', () => {
    expect(viewFor(null, idle)).toBe('loading');
  });

  it('is error when the today fetch failed, before or after a first answer', () => {
    expect(viewFor(null, { ...idle, error: new Error('x') })).toBe('error');
    expect(viewFor(at('generated'), { ...idle, error: new Error('x') })).toBe('error');
  });

  it('is empty when there is no session, and generating while a generate runs', () => {
    expect(viewFor(today(null), idle)).toBe('empty');
    expect(viewFor(today(null), { ...idle, generating: true })).toBe('generating');
  });

  it('maps each status as listed', () => {
    expect(viewFor(at('generating'), idle)).toBe('generating');
    expect(viewFor(at('generated'), idle)).toBe('form');
    expect(viewFor(at('submitted'), idle)).toBe('grading');
    expect(viewFor(at('grading'), idle)).toBe('grading');
    expect(viewFor(at('graded'), idle)).toBe('graded');
  });

  it('shows Retry only for a submitted session that carries a grade error', () => {
    expect(viewFor(at('submitted', { gradeError: 'model timed out' }), idle)).toBe('gradeFailed');
    expect(viewFor(at('submitted', { gradeError: 'model timed out' }), { ...idle, grading: true })).toBe('grading');
  });

  it('never shows Retry for a session that is grading, even with a stale grade error', () => {
    expect(viewFor(at('grading', { gradeError: 'old' }), idle)).toBe('grading');
  });

  it('locks the reserved statuses this build never sets', () => {
    expect(viewFor(at('complete'), idle)).toBe('locked');
    expect(viewFor(at('missed'), idle)).toBe('locked');
  });

  it('treats an unknown status as an error rather than guessing', () => {
    expect(viewFor(at('mystery'), idle)).toBe('error');
  });

  it('works without a ui argument', () => {
    expect(viewFor(at('generated'))).toBe('form');
  });
});

describe('isBusy', () => {
  it('is true only while a brief or a grade is being made', () => {
    expect(isBusy({ status: 'generating' })).toBe(true);
    expect(isBusy({ status: 'grading' })).toBe(true);
    for (const status of ['generated', 'submitted', 'graded']) expect(isBusy({ status }), status).toBe(false);
    expect(isBusy(null)).toBe(false);
  });
});

describe('typeName', () => {
  it('names all nine question types', () => {
    expect(TYPE_NAMES).toEqual({
      second_order: 'Second-order effects',
      incentives: 'Incentives',
      find_flaw: 'Find the flaw',
      forecast: 'Forecast',
      base_rates: 'Base rates',
      estimate: 'Estimate',
      decide: 'Decide',
      compress: 'Compress',
      case_rep: 'Case rep',
    });
  });

  it('falls back to the key for a type it does not know', () => {
    expect(typeName('forecast')).toBe('Forecast');
    expect(typeName('new_type')).toBe('new_type');
  });
});

describe('messageFor', () => {
  const err = (status, code, message = 'server said') => Object.assign(new Error(message), { status, code });

  it('keeps the draft in mind when the night has closed', () => {
    expect(messageFor(err(409, 'NIGHT_CLOSED'))).toBe('This night closed at 3am. Your draft is saved on this device.');
  });

  it('names the failed step for the model failures', () => {
    expect(messageFor(err(502, 'GENERATION_FAILED'))).toBe('The brief did not come together. Try again.');
    expect(messageFor(err(502, 'GRADING_FAILED'))).toBe('Grading did not finish. Try again.');
  });

  it('sends an expired session to sign in, and shows a validation message as given', () => {
    expect(messageFor(err(401, 'UNAUTHORIZED'))).toBe('Your sign-in ran out. Sign in again; your draft is saved.');
    expect(messageFor(err(400, 'VALIDATION_ERROR', 'take: too long'))).toBe('take: too long');
  });

  it('explains the two state conflicts instead of blaming the network', () => {
    expect(messageFor(err(409, 'NOT_OPEN'))).toBe('These answers were already sent.');
    expect(messageFor(err(409, 'NOT_PUBLISHABLE'))).toBe('This take cannot be published now.');
    expect(messageFor(err(409, 'NOT_SUBMITTED'))).toBe('Nothing to grade yet.');
  });

  it('says the model key is missing, rather than blaming the network', () => {
    expect(messageFor(err(500, 'MODEL_NOT_CONFIGURED'))).toBe('The model key is not set on the server.');
  });

  it('adds the reason the server gave for a model failure, when there is one', () => {
    const failed = (code, details) => Object.assign(err(502, code), { details });
    expect(messageFor(failed('GENERATION_FAILED', { reason: 'BAD_URLS' })))
      .toBe('The brief did not come together (reason: BAD_URLS). Try again.');
    expect(messageFor(failed('GRADING_FAILED', { reason: 'TIMEOUT' })))
      .toBe('Grading did not finish (reason: TIMEOUT). Try again.');
    expect(messageFor(failed('GENERATION_FAILED', {}))).toBe('The brief did not come together. Try again.');
    expect(messageFor(failed('GRADING_FAILED', { reason: 42 }))).toBe('Grading did not finish. Try again.');
  });

  it('uses a neutral server message for any other response the page cannot explain', () => {
    expect(messageFor(err(500, 'INTERNAL'))).toBe('The server hit an error. Try again.');
    expect(messageFor(err(503, 'HTTP_ERROR'))).toBe('The server hit an error. Try again.');
    expect(messageFor(err(404, 'HTTP_ERROR'))).toBe('The server hit an error. Try again.');
  });

  it('blames the network only when no response came back', () => {
    expect(messageFor(new TypeError('Failed to fetch'))).toBe('Could not reach the server. Try again.');
    expect(messageFor(null)).toBe('Could not reach the server. Try again.');
  });
});

describe('isAuthLost', () => {
  it('is true only for a 401', () => {
    expect(isAuthLost(Object.assign(new Error('x'), { status: 401 }))).toBe(true);
    expect(isAuthLost(Object.assign(new Error('x'), { status: 403 }))).toBe(false);
    expect(isAuthLost(new TypeError('Failed to fetch'))).toBe(false);
    expect(isAuthLost(null)).toBe(false);
  });
});

describe('failureCopy', () => {
  it('blames the network only when a request failed', () => {
    expect(failureCopy(new TypeError('Failed to fetch'))).toEqual({
      title: "Could not load tonight's session.",
      detail: 'Could not reach the server. Try again.',
    });
  });

  it('uses neutral copy for a session in a status the page does not know (no error object)', () => {
    const copy = failureCopy(null);
    expect(copy.title).toBe("Tonight's session is in a state this page cannot show.");
    expect(copy.detail).not.toMatch(/server/i);
  });
});
