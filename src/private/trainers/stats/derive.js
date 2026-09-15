import { rollingAverage, trendPerWeek, bestPerDay, stdDev, mean } from '../core/stats.js';

export const ROLLING_WINDOW = 10;
export const READINESS_WINDOW = 10;

export const QTYPE_LABEL = {
  'z.add': 'Addition',
  'z.sub': 'Subtraction',
  'z.mul': 'Multiplication',
  'z.div': 'Division',
  'o.int.add': 'Integer +',
  'o.int.sub': 'Integer −',
  'o.int.mul': 'Integer ×',
  'o.int.div': 'Integer ÷',
  'o.dec.addsub': 'Decimal + −',
  'o.dec.mul': 'Decimal ×',
  'o.dec.div': 'Decimal ÷',
  'o.frac.of': 'Fraction of',
  'o.frac.addsub': 'Fraction + −',
  'o.frac.muldiv': 'Fraction × ÷',
};

export function progressSummary(series) {
  const scores = series.map((s) => s.score);
  const points = series.map((s) => ({ t: Date.parse(s.startedAt), y: s.score }));
  return {
    games: series.length,
    best: scores.length ? Math.max(...scores) : null,
    latest: scores.length ? scores[scores.length - 1] : null,
    rolling: rollingAverage(scores, ROLLING_WINDOW),
    trendPerWeek: trendPerWeek(points),
    bestPerDay: bestPerDay(points),
  };
}

export function readiness(series, passLine) {
  const recent = series.slice(-READINESS_WINDOW);
  if (recent.length === 0) return null;
  const scores = recent.map((s) => s.score);
  const atOrAbove = scores.filter((s) => s >= passLine).length;
  return {
    n: recent.length,
    mean: mean(scores),
    atOrAbove,
    share: atOrAbove / recent.length,
    sd: stdDev(scores),
    avgReached: mean(recent.map((s) => s.correct + s.wrong)),
  };
}

const OP_SYMBOLS = [['add', '+'], ['sub', '−'], ['mul', '×'], ['div', '÷']];
const MODE_NAME = { standard: 'Standard', custom: 'Custom', drill: 'Drill' };

export function configLabel({ trainer, mode, config }) {
  if (trainer === 'optiver') return '80 in 8 · +1 / −1';
  const duration = `${config.duration} s`;
  if (mode !== 'custom') return `${MODE_NAME[mode]} · ${duration}`;

  const ops = OP_SYMBOLS.filter(([k]) => config[k]).map(([, s]) => s).join(' ');
  const ranges = [];
  if (config.add || config.sub) {
    ranges.push(`${config.add_left_min}–${config.add_left_max} + ${config.add_right_min}–${config.add_right_max}`);
  }
  if (config.mul || config.div) {
    ranges.push(`${config.mul_left_min}–${config.mul_left_max} × ${config.mul_right_min}–${config.mul_right_max}`);
  }
  return ['Custom', ops, duration, ...ranges].join(' · ');
}

export function formatTrend(perWeek) {
  if (perWeek == null) return 'Needs 5 games over 3 days';
  const rounded = Math.abs(perWeek).toFixed(1);
  if (rounded === '0.0') return '±0.0 / week';
  return `${perWeek > 0 ? '+' : '−'}${rounded} / week`;
}
