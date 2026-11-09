// @vitest-environment happy-dom
// The tab bar is fixed on screen and re-renders on every store write — once a second for the
// whole of a rest. Its buttons must survive that: a component declared inside the render body is
// a new function each time, which React reads as a different type and rebuilds from scratch.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TabBar from './TabBar.jsx'
import { DEF, useStore } from '../store/useStore.js'

const where = vi.hoisted(() => ({ loc: { pathname: '/home' } }))
vi.mock('react-router-dom', () => ({
  useNavigate: () => () => {},
  useLocation: () => where.loc,
}))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let host, root, originalS, originalUser

beforeEach(() => {
  const store = useStore.getState()
  originalS = store.S
  originalUser = store.user
  useStore.setState({ S: JSON.parse(JSON.stringify(DEF)), user: { id: 1, name: 'test' } })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  useStore.setState({ S: originalS, user: originalUser })
  where.loc = { pathname: '/home' }
})

// The four tabs only; the resume row, when there is one, is a button too but not a tab.
const tabs = () => [...host.querySelectorAll('#tabbar > button:not(.resume)')]
const resume = () => host.querySelector('#tabbar .resume')

describe('the tab bar across a store write', () => {
  it('keeps the very same buttons instead of rebuilding them every tick', () => {
    act(() => { root.render(<TabBar />) })
    const before = tabs()
    expect(before).toHaveLength(4)

    // What a rest does once a second: S is replaced, so everything reading it re-renders.
    act(() => { useStore.getState().update(s => { s.restSec = 91 }, false) })

    const after = tabs()
    expect(after).toHaveLength(before.length)
    after.forEach((el, i) => expect(el).toBe(before[i]))
  })

  it('still lights the tab for the route it is on, and follows a change of state', () => {
    act(() => { root.render(<TabBar />) })
    expect(tabs().map(b => b.className)).toEqual(['on', '', '', ''])
    expect(tabs()[0].getAttribute('aria-current')).toBe('page')
    expect(resume()).toBeNull()

    act(() => { useStore.getState().update(s => { s.active = { id: 'a', name: 'Push', entries: [], cur: 0 } }, false) })
    expect(resume()).not.toBeNull()
    expect(tabs()[0].className).toBe('on')
  })
})

// Settings → "Show connection status" off (#369, #330): a stuck sync shows as a dot on Profile, the
// tab Settings lives under, and the tab's name says it.
describe('the connection dot on Profile', () => {
  const profile = () => tabs()[3]
  it('is there for a sync problem only while the banner is switched off', () => {
    const original = useStore.getState().sync
    try {
      useStore.setState({ sync: { status: 'error', lastError: { status: 502 }, pending: true } })
      act(() => { root.render(<TabBar />) })
      expect(profile().querySelector('.tab-dot')).toBeNull()
      act(() => { useStore.getState().update(s => { s.connStatus = false }, false) })
      expect(profile().querySelector('.tab-dot')).not.toBeNull()
      expect(profile().getAttribute('aria-label')).toBe('Profile, Connection problem')
      act(() => { useStore.setState({ sync: { status: 'ok', lastError: null, pending: false } }) })
      expect(profile().querySelector('.tab-dot')).toBeNull()
      expect(profile().getAttribute('aria-label')).toBeNull()
    } finally { useStore.setState({ sync: original }) }
  })
})

// My Gym's four tabs: one icon per concept, every tab named under its icon, no Start button.
describe('the tab icons and labels', () => {
  const icon = el => el.querySelector('svg')?.getAttribute('data-icon')
  const label = el => el.querySelector('span:last-child').textContent
  it('labels every tab and uses one icon per concept', () => {
    act(() => { root.render(<TabBar />) })
    expect(tabs().map(icon)).toEqual(['sun', 'list', 'chartLine', 'personCircle'])
    expect(tabs().map(label)).toEqual(['Today', 'Routines', 'Progress', 'Profile'])
  })
})

// A session you stepped away from: a row over the tabs that goes back to it.
describe('the resume row', () => {
  it('shows a minimized session’s name and running time, and is named Resume', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(2026, 9, 5, 18, 0, 0))
      act(() => { useStore.getState().update(s => { s.active = { id: 'a', name: 'Push A', entries: [], cur: 0, start: Date.now() - 754_000 } }, false) })
      act(() => { root.render(<TabBar />) })
      const row = resume()
      expect(row.querySelector('.resume-name').textContent).toBe('Push A')
      expect(row.querySelector('.resume-time').textContent).toBe('12:34')
      expect(row.getAttribute('aria-label')).toBe('Resume, Push A')
      expect(document.body.classList.contains('has-resume')).toBe(true)
      act(() => { vi.advanceTimersByTime(2000) })
      expect(row.querySelector('.resume-time').textContent).toBe('12:36')
      expect(resume()).toBe(row)   // the same button, only its text ticks

      // a past workout being edited has no clock running
      act(() => { useStore.getState().update(s => { s.active.editingWorkoutId = 'w1' }, false) })
      expect(resume().querySelector('.resume-time')).toBeNull()
      expect(resume().querySelector('.resume-go').textContent).toBe('Edit workout')
    } finally { vi.useRealTimers() }
  })

  it('is not there on the workout screen itself, and takes its room back when it goes', () => {
    act(() => { useStore.getState().update(s => { s.active = { id: 'a', name: 'Push', entries: [], cur: 0 } }, false) })
    where.loc = { pathname: '/workout' }
    act(() => { root.render(<TabBar />) })
    expect(resume()).toBeNull()
    expect(document.body.classList.contains('has-resume')).toBe(false)
  })
})

// A screen without a tab of its own keeps the tab it was opened from lit. Check-in, Progress photos
// and Body measurements lit none: Measurements moved under Stats (75a3b750) and the bar never heard.
describe('the tab a screen without its own lights', () => {
  const lit = () => tabs().filter(b => b.classList.contains('on')).map(b => b.textContent)
  it.each([
    ['/history', 'Progress'], ['/structural-balance', 'Progress'], ['/progress-photos', 'Progress'], ['/measurements', 'Progress'],
    ['/settings', 'Profile'], ['/settings/units', 'Profile'], ['/checkin', 'Today'], ['/library', 'Routines'], ['/muscles', 'Routines'],
  ])('%s lights %s', (pathname, tab) => {
    where.loc = { pathname }
    act(() => { root.render(<TabBar />) })
    expect(lit()).toEqual([tab])
  })

  it('Muscles opened from Stats lights Progress, the way its back button goes', () => {
    where.loc = { pathname: '/muscles', state: { from: '/stats' } }
    act(() => { root.render(<TabBar />) })
    expect(lit()).toEqual(['Progress'])
  })
})
