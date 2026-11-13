// My Gym: a plan the Coach builds comes with its training block (api/coach/core/validate.js puts it
// in the plan file); applying the plan brings the block in, never started, and Undo takes it away.
import { describe, expect, it } from 'vitest'
import { applyCreatedPlan, revertLast, profileLines } from './coach.js'

const state = () => ({ unit: 'kg', lang: 'en', customEx: [], workouts: [], bodyweight: [], exWeights: {}, dayPlan: {}, routines: [], week: {}, programmes: {} })
const bundle = {
  opengym_plan: 1, name: 'Coach plan', summary: 'two days',
  week: { 1: 'x1', 4: 'x2' },
  routines: [
    { id: 'x1', name: 'Push', ex: [{ id: '0025', sets: 3, reps: 12, repsMin: 8, prog: 'double', inc: 2.5, mode: 'reps', why: 'w' }] },
    { id: 'x2', name: 'Pull', ex: [{ id: '0025', sets: 3, reps: 10, repsMin: 6, prog: 'double', inc: 2.5, mode: 'reps', why: 'w' }] },
  ],
  customEx: [],
  programme_fmt: 1,
  programmes: [{ name: 'Block one', weeks: [{ rpe: 7 }, { rpe: 8 }, { rpe: 9 }, { deload: true }], days: { 1: ['x1'], 4: ['x2'] } }],
}

describe('a Coach plan with its training block', () => {
  it('brings the block in over the new routines, never started', () => {
    const s = state()
    applyCreatedPlan(s, { id: 'p1', kind: 'create', bundle }, { schedule: true })
    const blocks = Object.values(s.programmes)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].name).toBe('Block one')
    expect(blocks[0].weeks).toEqual([{ rpe: 7 }, { rpe: 8 }, { rpe: 9 }, { deload: true }])
    const ids = s.routines.map(r => r.id)
    expect(Object.values(blocks[0].days).flat().every(id => ids.includes(id))).toBe(true)
    expect(s.programme?.id).toBeUndefined()
  })
  it('Undo takes the block away with the routines', () => {
    const s = state()
    applyCreatedPlan(s, { id: 'p1', kind: 'create', bundle }, { schedule: true })
    expect(revertLast(s)).toBe(true)
    expect(Object.keys(s.programmes)).toEqual([])
    expect(s.routines).toEqual([])
  })
  it('a plan without a block applies as it always did', () => {
    const s = state()
    const { programme_fmt, programmes, ...plain } = bundle
    applyCreatedPlan(s, { id: 'p1', kind: 'create', bundle: plain }, { schedule: true })
    expect(Object.keys(s.programmes)).toEqual([])
    expect(s.routines).toHaveLength(2)
  })
  it('the intake summary names the block length', () => {
    expect(profileLines({ goal: 'muscle', daysPerWeek: 3, sessionMin: 60, blockWeeks: 5 })).toContain('5-week training block')
  })
})
