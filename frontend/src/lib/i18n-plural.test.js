import { describe, it, expect, afterEach } from 'vitest'
import { tn, _setLangState } from './i18n-core.js'

describe('tn() — plural forms from the pack', () => {
  afterEach(() => _setLangState('en', {}, null, null))

  it('falls back to the English two-form split with no pack', () => {
    _setLangState('en', {}, null, null)
    expect(tn('{0} exercise', '{0} exercises', 1)).toBe('1 exercise')
    expect(tn('{0} exercise', '{0} exercises', 2)).toBe('2 exercises')
    expect(tn('{0} exercise', '{0} exercises', 0)).toBe('0 exercises')
  })
})
