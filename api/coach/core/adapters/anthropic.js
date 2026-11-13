/* Anthropic Messages API. */
import { httpAdapter } from './http.js';
import { SYSTEM_PROMPT } from '../system-prompt.js';

export const ANTHROPIC_VERSION = '2023-06-01';
// My Gym: a request the model declines is answered by another model instead (server-side
// fallback), so a plan is not lost to an over-cautious refusal. The beta turns it on; the
// `fallbacks: "default"` field in the body picks Anthropic's own choice of fallback model.
export const ANTHROPIC_BETA = 'server-side-fallback-2026-07-01';

/* How hard the model thinks, per task. A plan and a weekly review are the jobs worth the time;
 * a question in the chat and a change mid-workout want a quick answer. Anything else (the
 * debrief) gets the API's default. */
const EFFORT = { create: 'high', refine: 'high', review: 'high', ask: 'low', adapt: 'low' };
export const effortFor = task => EFFORT[task] || null;

/* Output room. With thinking always on, a five-week plan at high effort can need more than the
 * 16k the coach settings default to; a plan gets at least this much. */
export const PLAN_MIN_TOKENS = 32000;
const PLAN_TASKS = new Set(['create', 'refine']);

/* The tasks whose answer is held to its schema while it is written (structured outputs). The
 * review is not one: a change's `before` / `after` may be any value (a number, a routine, a
 * warm-up with its rows), which a closed schema cannot say, so it keeps the prompt's JSON and
 * validate.js, as before. A 400 that refuses a schema anyway drops it for the plain request
 * (the compat rungs below, through http.js). */
const FORMAT_TASKS = new Set(['create', 'refine', 'ask', 'debrief', 'adapt']);
const DROP = new Set(['maxItems', 'minItems', 'minimum', 'maximum', 'minLength', 'maxLength', 'pattern']);
const WEEK = { type: 'object', properties: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [String(d), { type: 'string' }])), additionalProperties: false };

/* A copy of a schemas.js schema in the form Anthropic enforces: every object closed
 * (`additionalProperties: false`, which it requires), the plan's `week` spelled out as its
 * weekday keys 0-6 (an open map cannot be closed), and the length and range limits left out
 * (validate.js checks those). */
export function anthropicSchema(node, key) {
  if (key === 'week') return WEEK;
  if (Array.isArray(node)) return node.map(n => anthropicSchema(n));
  if (node == null || typeof node !== 'object') return node;
  const out = {};
  for (const k of Object.keys(node)) {
    if (DROP.has(k)) continue;
    out[k] = k === 'properties'
      ? Object.fromEntries(Object.entries(node.properties).map(([p, v]) => [p, anthropicSchema(v, p)]))
      : anthropicSchema(node[k]);
  }
  if (out.type === 'object') out.additionalProperties = false;
  return out;
}

const dropFormat = body => {
  if (!body.output_config || !body.output_config.format) return body;
  const { format: _f, ...rest } = body.output_config;
  const { output_config: _o, ...b } = body;
  return Object.keys(rest).length ? { ...b, output_config: rest } : b;
};

export const anthropicSpec = {
  id: 'anthropic',
  path: () => '/v1/messages',
  modelsPath: '/v1/models',
  headers: key => ({
    'x-api-key': key,
    'anthropic-version': ANTHROPIC_VERSION,
    'anthropic-beta': ANTHROPIC_BETA,
    // Required for a call made from a browser context. Harmless from a server, and the phone's
    // native HTTP path does not need it either — it is here so a plain-browser dev run works.
    'anthropic-dangerous-direct-browser-access': 'true'
  }),
  // The rules block is marked cacheable: identical for every job of a task, so subsequent
  // jobs read it from Anthropic's prompt cache at a tenth of the input price.
  body: ({ model, prompt, system, schema, maxTokens, task }) => {
    const effort = effortFor(task);
    const format = schema && FORMAT_TASKS.has(task) ? { type: 'json_schema', schema: anthropicSchema(schema) } : null;
    const config = { ...(effort ? { effort } : {}), ...(format ? { format } : {}) };
    return {
      model,
      max_tokens: PLAN_TASKS.has(task) ? Math.max(maxTokens, PLAN_MIN_TOKENS) : maxTokens,
      system: system
        ? [{ type: 'text', text: SYSTEM_PROMPT + '\n\n' + system, cache_control: { type: 'ephemeral' } }]
        : SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
      ...(Object.keys(config).length ? { output_config: config } : {}),
      fallbacks: 'default'
    };
  },
  // A 400 that refuses the schema (http.js namedRungs) is asked once more without it.
  compat: {
    strict: body => body,
    json_object: dropFormat,
    tokens: body => body,
    temperature: body => body,
    plain: dropFormat
  },
  errorMessage: data => data && data.error && data.error.message,
  // The answer is the text blocks. A `fallback` block only marks where another model took over
  // after a refusal; it holds no text and is passed over like a thinking block.
  readText: data => {
    if (data.stop_reason === 'refusal') return { error: 'the model declined this request' + (data.stop_details && data.stop_details.explanation ? ': ' + data.stop_details.explanation : '') };
    const text = (data.content || []).filter(b => b && b.type === 'text').map(b => b.text).join('');
    return { text, truncated: data.stop_reason === 'max_tokens' };
  },
  readModels: data => (data.data || []).map(m => m.id)
};

export default httpAdapter(anthropicSpec);
