// @vitest-environment happy-dom
// My Gym's weekly review: the volume table the Coach was given is shown on its card and kept with
// its log entry, so the history shows the numbers it read.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { VolumeTable } from './CoachChat.jsx'
import { applyChangeSet, recordDismissal } from '../lib/coach.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host) })
afterEach(() => { act(() => root.unmount()); host.remove() })

const rows = [
  { muscle: 'chest', sets: 7, target: [10, 20], status: 'below' },
  { muscle: 'quadriceps', sets: 14, target: [8, 18], status: 'in' },
  { muscle: 'biceps', sets: 21.4, target: [8, 18], status: 'above' },
]

describe('the volume table on a review', () => {
  it('names each muscle with its sets, its range and where it stands', () => {
    act(() => root.render(<VolumeTable rows={rows} />))
    const lines = [...host.querySelectorAll('.vol-row')].map(r => r.textContent)
    expect(lines).toEqual(['Chest7 / 10–20Under', 'Quads14 / 8–18In range', 'Biceps21.4 / 8–18Over'])
    expect(host.querySelector('.ins-h').textContent).toContain('Weekly sets per muscle')
  })
  it('draws nothing without a table (a review from before, or a scheduled one with no app)', () => {
    for (const r of [undefined, null, [], [{ muscle: 'chest' }]]) {
      act(() => root.render(<VolumeTable rows={r} />))
      expect(host.textContent).toBe('')
    }
  })
})

describe('the table stays with the review in the log', () => {
  const S = () => ({ unit: 'kg', routines: [{ id: 'r1', name: 'A', ex: [{ id: '0025', sets: 3, reps: 10, mode: 'reps' }] }], week: {}, workouts: [] })
  const p = { id: 'p1', kind: 'review', summary: 's', volume: rows, changes: [{ id: 'c1', type: 'sets', target: { routineId: 'r1', exId: '0025' }, before: 3, after: 4, why: 'chest' }] }
  it('when applied', () => {
    const s = S()
    applyChangeSet(s, p, ['c1'])
    expect(s.coach.log.at(-1).volume).toEqual(rows)
  })
  it('when turned down', () => {
    const s = S()
    recordDismissal(s, p)
    expect(s.coach.log.at(-1).volume).toEqual(rows)
  })
  it('a review without one logs none', () => {
    const s = S()
    applyChangeSet(s, { ...p, volume: undefined }, ['c1'])
    expect('volume' in s.coach.log.at(-1)).toBe(false)
  })
})
