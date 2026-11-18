import { describe, expect, it } from 'vitest';
import { resolveFigure } from './resolveFigure.js';

const Fig = () => null;
const figures = { 'g-condition': Fig };
const code = (className, text) => ({ type: 'code', props: { className, children: text } });

describe('resolveFigure', () => {
  it('maps a known figure block to its component', () => {
    expect(resolveFigure(code('language-figure', 'g-condition\n'), figures)).toEqual({ kind: 'figure', Component: Fig });
  });
  it('renders nothing for an unknown name', () => {
    expect(resolveFigure(code('language-figure', 'nope\n'), figures)).toEqual({ kind: 'unknown' });
    expect(resolveFigure(code('language-figure', 'toString'), figures)).toEqual({ kind: 'unknown' });
  });
  it('leaves other code blocks alone', () => {
    expect(resolveFigure(code('language-js', 'g-condition'), figures)).toEqual({ kind: 'code' });
    expect(resolveFigure(code(undefined, 'x'), figures)).toEqual({ kind: 'code' });
    expect(resolveFigure('plain text', figures)).toEqual({ kind: 'code' });
  });
});
