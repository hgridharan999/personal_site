import { weightedPick } from '../core/rng.js';
import { toCanonical } from '../core/rational.js';

export function drawQuestion(profile, rng) {
  const template = weightedPick(rng, profile.templates);
  const { prompt, answer } = template.gen(rng);
  return { qtype: template.qtype, prompt, answer };
}

export function generateOptiverTest(profile, rng, count = 80) {
  const seen = new Set();
  const questions = [];
  while (questions.length < count) {
    const q = drawQuestion(profile, rng);
    if (seen.has(q.prompt)) continue;
    seen.add(q.prompt);
    questions.push({ idx: questions.length, ...q, answerText: toCanonical(q.answer) });
  }
  return questions;
}
