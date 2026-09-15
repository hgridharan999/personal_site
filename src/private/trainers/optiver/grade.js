import { parseRational, eq } from '../core/rational.js';

// Rules decided in the spec (§2). Stored in each session's config.
export const OPTIVER_RULES = Object.freeze({
  questions: 80,
  timeLimitMs: 480000,
  pointsCorrect: 1,
  pointsWrong: -1,
  pointsUnreached: 0,
  skipping: false,
  goBack: false,
  timerVisible: false,
  answerFormat: 'typed',
});

export function sanitizeInput(value) {
  return value.replace(/[^0-9./-]/g, '').slice(0, 32);
}

export function gradeResponse(question, input) {
  const response = input.trim();
  const value = parseRational(response);
  if (!value) return { valid: false };
  return { valid: true, response, isCorrect: eq(value, question.answer) };
}

export function buildOptiverAttempts(questions, answers) {
  return questions.map((question, i) => {
    const answered = answers[i];
    return {
      idx: question.idx,
      qtype: question.qtype,
      factKey: null,
      prompt: question.prompt,
      answer: question.answerText,
      response: answered ? answered.response : null,
      isCorrect: answered ? answered.isCorrect : false,
      timeMs: answered ? answered.timeMs : null,
      corrections: 0,
    };
  });
}

export function scoreOptiver(attempts, rules = OPTIVER_RULES) {
  const correct = attempts.filter((a) => a.response !== null && a.isCorrect).length;
  const wrong = attempts.filter((a) => a.response !== null && !a.isCorrect).length;
  const unanswered = rules.questions - correct - wrong;
  const score = correct * rules.pointsCorrect + wrong * rules.pointsWrong + unanswered * rules.pointsUnreached;
  return { correct, wrong, unanswered, score };
}
