import { describe, expect, test } from 'vitest'
import { weeklyMuscleSets, recentMuscleSets, targetOf, statusOf, mostRoom, withTarget, DEFAULT_TARGETS } from './muscle-targets.js'

const BENCH = '0025', SQUAT = '0043'
const TODAY = '2026-10-28'   // a Wednesday
const wk = (d, id, n, extra = {}) => ({ id: d + id, d, start: 1, entries: [{ id, sets: Array.from({ length: n }, () => ({ w: 60, r: 8, done: true })), ...extra }] })

describe('weekly sets per muscle', () => {
  test('counts this week’s working sets, primary 1, supporting 0.4, warm-ups and last week left out', () => {
    const S = { weekStart: 1, workouts: [
      wk('2026-10-26', BENCH, 4),
      wk('2026-10-27', SQUAT, 3),
      wk('2026-10-20', BENCH, 10),
      { id: 'warm', d: '2026-10-27', start: 1, entries: [{ id: BENCH, sets: [{ w: 40, r: 5, done: true, phase: 'warmup' }, { w: 60, r: 8, done: false }] }] },
    ] }
    const rows = Object.fromEntries(weeklyMuscleSets(S, TODAY).map(r => [r.slug, r]))
    expect(rows.chest).toMatchObject({ sets: 4, lo: 10, hi: 20, status: 'below' })
    expect(rows.triceps.sets).toBeCloseTo(1.6)
    expect(rows.quadriceps.sets).toBe(3)
    expect(Object.keys(rows)).toEqual(Object.keys(DEFAULT_TARGETS))
  })
  test('in range and above it', () => {
    expect(statusOf(10, [10, 20])).toBe('in')
    expect(statusOf(20, [10, 20])).toBe('in')
    expect(statusOf(21, [10, 20])).toBe('above')
    expect(statusOf(9.6, [10, 20])).toBe('below')
  })
  test('your own range wins, a broken one falls back to the default', () => {
    expect(targetOf({ muscleTargets: { chest: [12, 16] } }, 'chest')).toEqual([12, 16])
    expect(targetOf({ muscleTargets: { chest: [16, 12] } }, 'chest')).toEqual([10, 20])
    expect(targetOf({}, 'nope')).toBe(null)
  })
  test('setting a range: put in order, and the default stored as no override', () => {
    expect(withTarget({}, 'chest', [18, 12])).toEqual({ chest: [12, 18] })
    expect(withTarget({ chest: [12, 18] }, 'chest', [10, 20])).toEqual({})
    expect(withTarget({ chest: [12, 18] }, 'chest', null)).toEqual({})
  })
  test('the most room is the muscle furthest under its low end, by share', () => {
    const rows = [{ slug: 'a', sets: 0, lo: 4, status: 'below' }, { slug: 'b', sets: 5, lo: 10, status: 'below' }, { slug: 'c', sets: 30, lo: 10, status: 'above' }]
    expect(mostRoom(rows).slug).toBe('a')
    expect(mostRoom([{ slug: 'c', status: 'in' }])).toBe(null)
  })
})

// The table a weekly review reads (My Gym's AI Coach): the last 7 days, not the calendar week, so a
// review on a Monday is not looking at an empty week.
describe('recent sets per muscle', () => {
  const BENCH = '0025'   // barbell bench press: chest
  const day = (d, n) => ({ d, entries: [{ id: BENCH, sets: Array.from({ length: n }, () => ({ w: 60, r: 8, done: true })) }] })
  const chest = rows => rows.find(r => r.slug === 'chest')
  test('counts the last seven days, today included, and nothing older or newer', () => {
    const S = { workouts: [day('2026-11-02', 5), day('2026-11-03', 3), day('2026-11-09', 4), day('2026-11-10', 9)] }
    expect(chest(recentMuscleSets(S, '2026-11-09')).sets).toBe(7)
    expect(chest(recentMuscleSets(S, '2026-11-09', 8)).sets).toBe(12)
  })
  test('carries the target range and the status, like the weekly table', () => {
    const r = chest(recentMuscleSets({ workouts: [day('2026-11-09', 4)], muscleTargets: { chest: [6, 12] } }, '2026-11-09'))
    expect(r).toMatchObject({ slug: 'chest', sets: 4, lo: 6, hi: 12, status: 'below' })
  })
  test('crosses a clock change by calendar days', () => {
    const S = { workouts: [day('2026-10-20', 2), day('2026-10-21', 3)] }
    expect(chest(recentMuscleSets(S, '2026-10-27')).sets).toBe(3)   // UK clocks went back on the 25th
  })
})
