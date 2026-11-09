import { describe, expect, it } from 'vitest'
import {
  RIR_MAX, STALLS_TO_DELOAD, DELOAD_EVERY_WEEKS, rirOf, decideNext, stepLoad, nextSet,
  daysBetween, deloadDue, inDeloadWeek, deloadWeekPlan,
} from './rir-rules.js'

const range = { repsMin: 8, reps: 12 }
// A session as progression.js readSession reads it.
const session = (reps, rirs = [], ok = true) => ({ reps, rirs, ok })

describe('rirOf', () => {
  it('reads a logged RIR, capping "4+" at 4 and never going below 0', () => {
    expect(rirOf({ rir: 2 })).toBe(2)
    expect(rirOf({ rir: 0 })).toBe(0)
    expect(rirOf({ rir: 7 })).toBe(RIR_MAX)
    expect(rirOf({ rir: -1 })).toBe(0)
    expect(rirOf({ rir: '3' })).toBe(3)
  })
  it('keeps a half step from older data', () => expect(rirOf({ rir: 2.5 })).toBe(2.5))
  it('reads an RPE as 10 - RPE, and a logged RIR wins over an RPE', () => {
    expect(rirOf({ rpe: 8 })).toBe(2)
    expect(rirOf({ rpe: 10 })).toBe(0)
    expect(rirOf({ rpe: 6 })).toBe(4)
    expect(rirOf({ rir: 1, rpe: 6 })).toBe(1)
  })
  it('an unlogged effort is unknown, never 0', () => {
    for (const s of [{}, { rir: null }, { rir: undefined }, { rir: '' }, { rir: 'x' }, null, undefined, 3]) expect(rirOf(s)).toBeNull()
  })
})

describe('decideNext: double progression with RIR', () => {
  it('top of the range in every set with reps in reserve: +1 step, back to the bottom', () => {
    expect(decideNext(session([12, 12, 12], [2, 2, 1]), range)).toEqual({ kind: 'up', reps: 8, reason: 'top-with-reserve' })
  })
  it('top of the range but the last set at failure: the same again', () => {
    expect(decideNext(session([12, 12, 12], [2, 1, 0]), range)).toEqual({ kind: 'repeat', reps: 12, reason: 'top-at-failure' })
  })
  it('failure on an earlier set only still goes up: the last set had reps left', () => {
    expect(decideNext(session([12, 12, 12], [0, 1, 1]), range).kind).toBe('up')
  })
  it('inside the range: +1 rep on the weakest set', () => {
    expect(decideNext(session([10, 9, 9], [2, 1, 1], false), range)).toEqual({ kind: 'climb', reps: 10, reason: 'climb' })
  })
  it('inside the range and every set RIR 3 or more: +2 reps', () => {
    expect(decideNext(session([9, 9, 9], [3, 4, 3], false), range)).toEqual({ kind: 'climb', reps: 11, reason: 'easy' })
  })
  it('one unlogged set is no evidence of an easy session', () => {
    expect(decideNext(session([9, 9, 9], [3, null, 4], false), range).reason).toBe('climb')
    expect(decideNext(session([9, 9, 9], [3, 4], false), range).reason).toBe('climb')
  })
  it('never climbs past the top of the range', () => {
    expect(decideNext(session([11, 11, 11], [4, 4, 4], false), range).reps).toBe(12)
  })
  it('reps above the top count as the top', () => {
    expect(decideNext(session([14, 13, 12], [1, 1, 1]), range).kind).toBe('up')
  })
  it('below the bottom of the range: back to the bottom at the same weight', () => {
    expect(decideNext(session([7, 6, 5], [0, 0, 0], false), range)).toEqual({ kind: 'hold-bottom', reps: 8, reason: 'below-range' })
  })
  it(`stalled ${STALLS_TO_DELOAD} sessions: deload, reps back to the bottom`, () => {
    expect(decideNext(session([9, 9, 8], [0, 0, 0], false), range, { stalls: 2 })).toEqual({ kind: 'deload', reps: 8, reason: 'stalled' })
    expect(decideNext(session([9, 9, 8], [0, 0, 0], false), range, { stalls: 1 }).kind).toBe('climb')
  })
  it('a session at the top beats a stall count: hitting the top is not a stall', () => {
    expect(decideNext(session([12, 12, 12], [1, 1, 1]), range, { stalls: 5 }).kind).toBe('up')
  })
  it('a set not done (0 reps) keeps the session off the top', () => {
    expect(decideNext(session([12, 12, 0], [1, 1, null], false), range).kind).toBe('hold-bottom')
  })
  it('without RIR at all it is plain double progression', () => {
    expect(decideNext(session([12, 12, 12]), range)).toEqual({ kind: 'up', reps: 8, reason: 'top' })
    expect(decideNext(session([10, 9, 9], [], false), range)).toEqual({ kind: 'climb', reps: 10, reason: 'climb' })
    expect(decideNext(session([12, 12, 12], [null, null, null]), range).reason).toBe('top')
  })
  it('a session short of planned sets (ok false) is not at the top even with high reps', () => {
    expect(decideNext(session([12, 12], [1, 1], false), range).kind).toBe('climb')
  })
  it('a range of one number: the top is the bottom', () => {
    expect(decideNext(session([10, 10], [1, 2]), { repsMin: 10, reps: 10 })).toEqual({ kind: 'up', reps: 10, reason: 'top-with-reserve' })
    expect(decideNext(session([9, 9], [1, 1], false), { repsMin: 10, reps: 10 }).kind).toBe('hold-bottom')
  })
  it('a per-side exercise climbs in twos (reps are the total of both sides)', () => {
    const sides = { repsMin: 16, reps: 24 }
    expect(decideNext(session([18, 18], [2, 2], false), sides, { repStep: 2 }).reps).toBe(20)
    expect(decideNext(session([18, 18], [3, 3], false), sides, { repStep: 2 }).reps).toBe(22)
  })
  it('a half-step RIR from older data reads as it is', () => {
    expect(decideNext(session([9, 9], [2.5, 3], false), range).reason).toBe('climb')
    expect(decideNext(session([9, 9], [3.5, 3], false), range).reason).toBe('easy')
  })
  it('copes with an empty or broken session', () => {
    expect(decideNext(null, range).kind).toBe('hold-bottom')
    expect(decideNext({}, range).kind).toBe('hold-bottom')
    expect(decideNext(session([12, 12], [1, 1]), {}).kind).toBe('up')
  })
})

describe('stepLoad', () => {
  it('steps on the grid, both ways', () => {
    expect(stepLoad(60, 1, { step: 2.5 })).toBe(62.5)
    expect(stepLoad(60, -1, { step: 2.5 })).toBe(57.5)
    expect(stepLoad(61, 1, { step: 2.5 })).toBe(62.5)        // snapped first: 61 reads as 60
    expect(stepLoad(60, 0, { step: 2.5 })).toBe(60)
  })
  it('in pounds, whatever the step', () => {
    expect(stepLoad(135, 1, { step: 5 })).toBe(140)
    expect(stepLoad(22.5, 1, { step: 1.25 })).toBe(23.75)
  })
  it('never below 0 or the empty bar', () => {
    expect(stepLoad(2.5, -1, { step: 2.5 })).toBe(0)
    expect(stepLoad(0, -1, { step: 2.5 })).toBe(0)
    expect(stepLoad(20, -1, { step: 2.5, floor: 20 })).toBe(20)
  })
  it('an assistance machine: harder is less help', () => {
    expect(stepLoad(30, 1, { step: 5, assisted: true })).toBe(25)
    expect(stepLoad(30, -1, { step: 5, assisted: true })).toBe(35)
    expect(stepLoad(5, 1, { step: 5, assisted: true })).toBe(0)
    expect(stepLoad(0, 1, { step: 5, assisted: true })).toBe(0)
  })
  it('your own dumbbells: the next bell up or down, and the heaviest holds', () => {
    const owned = [22, 10, 12, 16, 12]
    expect(stepLoad(12, 1, { owned })).toBe(16)
    expect(stepLoad(12, -1, { owned })).toBe(10)
    expect(stepLoad(13, 1, { owned })).toBe(16)
    expect(stepLoad(22, 1, { owned })).toBe(22)
    expect(stepLoad(10, -1, { owned })).toBe(10)
  })
  it('a missing or nonsense step falls back to 2.5', () => {
    expect(stepLoad(60, 1, {})).toBe(62.5)
    expect(stepLoad(60, 1, { step: 0 })).toBe(62.5)
    expect(stepLoad('60', 1)).toBe(62.5)
  })
})

describe('nextSet: the suggestion for the next row in a workout', () => {
  const load = { step: 2.5 }
  it('a set with 4+ in reserve: the next one +1 step, same reps', () => {
    expect(nextSet({ w: 60, r: 10, rir: 4 }, { w: 60, r: 10 }, range, load)).toEqual({ w: 62.5, r: 10, reason: 'set-easy' })
  })
  it('failure below the range: the next one 1 step lighter', () => {
    expect(nextSet({ w: 60, r: 6, rir: 0 }, { w: 60, r: 10 }, range, load)).toEqual({ w: 57.5, r: 10, reason: 'set-failed-below' })
  })
  it('failure inside the range: same weight, aim for what you got', () => {
    expect(nextSet({ w: 60, r: 9, rir: 0 }, { w: 60, r: 10 }, range, load)).toEqual({ w: 60, r: 9, reason: 'set-failed-in-range' })
  })
  it('on target (RIR 1-3), or failure at or above the next aim: leave it alone', () => {
    for (const rir of [1, 2, 3]) expect(nextSet({ w: 60, r: 10, rir }, { w: 60, r: 10 }, range, load)).toBeNull()
    expect(nextSet({ w: 60, r: 10, rir: 0 }, { w: 60, r: 10 }, range, load)).toBeNull()
  })
  it('no RIR logged: nothing to go on', () => {
    expect(nextSet({ w: 60, r: 4 }, { w: 60, r: 10 }, range, load)).toBeNull()
    expect(nextSet({ w: 60, r: 4, rir: null }, { w: 60, r: 10 }, range, load)).toBeNull()
  })
  it('the next row keeps its own weight as the base (a back-off set stays lighter)', () => {
    expect(nextSet({ w: 100, r: 10, rir: 4 }, { w: 90, r: 10 }, range, load)).toEqual({ w: 92.5, r: 10, reason: 'set-easy' })
  })
  it('bodyweight with no load: easier or harder is reps', () => {
    const bw = { ...load, bodyweight: true }
    expect(nextSet({ w: 0, r: 12, rir: 4 }, { w: 0, r: 12 }, range, bw)).toEqual({ w: 0, r: 13, reason: 'set-easy' })
    expect(nextSet({ w: 0, r: 6, rir: 0 }, { w: 0, r: 10 }, range, bw)).toEqual({ w: 0, r: 6, reason: 'set-failed-below' })
  })
  it('weighted bodyweight (a dip belt) steps its added load like any other', () => {
    expect(nextSet({ w: 10, r: 10, rir: 4 }, { w: 10, r: 10 }, range, { ...load, bodyweight: true })).toEqual({ w: 12.5, r: 10, reason: 'set-easy' })
  })
  it('at the floor or the top of the rack there is nothing to change', () => {
    expect(nextSet({ w: 20, r: 5, rir: 0 }, { w: 20, r: 10 }, range, { ...load, floor: 20 })).toBeNull()
    expect(nextSet({ w: 22, r: 12, rir: 4 }, { w: 22, r: 12 }, range, { owned: [10, 16, 22] })).toBeNull()
  })
  it('an assistance machine: an easy set means less help next', () => {
    expect(nextSet({ w: 30, r: 10, rir: 4 }, { w: 30, r: 10 }, range, { step: 5, assisted: true })).toEqual({ w: 25, r: 10, reason: 'set-easy' })
  })
  it('a per-side set climbs by two', () => {
    expect(nextSet({ w: 0, r: 20, rir: 4 }, { w: 0, r: 20 }, { repsMin: 16, reps: 24 }, { bodyweight: true, repStep: 2 })).toEqual({ w: 0, r: 22, reason: 'set-easy' })
  })
  it('missing rows give nothing', () => {
    expect(nextSet(null, { w: 60, r: 10 }, range, load)).toBeNull()
    expect(nextSet({ w: 60, r: 10, rir: 4 }, null, range, load)).toBeNull()
  })
})

describe('daysBetween', () => {
  it('counts calendar days, across a clock change and a leap day', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)   // UK clocks go forward on the 29th
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)   // and back on the 25th
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2)
    expect(daysBetween('2026-11-09', '2026-11-02')).toBe(-7)
  })
  it('anything that is not a date is null', () => {
    expect(daysBetween('2026-11-09', 'soon')).toBeNull()
    expect(daysBetween(null, '2026-11-09')).toBeNull()
  })
})

describe('deloadDue', () => {
  it(`is due ${DELOAD_EVERY_WEEKS} weeks (exactly 35 days) after the first workout`, () => {
    expect(deloadDue({ today: '2026-11-08', firstWorkout: '2026-10-05' })).toEqual({ due: false, days: 34, from: '2026-10-05' })
    expect(deloadDue({ today: '2026-11-09', firstWorkout: '2026-10-05' })).toEqual({ due: true, days: 35, from: '2026-10-05' })
  })
  it('runs from the latest of the first workout, the last deload week and a skipped offer', () => {
    expect(deloadDue({ today: '2026-11-09', firstWorkout: '2026-01-01', lastDeload: '2026-10-20' }).due).toBe(false)
    expect(deloadDue({ today: '2026-11-09', firstWorkout: '2026-01-01', lastDeload: '2026-09-01', skipped: '2026-11-02' })).toMatchObject({ due: false, from: '2026-11-02' })
  })
  it('takes 4 to 6 weeks, and clamps anything else into that', () => {
    const base = { today: '2026-11-09', firstWorkout: '2026-10-12' }   // 28 days
    expect(deloadDue({ ...base, weeks: 4 }).due).toBe(true)
    expect(deloadDue({ ...base, weeks: 6 }).due).toBe(false)
    expect(deloadDue({ ...base, weeks: 2 }).due).toBe(true)            // read as 4
    expect(deloadDue({ ...base, weeks: 'x' }).due).toBe(false)         // read as 5
  })
  it('nothing to count from: never due', () => {
    expect(deloadDue({ today: '2026-11-09' })).toEqual({ due: false })
    expect(deloadDue({ today: 'nope', firstWorkout: '2026-01-01' })).toEqual({ due: false })
    expect(deloadDue()).toEqual({ due: false })
  })
})

describe('inDeloadWeek', () => {
  it('seven days from its start, the start included', () => {
    expect(inDeloadWeek('2026-11-09', '2026-11-09')).toBe(true)
    expect(inDeloadWeek('2026-11-15', '2026-11-09')).toBe(true)
    expect(inDeloadWeek('2026-11-16', '2026-11-09')).toBe(false)
    expect(inDeloadWeek('2026-11-08', '2026-11-09')).toBe(false)
    expect(inDeloadWeek('2026-11-09', null)).toBe(false)
  })
})

describe('deloadWeekPlan', () => {
  it('about 10 % lighter on the grid, two thirds of the sets', () => {
    expect(deloadWeekPlan({ sets: 3, weight: 100 }, { step: 2.5 })).toEqual({ sets: 2, weight: 90 })
    expect(deloadWeekPlan({ sets: 4, weight: 62.5 }, { step: 2.5 })).toEqual({ sets: 3, weight: 55 })
    expect(deloadWeekPlan({ sets: 5, weight: 60 }, { step: 2.5 })).toEqual({ sets: 3, weight: 52.5 })
  })
  it('always keeps one set', () => {
    expect(deloadWeekPlan({ sets: 1, weight: 50 }, { step: 2.5 }).sets).toBe(1)
    expect(deloadWeekPlan({ sets: 0, weight: 50 }, { step: 2.5 }).sets).toBe(1)
  })
  it('never under the bar', () => expect(deloadWeekPlan({ sets: 3, weight: 20 }, { step: 2.5, floor: 20 }).weight).toBe(20))
  it('bodyweight keeps no load and only loses sets', () => expect(deloadWeekPlan({ sets: 3, weight: 0 })).toEqual({ sets: 2, weight: 0 }))
  it('an assistance machine gets more help', () => expect(deloadWeekPlan({ sets: 3, weight: 30 }, { step: 5, assisted: true })).toEqual({ sets: 2, weight: 35 }))
  it('your own dumbbells: the heaviest at or under 90 %, else the lightest you own', () => {
    expect(deloadWeekPlan({ sets: 3, weight: 20 }, { owned: [10, 12, 16, 18, 20] }).weight).toBe(18)
    expect(deloadWeekPlan({ sets: 3, weight: 10 }, { owned: [10, 12] }).weight).toBe(10)
  })
})
