// My Gym's progression rules: reps in reserve (RIR) on top of double progression.
//
// Pure functions of plain numbers — no store, no clock, no network — so they run on the phone,
// offline, for nothing, and every rule is pinned by rir-rules.test.js. progression.js turns the
// session decision into an exact weight with the machinery it already has (owned dumbbells,
// assistance machines, the Epley deload); the in-session suggestion and the deload week use
// stepLoad below.
//
// RIR is how many more reps you could have done: 0 is failure, 4 here means "4 or more". The
// aim is RIR 1-2: hard enough to grow, far enough from failure to recover and keep climbing.
//
// An effort that was not logged is unknown, never 0. An empty cell must not read as failure, and
// a history without RIR (an import from another app, a profile that never logged it) runs the
// plain double progression it always did.

/** The highest RIR the app asks for: "4+" is stored and read as 4. */
export const RIR_MAX = 4
/** The RIR a working set aims for. */
export const RIR_TARGET = { low: 1, high: 2 }
/** A session whose every set was at least this far from failure was too easy: +2 reps. */
export const RIR_EASY_SESSION = 3
/** A set at least this far from failure makes the next set heavier, in the session. */
export const RIR_EASY_SET = 4
/** Stalled sessions in a row, at one weight, before that exercise deloads. */
export const STALLS_TO_DELOAD = 2
/** Weeks between deload weeks; the card on Today offers one after this long. */
export const DELOAD_EVERY_WEEKS = 5
/** A deload week's load, as a share of the working weight, and the share of sets it keeps. */
export const DELOAD_WEEK_LOAD = 0.9
export const DELOAD_WEEK_SETS = 2 / 3

const num = v => (v === null || v === undefined || v === '' ? NaN : Number(v))
const round2 = v => Math.round(v * 100) / 100

/**
 * One set's RIR, 0 to RIR_MAX, or null when none was logged. A set logged as RPE (the other
 * scale the app offers) reads as 10 - RPE. A logged RIR wins over an RPE on the same set.
 */
export function rirOf(set) {
  if (!set || typeof set !== 'object') return null
  let v = num(set.rir)
  if (!Number.isFinite(v)) {
    const rpe = num(set.rpe)
    if (!Number.isFinite(rpe)) return null
    v = 10 - rpe
  }
  return Math.min(RIR_MAX, Math.max(0, v))
}

/**
 * What the next session of an exercise should do, under double progression with RIR.
 *
 * `last` is one session as progression.js readSession reads it: `reps` (per planned work set,
 * 0 for a set not done), `rirs` (per set, null where not logged), `ok` (every planned set done at
 * its target) and `low` (the weakest set). `range` is { repsMin, reps } (the top). `stalls` is
 * progression.js stallCount for this exercise.
 *
 * Returns { kind, reps, reason }:
 *   up          +1 weight step, reps back to the bottom
 *   repeat      same weight and reps (top of the range, but the last set was at failure)
 *   climb       same weight, `reps` per set
 *   deload      lighter (progression.js picks the weight), reps back to the bottom
 *   hold-bottom same weight, back to the bottom of the range
 * `reason` is a code the app turns into words.
 */
export function decideNext(last, range, { repStep = 1, stalls = 0, stallsToDeload = STALLS_TO_DELOAD } = {}) {
  const bottom = Math.max(1, Math.round(num(range?.repsMin)) || 1)
  const top = Math.max(bottom, Math.round(num(range?.reps)) || bottom)
  const reps = Array.isArray(last?.reps) ? last.reps.map(r => Math.max(0, num(r) || 0)) : []
  const rirs = Array.isArray(last?.rirs) ? last.rirs.map(r => (r == null ? null : rirOf({ rir: r }))) : []
  const low = reps.length ? Math.min(...reps) : 0
  const logged = rirs.some(r => r != null)
  const step = Math.max(1, Math.round(num(repStep)) || 1)

  // Every planned set at the top of the range.
  if (last?.ok && reps.length && low >= top) {
    const lastRir = rirs.length ? rirs[reps.length - 1] ?? null : null
    if (lastRir === 0) return { kind: 'repeat', reps: top, reason: 'top-at-failure' }
    return { kind: 'up', reps: bottom, reason: logged ? 'top-with-reserve' : 'top' }
  }
  if (stalls >= stallsToDeload) return { kind: 'deload', reps: bottom, reason: 'stalled' }
  if (low < bottom) return { kind: 'hold-bottom', reps: bottom, reason: 'below-range' }
  // Inside the range. Too easy only when every set says so: one unlogged set is no evidence.
  const easy = reps.length > 0 && rirs.length >= reps.length && reps.every((_, k) => rirs[k] != null && rirs[k] >= RIR_EASY_SESSION)
  const aim = Math.min(top, Math.max(bottom, low + (easy ? 2 * step : step)))
  return { kind: 'climb', reps: aim, reason: easy ? 'easy' : 'climb' }
}

/**
 * One weight step heavier (dir > 0) or lighter (dir < 0), the way the gym can make it.
 *   step      the exercise's weight step (kg or lb, whichever the profile uses)
 *   assisted  an assistance machine: heavier work is LESS help, so the number goes down
 *   owned     the weights you own for it (dumbbells, a machine's stack), ascending; the next one
 *   floor     the lightest it may go: 0, or the empty bar
 * Never below the floor or 0; on the step's grid; at the top of what you own it holds.
 */
export function stepLoad(weight, dir, { step = 2.5, assisted = false, owned = null, floor = 0 } = {}) {
  const w = Math.max(0, num(weight) || 0)
  const s = num(step) > 0 ? num(step) : 2.5
  const d = dir > 0 ? 1 : dir < 0 ? -1 : 0
  if (!d) return w
  const move = assisted ? -d : d   // more help is easier
  if (Array.isArray(owned) && owned.length && !assisted) {
    const list = [...new Set(owned.map(Number).filter(x => Number.isFinite(x) && x >= 0))].sort((a, b) => a - b)
    if (!list.length) return w
    const next = move > 0 ? list.find(x => x > w + 1e-9) : [...list].reverse().find(x => x < w - 1e-9)
    return Math.max(floor, next ?? w)
  }
  const onGrid = round2(Math.round(w / s) * s)
  const out = round2(onGrid + move * s)
  return Math.max(assisted ? 0 : floor, 0, out)
}

/**
 * The suggestion for the next set, right after one was ticked. Returns { w, r, reason } for the
 * next row, or null to leave it alone.
 *   done   the set just ticked: { w, r, rir }
 *   next   the next row as it stands: { w, r }
 *   range  { repsMin, reps }
 *   load   stepLoad's options, plus `bodyweight` (no load of its own: easier or harder is reps)
 */
export function nextSet(done, next, range, load = {}) {
  if (!done || !next) return null
  const rir = rirOf(done)
  if (rir == null) return null
  const r = Math.max(0, num(done.r) || 0)
  const bottom = Math.max(1, Math.round(num(range?.repsMin)) || 1)
  const nextW = Math.max(0, num(next.w) || 0)
  const nextR = Math.max(0, num(next.r) || 0)
  const step = Math.max(1, Math.round(num(load.repStep)) || 1)
  const bodyOnly = !!load.bodyweight && nextW <= 0
  if (rir >= RIR_EASY_SET) {
    if (bodyOnly) return { w: 0, r: nextR + step, reason: 'set-easy' }
    const w = stepLoad(nextW, 1, load)
    return w === nextW ? null : { w, r: nextR, reason: 'set-easy' }
  }
  if (rir === 0 && r < bottom) {
    if (bodyOnly) return r < nextR ? { w: 0, r, reason: 'set-failed-below' } : null
    const w = stepLoad(nextW, -1, load)
    return w === nextW ? null : { w, r: nextR, reason: 'set-failed-below' }
  }
  if (rir === 0 && r < nextR) return { w: nextW, r, reason: 'set-failed-in-range' }
  return null
}

// --- the deload week ----------------------------------------------------------------------------

const DAY = 86400000
const dayOf = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''))
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY : null
}
/** Whole calendar days from `a` to `b` ('YYYY-MM-DD'), or null. No clock changes: dates only. */
export function daysBetween(a, b) {
  const x = dayOf(a), y = dayOf(b)
  return x == null || y == null ? null : y - x
}

/**
 * Whether Today should offer a deload week. The clock runs from the latest of the first workout,
 * the last deload week's start and the last time the offer was skipped.
 *   { today, firstWorkout, lastDeload, skipped, weeks }  dates as 'YYYY-MM-DD'
 * Returns { due, days, from } — `days` since `from`, or { due: false } with nothing to count from.
 */
export function deloadDue({ today, firstWorkout, lastDeload, skipped, weeks = DELOAD_EVERY_WEEKS } = {}) {
  const from = [firstWorkout, lastDeload, skipped].filter(d => dayOf(d) != null).sort().pop()
  if (!from || dayOf(today) == null) return { due: false }
  const days = daysBetween(from, today)
  const w = Math.min(6, Math.max(4, Math.round(num(weeks)) || DELOAD_EVERY_WEEKS))
  return { due: days >= w * 7, days, from }
}

/** Whether a day falls in the deload week that started on `start` (seven days, start included). */
export function inDeloadWeek(day, start) {
  const n = daysBetween(start, day)
  return n != null && n >= 0 && n < 7
}

/**
 * One exercise's plan in a deload week: about 10 % less load and two thirds of the sets (at least
 * one). Lighter is snapped down to the step's grid (or the next weight you own); an assistance
 * machine gets more help instead; bodyweight work keeps no load and only loses sets.
 */
export function deloadWeekPlan({ sets, weight }, load = {}) {
  const n = Math.max(1, Math.round(num(sets)) || 1)
  const keep = Math.max(1, Math.round(n * DELOAD_WEEK_SETS))
  const w = Math.max(0, num(weight) || 0)
  if (w <= 0) return { sets: keep, weight: 0 }
  const s = num(load.step) > 0 ? num(load.step) : 2.5
  if (load.assisted) return { sets: keep, weight: round2(Math.ceil((w / DELOAD_WEEK_LOAD) / s) * s) }
  const ideal = w * DELOAD_WEEK_LOAD
  if (Array.isArray(load.owned) && load.owned.length) {
    const below = [...load.owned].map(Number).filter(x => Number.isFinite(x) && x <= ideal + 1e-9).sort((a, b) => b - a)[0]
    return { sets: keep, weight: Math.max(load.floor || 0, below ?? Math.min(...load.owned.map(Number))) }
  }
  const down = round2(Math.floor(ideal / s + 1e-9) * s)
  return { sets: keep, weight: Math.max(load.floor || 0, down) }
}
