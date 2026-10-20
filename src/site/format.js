// UTC on purpose: a post dated 2026-10-06 is parsed as UTC midnight, and formatting it in a
// negative-offset time zone would show October 5.
const LONG_DATE = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
const MONTH_YEAR = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', timeZone: 'UTC' });

// Only ISO-style strings are read. V8's fallback parser accepts almost anything ("Fall 2026"
// becomes January), which would print a wrong date instead of showing the text as written.
const ISO_LIKE = /^\d{4}-\d{2}(?:-\d{2}(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?)?$/;

/** A Date from an ISO string, a timestamp or a Date; null for anything else. */
function toDate(value) {
  const readable = value instanceof Date
    || (typeof value === 'number' && Number.isFinite(value))
    || (typeof value === 'string' && ISO_LIKE.test(value.trim()));
  if (!readable) return null;
  const date = new Date(typeof value === 'string' ? value.trim() : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function format(formatter, value) {
  const date = toDate(value);
  if (date) return formatter.format(date);
  return value == null ? '' : String(value);
}

/** "2026-10-06" becomes "October 6, 2026". Unreadable input comes back as it was given. */
export const formatLongDate = (value) => format(LONG_DATE, value);

/** "2026-10-06" becomes "Oct 2026". Unreadable input comes back as it was given. */
export const formatMonthYear = (value) => format(MONTH_YEAR, value);
