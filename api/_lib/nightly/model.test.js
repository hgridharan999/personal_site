import { describe, expect, it, vi } from 'vitest';
import Anthropic, { APIConnectionError, APIUserAbortError } from '@anthropic-ai/sdk';
import {
  MODEL,
  ModelError,
  buildBlindTakeRequest,
  buildBriefRequest,
  buildFlawRequest,
  buildGradeRequest,
  collectSearchUrls,
  createDeadline,
  createModel,
  echoContent,
  verifyBriefUrls,
} from './model.js';

const TYPES3 = ['forecast', 'decide', 'case_rep'];
const FIELD = 'mycology';
const URLS = ['https://example.com/1', 'https://example.com/2', 'https://example.com/3', 'https://example.com/4'];

const story = (n, url = URLS[n - 1]) => ({ headline: `Headline ${n}`, summary: `Summary ${n}.`, url, source: 'Example' });
const brief = (urls = URLS) => ({
  stories: [story(1, urls[0]), story(2, urls[1]), story(3, urls[2])],
  niche: { ...story(4, urls[3]), topic: FIELD },
  questions: [
    { type: 'forecast', story_index: 0, prompt: 'Give a probability and a date.' },
    { type: 'decide', story_index: 1, prompt: 'What do you do tomorrow?' },
    { type: 'case_rep', story_index: 2, prompt: 'Build the issue tree.' },
  ],
});

const searchUse = (id = 'srv_1') => ({ type: 'server_tool_use', id, name: 'web_search', input: { query: 'news' } });
const searchResult = (urls = URLS, id = 'srv_1') => ({
  type: 'web_search_tool_result',
  tool_use_id: id,
  content: urls.map((url) => ({ type: 'web_search_result', url, title: 't', encrypted_content: 'x', page_age: null })),
});
const searchError = (id = 'srv_2') => ({
  type: 'web_search_tool_result',
  tool_use_id: id,
  content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' },
});
const submitted = (b = brief(), seen = URLS) => ({
  stop_reason: 'tool_use',
  content: [searchUse(), searchResult(seen), { type: 'tool_use', id: 'tu_1', name: 'submit_brief', input: b }],
});
const textReply = (obj) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(obj) }] });
const refusal = () => ({ stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'cyber' }, content: [] });

const roomy = () => ({ signal: new AbortController().signal, remaining: () => 290_000, canRetry: () => true });
const tight = () => ({ signal: new AbortController().signal, remaining: () => 60_000, canRetry: () => false });

function fakeClient(...responses) {
  const calls = [];
  const create = vi.fn(async (req, opts) => {
    calls.push({ req: JSON.parse(JSON.stringify(req)), opts });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    if (!next) throw new Error('fake client ran out of responses');
    return next;
  });
  return { client: { beta: { messages: { create } } }, calls };
}

const briefArgs = (deadline = roomy()) => ({ night: '2026-11-12', types: TYPES3, field: FIELD, deadline });

const gradeInput = () => ({
  stories: brief().stories,
  questions: brief().questions,
  answers: [
    { idx: 0, answer: 'SENTINEL_ANSWER_ZERO about forty percent by June' },
    { idx: 1, answer: 'SENTINEL_ANSWER_ONE I would cut prices' },
    { idx: 2, answer: 'SENTINEL_ANSWER_TWO revenue, cost, market' },
  ],
  take: { storyIndex: 1, body: 'SENTINEL_TAKE_BODY I saw this at the warehouse last week.' },
});
const gradeOut = () => ({
  scores: [0, 1, 2].map((idx) => ({ idx, score: 3, feedback: 'Names no base rate.' })),
  followUp: 'What did the warehouse manager say?',
});

describe('createDeadline', () => {
  it('counts down from the injected clock and allows a retry only with more than 90s left', () => {
    let t = 1_000;
    const d = createDeadline(300_000, () => t);
    expect(d.signal).toBeInstanceOf(AbortSignal);
    expect(d.remaining()).toBe(300_000);
    expect(d.canRetry()).toBe(true);
    t += 210_000;
    expect(d.remaining()).toBe(90_000);
    expect(d.canRetry()).toBe(false);
    t += 500_000;
    expect(d.remaining()).toBe(0);
  });
});

describe('collectSearchUrls', () => {
  it('collects result URLs and ignores error-object results', () => {
    const urls = collectSearchUrls([
      { type: 'text', text: 'hi' },
      searchUse(),
      searchResult(['https://a.com/x', 'https://b.com/y']),
      searchError(),
    ]);
    expect([...urls].sort()).toEqual(['https://a.com/x', 'https://b.com/y']);
  });
});

describe('verifyBriefUrls', () => {
  it('rejects unseen url', () => {
    const b = brief([URLS[0], URLS[1], 'https://made.up/x', URLS[3]]);
    expect(verifyBriefUrls(b, new Set(URLS))).toEqual(['https://made.up/x']);
  });
  it('accepts a URL that differs only in host case, trailing slash or fragment', () => {
    const b = brief(['https://Example.com/a/', 'https://example.com/b#top', URLS[2], URLS[3]]);
    const seen = new Set(['https://example.com/a', 'https://example.com/b', URLS[2], URLS[3]]);
    expect(verifyBriefUrls(b, seen)).toEqual([]);
  });
  it('checks the niche URL too', () => {
    const b = brief([URLS[0], URLS[1], URLS[2], 'https://made.up/niche']);
    expect(verifyBriefUrls(b, new Set(URLS))).toEqual(['https://made.up/niche']);
  });
});

describe('request builders', () => {
  it('buildBlindTakeRequest carries the story and nothing from the answers or take', () => {
    const g = gradeInput();
    const story = g.stories[g.take.storyIndex];
    const json = JSON.stringify(buildBlindTakeRequest({ story }));
    expect(json).toContain(story.headline);
    expect(json).toContain(story.summary);
    for (const s of ['SENTINEL_ANSWER_ZERO', 'SENTINEL_ANSWER_ONE', 'SENTINEL_ANSWER_TWO', 'SENTINEL_TAKE_BODY']) {
      expect(json).not.toContain(s);
    }
    expect(JSON.stringify(buildGradeRequest(g))).toContain('SENTINEL_TAKE_BODY');
  });

  it('buildBlindTakeRequest uses structured output and no tools', () => {
    const req = buildBlindTakeRequest({ story: story(1) });
    expect(req.model).toBe(MODEL);
    expect(req.output_config.format.type).toBe('json_schema');
    expect(req.tools).toBeUndefined();
  });

  it('buildGradeRequest carries the take body and all three answers', () => {
    const req = buildGradeRequest(gradeInput());
    const json = JSON.stringify(req);
    for (const s of ['SENTINEL_TAKE_BODY', 'SENTINEL_ANSWER_ZERO', 'SENTINEL_ANSWER_ONE', 'SENTINEL_ANSWER_TWO']) {
      expect(json).toContain(s);
    }
    expect(req.output_config.format.type).toBe('json_schema');
    expect(req.tools).toBeUndefined();
  });

  it('buildBriefRequest names the three types and the field, with web search capped at 8', () => {
    const req = buildBriefRequest({ night: '2026-11-12', types: TYPES3, field: FIELD });
    const json = JSON.stringify(req);
    for (const name of ['Forecast', 'Decide', 'Case rep']) expect(json).toContain(name);
    expect(json).toContain(FIELD);
    expect(json).toContain('"max_uses":8');
    expect(json).toContain('2026-11-12');
    expect(req.model).toBe(MODEL);
    const search = req.tools.find((t) => t.name === 'web_search');
    expect(search).toMatchObject({ type: 'web_search_20260209', max_uses: 8 });
    const submit = req.tools.find((t) => t.name === 'submit_brief');
    expect(submit.strict).toBe(true);
    expect(submit.input_schema.additionalProperties).toBe(false);
    expect(submit.input_schema.required).toEqual(['stories', 'niche', 'questions']);
    expect(req.tool_choice).toEqual({ type: 'auto' });
  });
});

describe('generateBrief', () => {
  it('returns a parsed brief from a submit_brief tool_use response', async () => {
    const { client, calls } = fakeClient(submitted());
    const out = await createModel({ client }).generateBrief(briefArgs());
    expect(out).toEqual(brief());
    expect(calls).toHaveLength(1);
    expect(calls[0].req.fallbacks).toBe('default');
    expect(calls[0].opts.signal).toBeInstanceOf(AbortSignal);
    expect(calls[0].opts.timeout).toBeLessThanOrEqual(120_000);
  });

  it('pins the niche topic to the requested field', async () => {
    const b = brief();
    b.niche.topic = 'fungi';
    const { client } = fakeClient(submitted(b));
    const out = await createModel({ client }).generateBrief(briefArgs());
    expect(out.niche.topic).toBe(FIELD);
  });

  it('retries once on a bad URL, then throws BAD_URLS when the retry is also bad', async () => {
    const bad = brief([URLS[0], URLS[1], 'https://made.up/x', URLS[3]]);
    const { client, calls } = fakeClient(submitted(bad), submitted(bad));
    await expect(createModel({ client }).generateBrief(briefArgs())).rejects.toMatchObject({ code: 'BAD_URLS' });
    expect(calls).toHaveLength(2);
  });

  it('succeeds when the retry is good', async () => {
    const bad = brief([URLS[0], URLS[1], 'https://made.up/x', URLS[3]]);
    const { client, calls } = fakeClient(submitted(bad), submitted());
    await expect(createModel({ client }).generateBrief(briefArgs())).resolves.toEqual(brief());
    expect(calls).toHaveLength(2);
    expect(calls[0].req.messages[0].content).not.toContain('made.up');
    expect(calls[1].req.messages[0].content).toContain('https://made.up/x');
  });

  it('does not retry when canRetry() is false', async () => {
    const bad = brief([URLS[0], URLS[1], 'https://made.up/x', URLS[3]]);
    const { client, calls } = fakeClient(submitted(bad), submitted());
    await expect(createModel({ client }).generateBrief(briefArgs(tight()))).rejects.toMatchObject({ code: 'BAD_URLS' });
    expect(calls).toHaveLength(1);
  });

  it('handles one pause_turn, re-sending with the assistant content appended', async () => {
    const paused = { stop_reason: 'pause_turn', content: [searchUse('srv_0'), searchResult([URLS[0], URLS[1]], 'srv_0')] };
    const done = submitted(brief(), [URLS[2], URLS[3]]);
    const { client, calls } = fakeClient(paused, done);
    const out = await createModel({ client }).generateBrief(briefArgs());
    expect(out).toEqual(brief());
    expect(calls).toHaveLength(2);
    const msgs = calls[1].req.messages;
    expect(msgs).toHaveLength(2);
    expect(msgs[1]).toEqual({ role: 'assistant', content: paused.content });
  });

  it('throws REFUSAL on a refusal stop reason', async () => {
    const { client } = fakeClient(refusal());
    const err = await createModel({ client }).generateBrief(briefArgs()).catch((e) => e);
    expect(err).toBeInstanceOf(ModelError);
    expect(err.code).toBe('REFUSAL');
  });

  it('falls back to one no-tools structured call when submit_brief is not called', async () => {
    const research = {
      stop_reason: 'end_turn',
      content: [searchUse(), searchResult(), { type: 'text', text: 'Story one: ... https://example.com/1' }],
    };
    const { client, calls } = fakeClient(research, textReply(brief()));
    const out = await createModel({ client }).generateBrief(briefArgs());
    expect(out).toEqual(brief());
    expect(calls).toHaveLength(2);
    const fmt = calls[1].req;
    expect(fmt.tools).toBeUndefined();
    expect(fmt.output_config.format.type).toBe('json_schema');
    expect(JSON.stringify(fmt.messages)).toContain('Story one');
  });

  it('throws NO_BRIEF when there is neither a tool call nor text', async () => {
    const { client } = fakeClient({ stop_reason: 'end_turn', content: [searchUse(), searchResult()] });
    await expect(createModel({ client }).generateBrief(briefArgs())).rejects.toMatchObject({ code: 'NO_BRIEF' });
  });

  it('rejects a brief whose question types differ from the requested ones', async () => {
    const b = brief();
    b.questions[2].type = 'estimate';
    const { client } = fakeClient(submitted(b), submitted(b));
    await expect(createModel({ client }).generateBrief(briefArgs())).rejects.toMatchObject({ code: 'INVALID_OUTPUT' });
  });

  it('maps an aborted request to TIMEOUT and other SDK errors to UPSTREAM', async () => {
    const a = fakeClient(new APIUserAbortError());
    await expect(createModel({ client: a.client }).generateBrief(briefArgs())).rejects.toMatchObject({ code: 'TIMEOUT' });
    const b = fakeClient(new APIConnectionError({ message: 'socket hang up' }));
    await expect(createModel({ client: b.client }).generateBrief(briefArgs())).rejects.toMatchObject({ code: 'UPSTREAM' });
  });
});

describe('echoContent', () => {
  it('passes content through when there was no fallback', () => {
    const c = [{ type: 'thinking', thinking: '', signature: 's' }, searchUse(), searchResult()];
    expect(echoContent(c)).toEqual(c);
  });
  it('drops unpaired and model-internal blocks before the last fallback boundary', () => {
    const c = [
      { type: 'thinking', thinking: '', signature: 's' },
      searchUse('srv_a'),
      searchResult(URLS, 'srv_a'),
      searchUse('srv_b'),
      { type: 'text', text: 'partial' },
      { type: 'fallback', from: { model: 'a' }, to: { model: 'b' } },
      { type: 'thinking', thinking: '', signature: 't' },
    ];
    expect(echoContent(c).map((b) => b.type)).toEqual([
      'server_tool_use',
      'web_search_tool_result',
      'text',
      'thinking',
    ]);
  });
});

describe('grade', () => {
  it('returns a validated GradeResult', async () => {
    const { client, calls } = fakeClient(textReply(gradeOut()));
    const out = await createModel({ client }).grade({ ...gradeInput(), deadline: roomy() });
    expect(out).toEqual(gradeOut());
    expect(calls).toHaveLength(1);
  });
  it('throws INVALID_OUTPUT on output that fails the schema', async () => {
    const bad = gradeOut();
    bad.scores[0].score = 9;
    const { client } = fakeClient(textReply(bad));
    await expect(createModel({ client }).grade({ ...gradeInput(), deadline: roomy() })).rejects.toMatchObject({
      code: 'INVALID_OUTPUT',
    });
  });
  it('throws INVALID_OUTPUT when scores do not cover each answer once', async () => {
    const bad = gradeOut();
    bad.scores[2].idx = 0;
    const { client } = fakeClient(textReply(bad));
    await expect(createModel({ client }).grade({ ...gradeInput(), deadline: roomy() })).rejects.toMatchObject({
      code: 'INVALID_OUTPUT',
    });
  });
  it('throws INVALID_OUTPUT on non-JSON text and on max_tokens', async () => {
    const a = fakeClient({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'not json' }] });
    await expect(createModel({ client: a.client }).grade({ ...gradeInput(), deadline: roomy() })).rejects.toMatchObject({
      code: 'INVALID_OUTPUT',
    });
    const b = fakeClient({ ...textReply(gradeOut()), stop_reason: 'max_tokens' });
    await expect(createModel({ client: b.client }).grade({ ...gradeInput(), deadline: roomy() })).rejects.toMatchObject({
      code: 'INVALID_OUTPUT',
    });
  });
  it('throws REFUSAL on a refusal', async () => {
    const { client } = fakeClient(refusal());
    await expect(createModel({ client }).grade({ ...gradeInput(), deadline: roomy() })).rejects.toMatchObject({
      code: 'REFUSAL',
    });
  });
});

describe('wire format through the real SDK client (fake fetch, no network)', () => {
  it('sends the fallback beta as a header and the request fields in the body', async () => {
    let sent;
    const fetch = async (url, init) => {
      sent = { url: String(url), headers: new Headers(init.headers), body: JSON.parse(init.body) };
      const message = {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: MODEL,
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: '{"take":"A view."}' }],
        usage: { input_tokens: 1, output_tokens: 1 },
      };
      return new Response(JSON.stringify(message), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const client = new Anthropic({ apiKey: 'not-a-real-key', fetch, maxRetries: 0 });
    const out = await createModel({ client }).blindTake({ story: story(1), deadline: roomy() });
    expect(out).toBe('A view.');
    expect(sent.url).toContain('/v1/messages');
    expect(sent.headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    expect(sent.body).toMatchObject({ model: MODEL, fallbacks: 'default' });
    expect(sent.body.betas).toBeUndefined();
    expect(sent.body.output_config.format.type).toBe('json_schema');
  });
});

describe('blindTake', () => {
  it('returns the take string', async () => {
    const { client, calls } = fakeClient(textReply({ take: 'A committed view. It will fail. Here is why.' }));
    const out = await createModel({ client }).blindTake({ story: story(2), deadline: roomy() });
    expect(out).toBe('A committed view. It will fail. Here is why.');
    expect(JSON.stringify(calls[0].req)).toContain('Headline 2');
  });
  it('throws INVALID_OUTPUT on an empty take', async () => {
    const { client } = fakeClient(textReply({ take: '' }));
    await expect(createModel({ client }).blindTake({ story: story(2), deadline: roomy() })).rejects.toMatchObject({
      code: 'INVALID_OUTPUT',
    });
  });
});

describe('flaw call', () => {
  const flaw = { key: 'survivorship', name: 'Survivorship bias', definition: 'Judging by the winners that remain.' };
  const setting = 'a regional bakery chain deciding on expansion';
  const draft = { argument: 'Every bakery we studied thrived. So expanding works.', explanation: 'It ignores closures. That is the flaw.' };
  const avoid = [
    { key: 'sunk_cost', name: 'Sunk cost', definition: 'Continuing because of past spend.' },
    { key: 'goodhart', name: "Goodhart's law", definition: 'Optimizing the measure, not the goal.' },
  ];
  const args = (deadline) => ({ flaw, setting, avoid, deadline });

  it('buildFlawRequest has no tools, low effort, a json_schema format, and names the flaw and setting', () => {
    const req = buildFlawRequest({ flaw, setting });
    expect(req.tools).toBeUndefined();
    expect(req.output_config.effort).toBe('low');
    expect(req.output_config.format.type).toBe('json_schema');
    const user = req.messages[0].content;
    expect(user).toContain(flaw.name);
    expect(user).toContain(flaw.definition);
    expect(user).toContain(setting);
    expect(req.system).not.toContain(flaw.name);
  });
  it('buildFlawRequest tells the model to avoid the distractor flaws', () => {
    const user = buildFlawRequest({ flaw, setting, avoid }).messages[0].content;
    expect(user).toContain('<avoid>');
    expect(user).toMatch(/must not plausibly commit/i);
    avoid.forEach((a) => {
      expect(user).toContain(a.name);
      expect(user).toContain(a.definition);
    });
  });
  it('buildFlawRequest leaves out the avoid block when there is nothing to avoid', () => {
    expect(buildFlawRequest({ flaw, setting }).messages[0].content).not.toContain('<avoid>');
  });
  it('writeFlaw sends the avoid list', async () => {
    const { client, calls } = fakeClient(textReply(draft));
    await createModel({ client }).writeFlaw(args(roomy()));
    expect(calls[0].req.messages[0].content).toContain("Goodhart's law");
  });
  it('writeFlaw returns the parsed draft', async () => {
    const { client } = fakeClient(textReply(draft));
    expect(await createModel({ client }).writeFlaw(args(roomy()))).toEqual(draft);
  });
  it('retries once on non-JSON when there is room', async () => {
    const { client, calls } = fakeClient({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'oops' }] }, textReply(draft));
    expect(await createModel({ client }).writeFlaw(args(roomy()))).toEqual(draft);
    expect(calls).toHaveLength(2);
  });
  it('does not retry when time is tight', async () => {
    const { client, calls } = fakeClient({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'oops' }] }, textReply(draft));
    await expect(createModel({ client }).writeFlaw(args(tight()))).rejects.toMatchObject({ code: 'INVALID_OUTPUT' });
    expect(calls).toHaveLength(1);
  });
  it('throws REFUSAL without retrying', async () => {
    const { client, calls } = fakeClient(refusal(), textReply(draft));
    const err = await createModel({ client }).writeFlaw(args(roomy())).catch((e) => e);
    expect(err).toBeInstanceOf(ModelError);
    expect(err.code).toBe('REFUSAL');
    expect(calls).toHaveLength(1);
  });
});
