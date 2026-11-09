import { describe, it, expect } from 'vitest'
import { baseLang, derivePack, _setLangState, exerciseNameClass } from './i18n-core.js'

describe('baseLang', () => {
  it('leaves every other language as itself', () => {
    expect(baseLang('en')).toBe('en')
    expect(baseLang('nonsense')).toBe('nonsense')
  })
})

describe('derivePack', () => {
  it('returns the pack untouched for a language that is not derived', () => {
    const pack = { a: 'Gesäß' }
    expect(derivePack('en', pack)).toBe(pack)
  })
})

// EXDB stores English names lower-case and the UI title-cases them with CSS.
describe('exerciseNameClass', () => {
  const bench = { id: '0025', n: 'barbell bench press' }

  it('title-cases only while the English fallback is showing', () => {
    _setLangState('en', {}, null, null)
    expect(exerciseNameClass(bench)).toBe('capitalize')
  })
})
