import { NBSP } from './content';

const yearIn = (part) => part.match(/\d{4}/)?.[0] ?? part.trim();

/**
 * A stored date or range, shown as years only so the right-hand column stays quiet:
 * "Feb 2026 – now" is "2026 – now", "Jul 2026 – Sep 2026" is "2026", "Dec 2025 – Jan 2026"
 * is "2025 – 2026". content.js keeps the months as the record. The result is glued with
 * non-breaking spaces, so a range never wraps. A hyphen or an em dash reads as a range too, and a
 * missing date is an empty string, as it rendered before.
 */
export function yearsOf(when) {
  if (!when) return '';
  const [from, to] = when.split(/\s*[\u2013\u2014-]\s*/).map(yearIn);
  if (!to || to === from) return from;
  return `${from}${NBSP}–${NBSP}${to}`;
}
