// @vitest-environment happy-dom
// My Gym's deload week, end to end through buildSessionEntries: a session built inside the week the
// profile started is about 10 % lighter with two thirds of its work sets, and stays out of
// progression. The rules themselves are pinned in rir-rules.test.js.
import { describe, expect, it } from 'vitest'
import { buildSessionEntries } from './session-start.js'
import { DEF } from '../store/useStore.js'

const BENCH = '0025'   // barbell bench press
const routine = { id: 'r1', name: 'Push', ex: [{ id: BENCH, sets: 3, reps: 12, repsMin: 8, weight: 100, prog: 'double', inc: 2.5 }] }
const state = (deloadWeek, d = '2026-11-10') => ({
  ...JSON.parse(JSON.stringify(DEF)), unit: 'kg', routines: [routine], workouts: [],
  deloadWeek, active: { id: 'a', d, start: 1, cur: 0, entries: [] },
})
const work = e => e.sets.filter(s => !s.warmup && s.phase !== 'warmup')

describe('a session built in the deload week', () => {
  it('is about 10 % lighter, has two thirds of the sets and does not count', () => {
    const [e] = buildSessionEntries(state({ start: '2026-11-09' }), routine)
    expect(work(e).map(s => s.w)).toEqual([90, 90])
    expect(e.target).toMatchObject({ weight: 90, sets: 2 })
    expect(e.plan.kind).toBe('deload')
    expect(e.noProg).toBe(true)
  })
  it('outside the week, or after it was ended, is the normal session', () => {
    for (const st of [state(null), state({ start: '2026-10-01' }), state({ start: '2026-11-09', ended: '2026-11-10' })]) {
      const [e] = buildSessionEntries(st, routine)
      expect(work(e).map(s => s.w)).toEqual([100, 100, 100])
      expect(e.noProg).toBeUndefined()
    }
  })
  it('a routine kept out of progression already is left as it is', () => {
    const rehab = { ...routine, excludeFromProgression: true }
    const [e] = buildSessionEntries(state({ start: '2026-11-09' }), rehab)
    expect(work(e)).toHaveLength(3)
  })
})
