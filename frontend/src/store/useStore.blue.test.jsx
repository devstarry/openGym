// @vitest-environment happy-dom

/* My Gym: a profile saved before blue became the default still said 'lime', openGym's old
   default, so the app came up green. Boot turns it blue once per device; green picked on purpose
   after that stays green. */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api.js', () => ({ api: vi.fn(), setRemoteAuth: vi.fn() }))
vi.mock('./useUI.js', () => ({ useUI: { getState: () => ({ toast: vi.fn() }) } }))

import { api } from '../lib/api.js'
import { useStore, BLUE_DONE } from './useStore.js'

const boot = async () => {
  api.mockImplementation(async path => {
    if (path === '/api/config') return { allow_guest: true }
    if (path === '/api/me') throw Object.assign(new Error('not signed in'), { status: 401 })
    throw new Error('unexpected ' + path)
  })
  useStore.setState({ user: null, ready: false })
  await useStore.getState().boot()
}

beforeEach(() => { localStorage.clear(); api.mockReset() })

describe('the old green accent', () => {
  it('becomes blue on the first boot, and the change is saved', async () => {
    useStore.setState(s => ({ S: { ...s.S, accent: 'lime' } }))
    await boot()
    expect(useStore.getState().S.accent).toBe('sky')
    expect(localStorage.getItem(BLUE_DONE)).toBe('1')
  })
  it('green picked on purpose afterwards stays green', async () => {
    localStorage.setItem(BLUE_DONE, '1')
    useStore.setState(s => ({ S: { ...s.S, accent: 'lime' } }))
    await boot()
    expect(useStore.getState().S.accent).toBe('lime')
  })
  it('any other colour is left alone', async () => {
    useStore.setState(s => ({ S: { ...s.S, accent: 'orange' } }))
    await boot()
    expect(useStore.getState().S.accent).toBe('orange')
  })
})
