/* What the progression engine knows, for the AI Coach (My Gym).
 *
 * The Coach plans and reviews; the app's progression engine decides each session's numbers
 * (frontend lib/progression.js, with the RIR rules in ./rir-rules.js, shared with the app). So the
 * Coach is told, per exercise in the plan, what the engine is working with and what it will do
 * next: the rule, the rep range and step, the latest weight, last session's reps and RIR, how many
 * sessions in a row it has stalled, and the next decision. Plans that fight the engine (a 5 x 5 on
 * an exercise climbing an 8-12 range) or reviews that ignore a stall are then easy to avoid.
 *
 * Built here, from the synced state, so it is the same on the server (where a scheduled review
 * runs with no app open) and on the phone (own key). Bounded like everything in the payload.
 */
import { libraryName } from './library.js';
import { decideNext, rirOf, STALLS_TO_DELOAD } from './rir-rules.js';

export const MAX_PROGRESSION_EXERCISES = 40;
const MAX_SESSIONS_READ = 60;
const RULES = ['off', 'linear', 'greyskull', 'double', 'triple', 'time'];

const list = v => (Array.isArray(v) ? v : []);
const fin = v => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const isWarmup = s => s?.warmup === true || s?.phase === 'warmup';
const round2 = v => Math.round(v * 100) / 100;

/** The rule an exercise runs on: its own, else its routine's, else the profile's (double by default). */
export function ruleOf(S, routine, ex) {
  for (const v of [ex?.prog, routine?.prog, S?.progDefault]) if (RULES.includes(v)) return v;
  return 'double';
}

/** The rep range double progression climbs: `repsMin`..`reps`, the bottom two under the top when unset. */
export function rangeOf(ex) {
  const top = Math.max(1, Math.round(fin(ex?.reps) || 10));
  const min = fin(ex?.repsMin);
  const bottom = min != null && min >= 1 && min < top ? Math.round(min) : Math.max(1, top - 2);
  return { repsMin: bottom, reps: top };
}

/**
 * One exercise's logged sessions, oldest first, as the engine reads them: the planned work sets
 * only (no warm-ups, no extra sets), reps 0 for a set not done, RIR per set, the heaviest done
 * weight. Sessions kept out of progression (a deload, a rehab routine, "don't count this") are left
 * out, as the engine leaves them out.
 */
export function sessionsOf(S, id) {
  const out = [];
  const workouts = list(S?.workouts).filter(w => w && typeof w.d === 'string').sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0)).slice(-MAX_SESSIONS_READ);
  for (const w of workouts) {
    const entry = list(w.entries).find(e => e && e.id === id);
    if (!entry || entry.noProg === true || w.excludeFromProgression === true) continue;
    const work = list(entry.sets).filter(s => s && !isWarmup(s));
    if (!work.some(s => s.done)) continue;
    const planned = Math.max(1, Math.round(fin(entry.target?.sets) || work.length));
    const sets = entry.target ? work.slice(0, planned) : work;
    const done = sets.filter(s => s.done);
    out.push({
      d: w.d.slice(0, 10),
      reps: sets.map(s => (s.done ? Math.max(0, fin(s.r) || 0) : 0)),
      rirs: sets.map(s => (s.done ? rirOf(s) : null)),
      weight: done.length ? Math.max(0, ...done.map(s => fin(s.w) || 0)) : 0,
      enough: sets.length >= planned,
    });
  }
  return out;
}

/**
 * Sessions in a row that stalled at the latest weight, counted back from the last, as the engine
 * counts them under double progression: reaching the top of the range in every set ends it, so
 * does a change of weight, and so does beating the best reps of the sessions before at that weight.
 */
export function stallsOf(sessions, range) {
  let n = 0;
  for (let i = sessions.length - 1; i >= 0; i--) {
    const s = sessions[i];
    const low = s.reps.length ? Math.min(...s.reps) : 0;
    if (s.enough && low >= range.reps) break;
    if (i < sessions.length - 1 && s.weight !== sessions[i + 1].weight) break;
    const before = [];
    for (let j = i - 1; j >= 0 && sessions[j].weight === s.weight; j--) before.push(sessions[j].reps.length ? Math.min(...sessions[j].reps) : 0);
    if (before.length && low > Math.max(...before)) break;
    n++;
  }
  return n;
}

/**
 * The progression picture for every rep exercise in the plan:
 * [{ id, name, rule, range?, step?, weight, last?, stalls?, next? }], `next` being the engine's
 * decision for double progression ({ kind: up | repeat | climb | hold-bottom | deload, reps, reason }).
 */
export function progressionOf(S) {
  const seen = new Set();
  const out = [];
  for (const r of list(S?.routines)) {
    for (const ex of list(r?.ex)) {
      if (!ex || typeof ex.id !== 'string' || seen.has(ex.id)) continue;
      if (ex.mode === 'time' || ex.mode === 'cardio' || !(fin(ex.reps) > 0)) continue;
      seen.add(ex.id);
      const rule = ruleOf(S, r, ex);
      const sessions = sessionsOf(S, ex.id);
      const last = sessions[sessions.length - 1];
      const item = { id: ex.id.slice(0, 64), name: libraryName(ex.id) || null, rule };
      if (fin(ex.inc) > 0) item.step = round2(fin(ex.inc));
      if (rule === 'double') item.range = rangeOf(ex);
      item.weight = last ? last.weight : Math.max(0, fin(ex.weight) || 0);
      if (last) {
        item.last = { d: last.d, reps: last.reps, ...(last.rirs.some(v => v != null) ? { rir: last.rirs } : {}) };
        if (rule === 'double') {
          const stalls = stallsOf(sessions, item.range);
          item.stalls = stalls;
          const low = last.reps.length ? Math.min(...last.reps) : 0;
          item.next = decideNext({ reps: last.reps, rirs: last.rirs, ok: last.enough && low >= item.range.reps }, item.range, { stalls, stallsToDeload: STALLS_TO_DELOAD });
        }
      }
      out.push(item);
      if (out.length >= MAX_PROGRESSION_EXERCISES) return out;
    }
  }
  return out;
}

const iso = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** The deload-week picture: when the last one started (and was ended early), and the last "Not now". */
export function deloadOf(S) {
  const w = S?.deloadWeek;
  const out = {};
  if (iso(w?.start)) out.lastWeek = iso(w.start);
  if (iso(w?.ended)) out.endedEarly = iso(w.ended);
  if (iso(S?.deloadSkipped)) out.skipped = iso(S.deloadSkipped);
  return Object.keys(out).length ? out : null;
}

/**
 * The app's weekly-sets table, as the app worked it out (frontend lib/muscle-targets.js
 * recentMuscleSets) and handed to the payload: [{ muscle, sets, target: [lo, hi], status }].
 * Bounded and typed here, since it comes from the client.
 */
export function cleanVolume(rows) {
  return list(rows).slice(0, 24).map(r => {
    const lo = fin(r?.lo), hi = fin(r?.hi), sets = fin(r?.sets);
    if (typeof r?.slug !== 'string' || lo == null || hi == null || sets == null) return null;
    const status = ['below', 'in', 'above'].includes(r.status) ? r.status : null;
    return { muscle: r.slug.slice(0, 40), sets: Math.max(0, Math.round(sets * 10) / 10), target: [Math.max(0, lo), Math.max(0, hi)], ...(status ? { status } : {}) };
  }).filter(Boolean);
}
