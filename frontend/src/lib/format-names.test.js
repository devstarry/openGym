import { describe, expect, it } from 'vitest'
import { exerciseNameText } from './format.js'

// A toast, a dialog title, the timed-set label and the Stats picker show an exercise name as
// plain text, with no element to carry the CSS title-casing. They have to come out cased the way
// the same name reads in the list next to them.
describe('exerciseNameText', () => {
  const bench = { id: '0025', n: 'barbell bench press' }
  const custom = { id: 'custom-1', n: 'my own press' }

  it('title-cases an English name and a custom one', () => {
    expect(exerciseNameText(bench)).toBe('Barbell Bench Press')
    expect(exerciseNameText(custom)).toBe('My Own Press')
  })
})

// QA 1.3.9: the accent swatches' screen-reader names were the internal keys ("lime", "sky").
describe('ACCENT_NAMES', () => {
  it('names every accent', async () => {
    const { ACCENTS, ACCENT_NAMES } = await import('./format.js')
    expect(Object.keys(ACCENT_NAMES).sort()).toEqual(Object.keys(ACCENTS).sort())
  })
})
