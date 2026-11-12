const TZ = 'America/New_York';
const CUTOFF_HOUR = 3;

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});

const toUtc = (date) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/** Calendar arithmetic on a 'YYYY-MM-DD' string. */
export function addDays(date, n) {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The Eastern date of the evening a moment belongs to; nights run until 3am. */
export function nightDate(now = new Date()) {
  const p = Object.fromEntries(fmt.formatToParts(now).map((x) => [x.type, x.value]));
  const date = `${p.year}-${p.month}-${p.day}`;
  return Number(p.hour) < CUTOFF_HOUR ? addDays(date, -1) : date;
}

/** Days since Monday for a date: Mon 0 ... Sun 6. */
export function daysSinceMonday(date) {
  return (toUtc(date).getUTCDay() + 6) % 7;
}

/** The Monday of the date's week. */
export function weekStart(date) {
  return addDays(date, -daysSinceMonday(date));
}
