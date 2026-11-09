// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DeloadCard from './DeloadCard.jsx'
import { DEF, useStore } from '../store/useStore.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root, original
const TODAY = '2026-11-09'
const ago = days => new Date(Date.UTC(2026, 10, 9) - days * 86400000).toISOString().slice(0, 10)
const mount = extra => {
  useStore.setState({ S: { ...JSON.parse(JSON.stringify(DEF)), ...extra } })
  act(() => root.render(<DeloadCard />))
}
const button = label => [...host.querySelectorAll('button')].find(b => b.textContent === label)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 9, 12))
  original = useStore.getState().S
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount()); host.remove()
  useStore.setState({ S: original })
  vi.useRealTimers()
})

describe('the deload week card on Today', () => {
  it('is not there before five weeks of training, or with none', () => {
    mount({ workouts: [{ d: ago(34) }] })
    expect(host.textContent).toBe('')
    mount({ workouts: [] })
    expect(host.textContent).toBe('')
  })
  it('offers a deload week after five, and Start begins it today', () => {
    mount({ workouts: [{ d: ago(40) }, { d: ago(2) }] })
    expect(host.textContent).toContain('Time for a deload week')
    expect(host.textContent).toContain('trained for 5 weeks')
    act(() => button('Start deload week').click())
    expect(useStore.getState().S.deloadWeek).toEqual({ start: TODAY })
    expect(host.textContent).toContain('Deload week · day 1 of 7')
  })
  it('Not now puts it off for another five weeks', () => {
    mount({ workouts: [{ d: ago(40) }] })
    act(() => button('Not now').click())
    expect(useStore.getState().S.deloadSkipped).toBe(TODAY)
    expect(host.textContent).toBe('')
  })
  it('counts from the last deload week, and can end one early', () => {
    mount({ workouts: [{ d: ago(200) }], deloadWeek: { start: ago(36) } })
    expect(host.textContent).toContain('since your last deload')
    mount({ workouts: [{ d: ago(200) }], deloadWeek: { start: ago(2) } })
    expect(host.textContent).toContain('day 3 of 7')
    act(() => button('End the deload week').click())
    expect(useStore.getState().S.deloadWeek).toEqual({ start: ago(2), ended: TODAY })
    expect(host.textContent).toBe('')
  })
})
