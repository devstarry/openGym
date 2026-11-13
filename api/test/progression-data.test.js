import test from 'node:test';
import assert from 'node:assert/strict';
import { tempData } from './helpers.mjs';

tempData();
const { progressionOf, sessionsOf, stallsOf, rangeOf, ruleOf, deloadOf, cleanVolume } = await import('../coach/core/progression-data.js');
const payload = await import('../coach/core/payload.js');

const BENCH = '0025';
const plan = (ex = {}, extra = {}) => ({
  unit: 'kg', routines: [{ id: 'r1', name: 'Push', ex: [{ id: BENCH, sets: 3, reps: 12, repsMin: 8, weight: 60, inc: 2.5, ...ex }] }], workouts: [], ...extra,
});
// [date, weight, [reps, rir], ...]
const session = (d, w, ...sets) => ({ d, entries: [{ id: BENCH, target: { sets: 3, reps: 12 }, sets: sets.map(([r, rir]) => ({ w, r, done: r > 0, ...(rir == null ? {} : { rir }) })) }] });

test('the rule is the exercise\'s, else the routine\'s, else the profile\'s, double by default', () => {
  assert.equal(ruleOf({}, {}, {}), 'double');
  assert.equal(ruleOf({ progDefault: 'linear' }, {}, {}), 'linear');
  assert.equal(ruleOf({ progDefault: 'linear' }, { prog: 'greyskull' }, {}), 'greyskull');
  assert.equal(ruleOf({ progDefault: 'linear' }, { prog: 'greyskull' }, { prog: 'double' }), 'double');
  assert.equal(ruleOf({ progDefault: 'nonsense' }, {}, {}), 'double');
});

test('the rep range: the set range, or two under the top', () => {
  assert.deepEqual(rangeOf({ reps: 12, repsMin: 8 }), { repsMin: 8, reps: 12 });
  assert.deepEqual(rangeOf({ reps: 10 }), { repsMin: 8, reps: 10 });
  assert.deepEqual(rangeOf({ reps: 2 }), { repsMin: 1, reps: 2 });
  assert.deepEqual(rangeOf({ reps: 10, repsMin: 12 }), { repsMin: 8, reps: 10 });
});

test('sessions: planned work sets only, a set not done is 0, warm-ups and kept-out sessions left out', () => {
  const S = plan({}, { workouts: [
    { d: '2026-11-01', entries: [{ id: BENCH, target: { sets: 2 }, sets: [{ w: 30, r: 10, done: true, warmup: true }, { w: 60, r: 10, done: true, rir: 2 }, { w: 60, r: 0, done: false }, { w: 60, r: 12, done: true }] }] },
    { d: '2026-11-03', entries: [{ id: BENCH, noProg: true, sets: [{ w: 54, r: 10, done: true }] }] },
    { d: '2026-11-05', excludeFromProgression: true, entries: [{ id: BENCH, sets: [{ w: 54, r: 10, done: true }] }] },
  ] });
  assert.deepEqual(sessionsOf(S, BENCH), [{ d: '2026-11-01', reps: [10, 0], rirs: [2, null], weight: 60, enough: true }]);
});

test('stalls are counted the way the engine counts them', () => {
  const r = { repsMin: 8, reps: 12 };
  const s = (weight, reps) => ({ weight, reps, enough: true });
  assert.equal(stallsOf([s(60, [9, 9, 8]), s(60, [9, 9, 8])], r), 2);
  assert.equal(stallsOf([s(60, [9, 9, 8]), s(60, [10, 9, 9])], r), 0, 'more reps at the same weight is progress');
  assert.equal(stallsOf([s(57.5, [9, 9, 8]), s(60, [9, 9, 8])], r), 1, 'a change of weight ends the streak');
  assert.equal(stallsOf([s(60, [12, 12, 12])], r), 0);
  assert.equal(stallsOf([], r), 0);
});

test('the progression picture names the rule, range, step, last session and the engine\'s next decision', () => {
  const S = plan({}, { workouts: [session('2026-11-02', 60, [12, 2], [12, 2], [12, 1])] });
  const [p] = progressionOf(S);
  assert.equal(p.id, BENCH);
  assert.equal(p.rule, 'double');
  assert.deepEqual(p.range, { repsMin: 8, reps: 12 });
  assert.equal(p.step, 2.5);
  assert.equal(p.weight, 60);
  assert.deepEqual(p.last, { d: '2026-11-02', reps: [12, 12, 12], rir: [2, 2, 1] });
  assert.equal(p.stalls, 0);
  assert.deepEqual(p.next, { kind: 'up', reps: 8, reason: 'top-with-reserve' });
});

test('two stalled sessions: the next decision is a deload', () => {
  const S = plan({}, { workouts: [session('2026-11-02', 60, [9, 0], [8, 0], [7, 0]), session('2026-11-05', 60, [9, 0], [8, 0], [7, 0])] });
  const [p] = progressionOf(S);
  assert.equal(p.stalls, 2);
  assert.equal(p.next.kind, 'deload');
});

test('no RIR logged: no rir field, plain double progression', () => {
  const [p] = progressionOf(plan({}, { workouts: [session('2026-11-02', 60, [10], [9], [9])] }));
  assert.equal(p.last.rir, undefined);
  assert.deepEqual(p.next, { kind: 'climb', reps: 10, reason: 'climb' });
});

test('nothing logged yet: the plan\'s weight, no last session, no decision', () => {
  const [p] = progressionOf(plan());
  assert.equal(p.weight, 60);
  assert.equal(p.last, undefined);
  assert.equal(p.next, undefined);
});

test('another rule gets no double-progression decision; timed and cardio exercises are left out; an exercise twice is listed once', () => {
  const S = { unit: 'kg', workouts: [], routines: [
    { id: 'a', prog: 'linear', ex: [{ id: BENCH, sets: 3, reps: 5, weight: 80 }, { id: 'plank', mode: 'time', sets: 3, sec: 45 }] },
    { id: 'b', ex: [{ id: BENCH, sets: 3, reps: 12 }, { id: 'run', mode: 'cardio', min: 20 }] },
  ] };
  const out = progressionOf(S);
  assert.equal(out.length, 1);
  assert.equal(out[0].rule, 'linear');
  assert.equal(out[0].range, undefined);
});

test('the deload picture: only real dates', () => {
  assert.equal(deloadOf({}), null);
  assert.deepEqual(deloadOf({ deloadWeek: { start: '2026-10-01', ended: '2026-10-04' }, deloadSkipped: '2026-11-01' }), { lastWeek: '2026-10-01', endedEarly: '2026-10-04', skipped: '2026-11-01' });
  assert.equal(deloadOf({ deloadWeek: { start: 'soon' } }), null);
});

test('the volume table from the app is bounded and typed', () => {
  assert.deepEqual(cleanVolume([{ slug: 'chest', name: 'Chest', sets: 7.43, lo: 10, hi: 20, status: 'below' }, { slug: 5 }, { slug: 'abs', sets: 'x', lo: 6, hi: 16 }, null]),
    [{ muscle: 'chest', sets: 7.4, target: [10, 20], status: 'below' }]);
  assert.deepEqual(cleanVolume('nope'), []);
  assert.equal(cleanVolume(Array(50).fill({ slug: 'chest', sets: 1, lo: 1, hi: 2 })).length, 24);
});

test('a plan, a review and a question carry progression, deload and volume; a debrief does not', () => {
  const S = plan({}, { workouts: [session('2026-11-02', 60, [12, 2], [12, 2], [12, 1])], deloadWeek: { start: '2026-10-01' } });
  const volume = [{ slug: 'chest', sets: 9, lo: 10, hi: 20, status: 'below' }];
  for (const kind of ['create', 'review', 'ask']) {
    const p = payload.build(S, { handle: 'h', kind, volume, now: Date.parse('2026-11-09T12:00:00Z') });
    assert.equal(p.progression?.[0]?.next?.kind, 'up', kind);
    assert.deepEqual(p.deload, { lastWeek: '2026-10-01' }, kind);
    assert.deepEqual(p.volume, [{ muscle: 'chest', sets: 9, target: [10, 20], status: 'below' }], kind);
  }
  const d = payload.build({ ...S, workouts: [{ id: 'w1', ...session('2026-11-02', 60, [12, 2]) }] }, { handle: 'h', kind: 'debrief', workoutId: 'w1', volume });
  assert.equal(d.progression, undefined);
  assert.equal(d.volume, undefined);
});

test('the effort scale: RIR unless the profile chose otherwise or switched Effort off', () => {
  const meta = S => payload.build({ ...plan(), ...S }, { handle: 'h', kind: 'create' }).meta.effortScale;
  assert.equal(meta({}), 'rir');
  assert.equal(meta({ effort: null }), 'rir');
  assert.equal(meta({ effort: 'none' }), 'none');
  assert.equal(meta({ effort: 'rpe' }), 'rpe');
  assert.equal(meta({ effort: 'rir', modules: { effort: false } }), 'none');
});
