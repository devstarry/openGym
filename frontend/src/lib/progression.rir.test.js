// Double progression read with RIR, end to end through nextPrescription (the rules themselves are
// pinned in rir-rules.test.js): a saved history in, the next session's weight and reps out.
import { describe, expect, it } from 'vitest'
import { nextPrescription, readSession, DELOAD_AFTER } from './progression.js'
import { STALLS_TO_DELOAD } from './rir-rules.js'

const BENCH = '0025'   // barbell bench press
const plan = { sets: 3, reps: 12, repsMin: 8 }
const cfg = (extra = {}) => ({ id: BENCH, ...plan, weight: 60, prog: 'double', inc: 2.5, ...extra })
// Sessions as [weight, [reps, rir], ...]; a rir of undefined is "not logged".
const hist = (...sessions) => ({
  unit: 'kg',
  workouts: sessions.map(([w, ...sets], i) => ({
    d: `2026-10-${String(i + 1).padStart(2, '0')}`,
    entries: [{ id: BENCH, target: { ...plan, weight: w }, sets: sets.map(([r, rir]) => ({ w, r, done: true, ...(rir === undefined ? {} : { rir }) })) }],
  })),
})

describe('readSession', () => {
  it('reads each planned set\'s RIR, null where none was logged or the set was not done', () => {
    const entry = { id: BENCH, target: plan, sets: [{ w: 60, r: 10, done: true, rir: 2 }, { w: 60, r: 9, done: true }, { w: 60, r: 0, done: false, rir: 1 }] }
    expect(readSession(entry).rirs).toEqual([2, null, null])
  })
  it('reads an RPE as RIR and ignores warm-ups', () => {
    const entry = { id: BENCH, target: plan, sets: [{ w: 30, r: 10, done: true, warmup: true, rir: 4 }, { w: 60, r: 10, done: true, rpe: 8 }] }
    expect(readSession(entry).rirs).toEqual([2])
  })
})

describe('nextPrescription under double progression with RIR', () => {
  it(`deloads after ${STALLS_TO_DELOAD} stalled sessions`, () => expect(DELOAD_AFTER.double).toBe(2))

  it('top of the range with reps to spare: +2.5 kg, back to 8', () => {
    const p = nextPrescription(hist([60, [12, 2], [12, 2], [12, 1]]), cfg())
    expect(p).toMatchObject({ kind: 'up', weight: 62.5, reps: 8 })
    expect(p.why[0]).toMatch(/with reps to spare/)
  })
  it('top of the range but the last set to failure: the same again', () => {
    const p = nextPrescription(hist([60, [12, 1], [12, 1], [12, 0]]), cfg())
    expect(p).toMatchObject({ kind: 'hold', weight: 60, reps: 12 })
    expect(p.why[0]).toMatch(/to failure/)
  })
  it('inside the range: +1 rep', () => {
    expect(nextPrescription(hist([60, [10, 2], [10, 1], [9, 1]]), cfg())).toMatchObject({ kind: 'hold', weight: 60, reps: 10 })
  })
  it('inside the range and too easy: +2 reps', () => {
    const p = nextPrescription(hist([60, [9, 3], [9, 4], [9, 3]]), cfg())
    expect(p).toMatchObject({ kind: 'hold', weight: 60, reps: 11 })
    expect(p.why[0]).toMatch(/Plenty left/)
  })
  it('no RIR logged: plain double progression', () => {
    expect(nextPrescription(hist([60, [12], [12], [12]]), cfg())).toMatchObject({ kind: 'up', weight: 62.5, reps: 8 })
    expect(nextPrescription(hist([60, [9], [9], [9]]), cfg())).toMatchObject({ kind: 'hold', weight: 60, reps: 10 })
  })
  it('one stalled session holds; the second deloads', () => {
    const one = nextPrescription(hist([60, [9, 0], [8, 0], [7, 0]]), cfg())
    expect(one.kind).toBe('hold')
    const two = nextPrescription(hist([60, [9, 0], [8, 0], [7, 0]], [60, [9, 0], [8, 0], [7, 0]]), cfg())
    expect(two.kind).toBe('deload')
    expect(two.weight).toBeLessThan(60)
  })
  it('more reps than before at the same weight is progress, not a stall', () => {
    const p = nextPrescription(hist([60, [9, 0], [8, 0], [7, 0]], [60, [9, 1], [9, 1], [8, 0]]), cfg())
    expect(p.kind).toBe('hold')
  })
})
