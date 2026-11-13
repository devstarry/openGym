/* My Gym: the request the Coach sends Anthropic. Effort by task, the schema held while the answer
 * is written, the refusal fallback, room for a plan, and the plain request when a schema is
 * refused. Driven with a fake fetch: nothing here reaches the network. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { tempData } from './helpers.mjs';

tempData();
const anthropic = (await import('../coach/core/adapters/anthropic.js')).default;
const { anthropicSchema, ANTHROPIC_BETA, PLAN_MIN_TOKENS } = await import('../coach/core/adapters/anthropic.js');
const { SCHEMAS, CREATE_SCHEMA } = await import('../coach/core/schemas.js');
const { HTTP_PROVIDERS } = await import('../coach/core/providers.js');

const env = { ANTHROPIC_API_KEY: 'sk-ant-test' };
const reply = text => ({ status: 200, body: { content: [{ type: 'text', text }], stop_reason: 'end_turn' } });
function fakeFetch(answers) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ headers: init.headers, body: JSON.parse(init.body) });
    const a = answers[Math.min(calls.length, answers.length) - 1];
    return { ok: a.status === 200, status: a.status, text: async () => JSON.stringify(a.body) };
  };
  f.calls = calls;
  return f;
}
const send = async (task, extra = {}, answers = [reply('{"coach_contract":1}')]) => {
  const f = fakeFetch(answers);
  const r = await anthropic.invoke({ cfg: {}, prompt: 'P', system: 'S', schema: SCHEMAS[task], task, env, model: null, fetch: f, maxTokens: 16000, ...extra });
  return { r, calls: f.calls, body: f.calls[0].body };
};

test('the default model is Claude Opus 5.5', () => {
  assert.equal(HTTP_PROVIDERS.anthropic.defaultModel, 'claude-opus-5-5');
});

test('plans and reviews think hard, a question or a mid-workout change answers quickly', async () => {
  for (const [task, effort] of [['create', 'high'], ['refine', 'high'], ['review', 'high'], ['ask', 'low'], ['adapt', 'low']]) {
    assert.equal((await send(task)).body.output_config.effort, effort, task);
  }
  assert.equal((await send('debrief')).body.output_config.effort, undefined, 'the debrief keeps the default');
});

test('a declined request falls back to another model: the beta header and the body field', async () => {
  const { calls, body } = await send('create');
  assert.equal(calls[0].headers['anthropic-beta'], ANTHROPIC_BETA);
  assert.equal(ANTHROPIC_BETA, 'server-side-fallback-2026-07-01');
  assert.equal(body.fallbacks, 'default');
  assert.equal(calls[0].headers['x-api-key'], 'sk-ant-test', 'the key comes from the caller, never the code');
});

test('a plan is held to its schema while it is written; a review is not', async () => {
  const plan = (await send('create')).body.output_config.format;
  assert.equal(plan.type, 'json_schema');
  assert.deepEqual(plan.schema, anthropicSchema(CREATE_SCHEMA));
  assert.equal((await send('ask')).body.output_config.format.type, 'json_schema');
  assert.equal((await send('review')).body.output_config.format, undefined);
  assert.equal((await send('create', { schema: null })).body.output_config.format, undefined, 'no schema, no format');
});

test('the schema in the form Anthropic enforces: closed objects, the week as weekdays, no limits', () => {
  const s = anthropicSchema(CREATE_SCHEMA);
  assert.equal(s.additionalProperties, false);
  assert.deepEqual(Object.keys(s.properties.week.properties), ['0', '1', '2', '3', '4', '5', '6']);
  assert.equal(s.properties.week.additionalProperties, false);
  assert.equal(s.properties.routines.maxItems, undefined);
  assert.equal(s.properties.routines.items.additionalProperties, false);
  assert.equal(s.properties.routines.items.properties.ex.items.additionalProperties, false);
  assert.equal(s.properties.programme.properties.weeks.items.additionalProperties, false);
  assert.deepEqual(s.required, CREATE_SCHEMA.required);
  assert.equal(CREATE_SCHEMA.properties.routines.maxItems, 7, 'the shared schema is left as it was');
  const walk = n => (n && typeof n === 'object' ? Object.entries(n).every(([k, v]) => k !== 'maxItems' && walk(v)) : true);
  assert.equal(walk(s), true);
});

test('a plan gets at least 32k tokens of output room; other tasks keep the setting', async () => {
  assert.equal((await send('create')).body.max_tokens, PLAN_MIN_TOKENS);
  assert.equal((await send('refine', { maxTokens: 50000 })).body.max_tokens, 50000);
  assert.equal((await send('review')).body.max_tokens, 16000);
});

test('a 400 that refuses the schema is asked once more without it, effort kept', async () => {
  const refused = { status: 400, body: { type: 'error', error: { type: 'invalid_request_error', message: 'output_config.format.schema: unsupported schema keyword' } } };
  const { r, calls } = await send('create', {}, [refused, reply('{"coach_contract":1}')]);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(calls.length, 2);
  assert.ok(calls[0].body.output_config.format);
  assert.equal(calls[1].body.output_config.format, undefined);
  assert.equal(calls[1].body.output_config.effort, 'high');
});

test('the answer is the text blocks; thinking and fallback markers are passed over', async () => {
  const body = { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '…' }, { type: 'fallback' }, { type: 'text', text: '{"coach_contract":1,' }, { type: 'text', text: '"answer":"x"}' }] };
  const { r } = await send('ask', {}, [{ status: 200, body }]);
  assert.equal(r.text, '{"coach_contract":1,"answer":"x"}');
});
