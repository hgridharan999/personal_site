// The nightly model layer: the brief (web search plus a strict submit_brief tool), the grader and
// the blind take. Calls go through the beta Messages API only to opt into server-side refusal
// fallbacks; everything else is the plain Messages API.
import Anthropic, { APIConnectionTimeoutError, APIUserAbortError } from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { BlindTake, Brief, FlawDraft, GradeResult } from './schemas.js';
import { TYPES } from './types.js';
import { BLIND_TAKE_SYSTEM, BRIEF_SYSTEM, FLAW_SYSTEM, FORMAT_SYSTEM, GRADER_SYSTEM } from './prompts.js';

export const MODEL = 'claude-sonnet-5-5';

const MAX_TOKENS = 16_000;
const CALL_TIMEOUT_MS = 120_000;
const RETRY_FLOOR_MS = 90_000;
const MAX_CONTINUATIONS = 5;
// Server-side refusal fallback (claude-api skill default for claude-sonnet-5-5, Claude API only).
const FALLBACK = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' };

export class ModelError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ModelError';
    this.code = code;
  }
}

/** One time budget for a whole request: an abort signal plus the time left. */
export function createDeadline(totalMs, now = Date.now) {
  const end = now() + totalMs;
  const remaining = () => Math.max(0, end - now());
  return { signal: AbortSignal.timeout(totalMs), remaining, canRetry: () => remaining() > RETRY_FLOOR_MS };
}

// ---- request builders -------------------------------------------------------------------------

const typeInfo = (key) => {
  const t = TYPES.find((x) => x.key === key);
  if (!t) throw new Error(`unknown question type: ${key}`);
  return t;
};

const str = (description) => ({ type: 'string', description });
const obj = (properties) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const storyProps = {
  headline: str('Plain factual headline.'),
  summary: str('Two or three sentences of fact in original wording. No analysis, prediction or opinion.'),
  url: { type: 'string', format: 'uri', description: 'Exact article URL, copied from the web search results.' },
  source: str('Publication name.'),
};

/** JSON schema mirroring Brief, narrowed to tonight's types and field. */
function briefSchema({ types, field }) {
  return obj({
    stories: { type: 'array', description: 'Exactly three stories.', items: obj(storyProps) },
    niche: obj({ ...storyProps, topic: { type: 'string', enum: [field] } }),
    questions: {
      type: 'array',
      description: 'Exactly three questions, one per requested type.',
      items: obj({
        type: { type: 'string', enum: [...types] },
        story_index: { type: 'integer', enum: [0, 1, 2] },
        prompt: str('The question, one or two sentences.'),
      }),
    },
  });
}

const typeLines = (types) =>
  types
    .map((key, i) => {
      const t = typeInfo(key);
      return `${i + 1}. ${t.name} (type "${t.key}"). Trains: ${t.trains}. Example of the kind of question: "${t.example}"`;
    })
    .join('\n');

export function buildBriefRequest({ night, types, field }) {
  const user = [
    `Tonight is ${night} (America/New_York). Find the business and technology stories from the last 24 hours.`,
    `Niche field for tonight: ${field}.`,
    `Question types for tonight:\n${typeLines(types)}`,
    'Call submit_brief once when the brief is complete.',
  ].join('\n\n');
  return {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: BRIEF_SYSTEM,
    output_config: { effort: 'medium' },
    tools: [
      {
        type: 'web_search_20260209',
        name: 'web_search',
        max_uses: 8,
        user_location: { type: 'approximate', country: 'US', timezone: 'America/New_York' },
      },
      {
        name: 'submit_brief',
        description: 'Submit the finished brief: three stories, one niche item and three questions.',
        strict: true,
        input_schema: briefSchema({ types, field }),
      },
    ],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: user }],
  };
}

function buildFormatRequest({ notes, urls, types, field }) {
  const user = [
    `<notes>\n${notes}\n</notes>`,
    `<search_result_urls>\n${[...urls].join('\n')}\n</search_result_urls>`,
    `Niche field: ${field}.\n\nQuestion types:\n${typeLines(types)}`,
  ].join('\n\n');
  return structuredRequest(FORMAT_SYSTEM, user, { type: 'json_schema', schema: briefSchema({ types, field }) }, 'low');
}

const jsonFormat = (schema) => {
  const { type, schema: json } = zodOutputFormat(schema);
  return { type, schema: json };
};

function structuredRequest(system, user, format, effort) {
  return {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system,
    output_config: { effort, format },
    messages: [{ role: 'user', content: user }],
  };
}

const storyText = (s) => `${s.headline}\nSource: ${s.source}\n${s.summary}`;

export function buildGradeRequest({ stories, questions, answers, take }) {
  const brief = stories.map((s, i) => `<story index="${i}">\n${storyText(s)}\n</story>`).join('\n');
  const answered = answers
    .map(({ idx, answer }) => {
      const q = questions[idx];
      const t = typeInfo(q.type);
      return [
        `<answer idx="${idx}" type="${t.name}" trains="${t.trains}" story="${q.story_index}">`,
        `<question>${q.prompt}</question>`,
        `<response>\n${answer}\n</response>`,
        '</answer>',
      ].join('\n');
    })
    .join('\n');
  const user = [
    `<brief>\n${brief}\n</brief>`,
    `<answers>\n${answered}\n</answers>`,
    `<take story="${take.storyIndex}">\n${take.body}\n</take>`,
    'Score each answer by its idx, name its biggest gap in one line, and write one follow-up question.',
  ].join('\n\n');
  return structuredRequest(GRADER_SYSTEM, user, jsonFormat(GradeResult), 'high');
}

/** The blind take sees the chosen story and nothing else. */
export function buildBlindTakeRequest({ story }) {
  const user = `<story>\n${storyText(story)}\n</story>\n\nWrite your take on this story.`;
  return structuredRequest(BLIND_TAKE_SYSTEM, user, jsonFormat(BlindTake), 'medium');
}

/** One flaw for the avoid list: its name and definition. */
const avoidLine = (f) => `- ${f.name}: ${f.definition}`;

/**
 * The flaw puzzle: an argument that commits exactly the named flaw, in the given setting. `avoid`
 * is the puzzle's wrong choices; the argument must not plausibly commit any of them.
 */
export function buildFlawRequest({ flaw, setting, avoid = [] }) {
  const avoidBlock = avoid.length > 0 && [
    '<avoid>',
    'Hari will see these flaws as the wrong choices, so the argument must not plausibly commit any of them:',
    ...avoid.map(avoidLine),
    '</avoid>',
  ].join('\n');
  const user = [
    `<flaw name="${flaw.name}">\n${flaw.definition}\n</flaw>`,
    `<setting>\n${setting}\n</setting>`,
    avoidBlock,
    'Write the argument and the explanation.',
  ].filter(Boolean).join('\n\n');
  return structuredRequest(FLAW_SYSTEM, user, jsonFormat(FlawDraft), 'low');
}

// ---- URL checks -------------------------------------------------------------------------------

/** URLs from successful web search results; error results carry an object, not a list. */
export function collectSearchUrls(content) {
  const urls = new Set();
  for (const block of content) {
    if (block?.type !== 'web_search_tool_result' || !Array.isArray(block.content)) continue;
    for (const r of block.content) if (typeof r?.url === 'string') urls.add(r.url);
  }
  return urls;
}

function normalizeUrl(raw) {
  let s = String(raw).trim();
  try {
    const u = new URL(s);
    u.hash = '';
    s = u.href;
  } catch {
    s = s.split('#')[0];
  }
  return s.replace(/\/+$/, '');
}

/** The brief's story and niche URLs that never appeared in the search results. */
export function verifyBriefUrls(brief, urls) {
  const seen = new Set([...urls].map(normalizeUrl));
  return [...brief.stories, brief.niche].map((s) => s.url).filter((u) => !seen.has(normalizeUrl(u)));
}

// ---- calling ----------------------------------------------------------------------------------

const RESULT_TYPE = /_tool_result$/;

/**
 * Content to echo back on pause_turn. After a mid-output refusal fallback, blocks before the last
 * `fallback` marker keep only text and paired server-tool blocks (claude-api skill, refusal section).
 */
export function echoContent(content) {
  const cut = content.findLastIndex((b) => b.type === 'fallback');
  if (cut < 0) return content;
  const before = content.slice(0, cut);
  const answered = new Set(before.filter((b) => RESULT_TYPE.test(b.type)).map((b) => b.tool_use_id));
  const keep = (b) =>
    b.type === 'text' || RESULT_TYPE.test(b.type) || (b.type === 'server_tool_use' && answered.has(b.id));
  return [...before.filter(keep), ...content.slice(cut + 1)];
}

async function send(client, req, deadline) {
  const left = deadline.remaining();
  if (left <= 0 || deadline.signal.aborted) throw new ModelError('TIMEOUT', 'time budget used up');
  try {
    return await client.beta.messages.create(
      { ...req, ...FALLBACK },
      { signal: deadline.signal, timeout: Math.min(CALL_TIMEOUT_MS, left) },
    );
  } catch (err) {
    if (err instanceof ModelError) throw err;
    if (deadline.signal.aborted || err instanceof APIUserAbortError || err instanceof APIConnectionTimeoutError) {
      throw new ModelError('TIMEOUT', 'model call timed out');
    }
    const status = err?.status ? `${err.status} ` : '';
    throw new ModelError('UPSTREAM', `model call failed: ${status}${err?.message ?? 'unknown error'}`);
  }
}

function checkStop(res) {
  if (res.stop_reason === 'refusal') {
    const category = res.stop_details?.category ?? 'unspecified';
    throw new ModelError('REFUSAL', `the model declined (category: ${category})`);
  }
  if (res.stop_reason === 'max_tokens') throw new ModelError('INVALID_OUTPUT', 'output cut off at max_tokens');
}

const textOf = (content) =>
  content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');

function validate(schema, data, what) {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new ModelError('INVALID_OUTPUT', `${what} failed validation: ${issues.join('; ')}`);
  }
  return parsed.data;
}

async function structuredCall(client, req, schema, deadline, what) {
  const res = await send(client, req, deadline);
  checkStop(res);
  let data;
  try {
    data = JSON.parse(textOf(res.content));
  } catch {
    throw new ModelError('INVALID_OUTPUT', `${what} was not JSON`);
  }
  return validate(schema, data, what);
}

/** Run the search conversation to its end, resuming on pause_turn. */
async function runBriefTurns(client, req, deadline) {
  const messages = [...req.messages];
  const seen = [];
  for (let turn = 0; ; turn += 1) {
    const res = await send(client, { ...req, messages }, deadline);
    seen.push(...res.content);
    if (res.stop_reason !== 'pause_turn') {
      checkStop(res);
      return { res, seen };
    }
    if (turn >= MAX_CONTINUATIONS) throw new ModelError('NO_BRIEF', 'search kept pausing without finishing');
    messages.push({ role: 'assistant', content: echoContent(res.content) });
  }
}

function checkBrief(brief, { types, field }, urls) {
  const got = brief.questions.map((q) => q.type).sort();
  if (got.join() !== [...types].sort().join()) {
    throw new ModelError('INVALID_OUTPUT', `question types ${got.join(', ')} differ from those requested`);
  }
  const unseen = verifyBriefUrls(brief, urls);
  if (unseen.length) throw new ModelError('BAD_URLS', `URLs not in the search results: ${unseen.join(', ')}`);
  return { ...brief, niche: { ...brief.niche, topic: field } };
}

async function briefAttempt(client, args, deadline, note) {
  const req = buildBriefRequest(args);
  if (note) req.messages[0].content += `\n\nA previous attempt was rejected: ${note}. Use only URLs from your searches.`;
  const { res, seen } = await runBriefTurns(client, req, deadline);
  const urls = collectSearchUrls(seen);
  const call = res.content.findLast((b) => b.type === 'tool_use' && b.name === 'submit_brief');
  let data = call?.input;
  if (!call) {
    const notes = textOf(seen).trim();
    if (!notes) throw new ModelError('NO_BRIEF', 'the model produced neither a brief nor notes');
    const fmt = buildFormatRequest({ notes, urls, types: args.types, field: args.field });
    data = await structuredCall(client, fmt, Brief, deadline, 'formatted brief');
  }
  return checkBrief(validate(Brief, data, 'brief'), args, urls);
}

const RETRYABLE = new Set(['BAD_URLS', 'INVALID_OUTPUT']);

export function createModel({ client = new Anthropic({ maxRetries: 1, timeout: CALL_TIMEOUT_MS }) } = {}) {
  return {
    async generateBrief({ night, types, field, deadline }) {
      const args = { night, types, field };
      try {
        return await briefAttempt(client, args, deadline);
      } catch (err) {
        if (!(err instanceof ModelError) || !RETRYABLE.has(err.code) || !deadline.canRetry()) throw err;
        return briefAttempt(client, args, deadline, err.message);
      }
    },

    async grade({ stories, questions, answers, take, deadline }) {
      const req = buildGradeRequest({ stories, questions, answers, take });
      const out = await structuredCall(client, req, GradeResult, deadline, 'grade');
      const want = answers.map((a) => a.idx).sort().join();
      if (out.scores.map((s) => s.idx).sort().join() !== want) {
        throw new ModelError('INVALID_OUTPUT', 'grade scores do not cover each answer exactly once');
      }
      return out;
    },

    async blindTake({ story, deadline }) {
      const out = await structuredCall(client, buildBlindTakeRequest({ story }), BlindTake, deadline, 'blind take');
      return out.take;
    },

    async writeFlaw({ flaw, setting, avoid, deadline }) {
      const req = buildFlawRequest({ flaw, setting, avoid });
      const attempt = () => structuredCall(client, req, FlawDraft, deadline, 'flaw draft');
      try {
        return await attempt();
      } catch (err) {
        if (!(err instanceof ModelError) || err.code !== 'INVALID_OUTPUT' || !deadline.canRetry()) throw err;
        return attempt();
      }
    },
  };
}
