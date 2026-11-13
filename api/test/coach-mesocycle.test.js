// My Gym: the plan the Coach builds carries its training block (mesocycle): weeks of a week-wide
// RPE and a deload week, in the plan-file format the app imports (validatePlan).
import test from 'node:test';
import assert from 'node:assert/strict';
import { tempData } from './helpers.mjs';

tempData();
const { validatePlan } = await import('../coach/core/validate.js');
const payload = await import('../coach/core/payload.js');

const BENCH = '0025';
const answer = (programme, extra = {}) => ({
  coach_contract: 1, opengym_plan: 1, name: 'Push pull', summary: 'Two days.',
  week: { 1: 'r1', 4: 'r2' },
  routines: [
    { id: 'r1', name: 'Push', ex: [{ id: BENCH, sets: 3, reps: 12, repsMin: 8, prog: 'double', inc: 2.5, why: 'Chest.' }] },
    { id: 'r2', name: 'Pull', ex: [{ id: BENCH, sets: 3, reps: 10, repsMin: 6, prog: 'double', inc: 2.5, why: 'Again.' }] },
  ],
  ...(programme === undefined ? {} : { programme }),
  ...extra,
});
const ctx = (extra = {}) => ({ equipment: [], offered: new Set([BENCH]), daysPerWeek: 2, ...extra });
const FIVE = { name: 'Block one', weeks: [{ rpe: 7 }, { rpe: 7.5 }, { rpe: 8 }, { rpe: 9 }, { deload: true }] };

test('a block of rising RPE and a deload week travels in the plan file over the plan\'s own week', () => {
  const r = validatePlan(answer(FIVE), ctx({ blockWeeks: 5 }));
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.bundle.programme_fmt, 1);
  assert.deepEqual(r.bundle.programmes, [{
    name: 'Block one',
    weeks: [{ rpe: 7 }, { rpe: 7.5 }, { rpe: 8 }, { rpe: 9 }, { deload: true }],
    days: { 1: ['r1'], 4: ['r2'] },
  }]);
});

test('the intake asked for a block: one is required, of exactly that many weeks', () => {
  assert.match(validatePlan(answer(undefined), ctx({ blockWeeks: 5 })).errors.join('\n'), /programme is missing: write the 5-week/);
  assert.match(validatePlan(answer({ weeks: [{ rpe: 7 }, { rpe: 8 }, { deload: true }] }), ctx({ blockWeeks: 5 })).errors.join('\n'), /3 weeks but 5 were asked for/);
});

test('no length asked (a plan from before): the block is optional, and checked when it is there', () => {
  const none = validatePlan(answer(undefined), ctx());
  assert.equal(none.ok, true);
  assert.equal(none.bundle.programmes, undefined);
  assert.equal(validatePlan(answer({ weeks: [{ rpe: 8 }, { deload: true }] }), ctx()).ok, true);
});

test('a block needs a deload week, RPE 6-10, 2-12 weeks, and objects for weeks', () => {
  const errs = p => (validatePlan(answer(p), ctx()).errors || []).join('\n');
  assert.match(errs({ weeks: [{ rpe: 7 }, { rpe: 8 }] }), /needs a deload week/);
  assert.match(errs({ weeks: [{ rpe: 11 }, { deload: true }] }), /rpe must be 6-10/);
  assert.match(errs({ weeks: [{ rpe: 5 }, { deload: true }] }), /rpe must be 6-10/);
  assert.match(errs({ weeks: [{ deload: true }] }), /a block runs 2-12/);
  assert.match(errs({ weeks: Array(13).fill({ rpe: 7 }) }), /a block runs 2-12/);
  assert.match(errs({ weeks: [7, { deload: true }] }), /weeks\[0\] must be an object/);
  assert.match(errs('five weeks'), /must be an object with a weeks array/);
});

test('RPE is kept in halves; a deload week carries no RPE', () => {
  const r = validatePlan(answer({ weeks: [{ rpe: 7.3 }, { rpe: 8.8 }, { deload: true, rpe: 9 }] }), ctx());
  assert.deepEqual(r.bundle.programmes[0].weeks, [{ rpe: 7.5 }, { rpe: 9 }, { deload: true }]);
});

test('a block with no name takes the plan\'s', () => {
  assert.equal(validatePlan(answer({ weeks: [{ rpe: 8 }, { deload: true }] }), ctx()).bundle.programmes[0].name, 'Push pull');
});

test('the intake\'s block length reaches the payload, bounded', () => {
  const p = n => payload.build({ unit: 'kg', routines: [], workouts: [] }, { handle: 'h', kind: 'create', intake: { goal: 'muscle', daysPerWeek: 3, blockWeeks: n } }).coachProfile.blockWeeks;
  assert.equal(p(5), 5);
  assert.equal(p(40), 12);
  assert.equal(p(1), 2);
  assert.equal(p(undefined), null);
});
