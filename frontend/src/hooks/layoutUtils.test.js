import { describe, expect, it } from 'vitest'
import { reconcileLayout, DEFAULT_LAYOUT, COLS, collapseItem, expandItem } from './layoutUtils.js'

describe('reconcileLayout', () => {
  it('returns saved items unchanged when every registry id is already present', () => {
    const saved = [
      { i: 'ultrasonic', x: 0, y: 0, w: 6, h: 10 },
      { i: 'pir', x: 6, y: 0, w: 6, h: 6 },
    ]
    const result = reconcileLayout(saved, ['ultrasonic', 'pir'])
    expect(result).toEqual(saved)
  })

  it('appends a default-position entry for a known id missing from saved data', () => {
    const result = reconcileLayout([], ['ultrasonic'])
    expect(result).toEqual([{ i: 'ultrasonic', ...DEFAULT_LAYOUT.ultrasonic }])
  })

  it('appends every known registry id from DEFAULT_LAYOUT when saved data is empty', () => {
    const ids = ['ultrasonic', 'pir', 'joystick', 'gy87', 'mpr121']
    const result = reconcileLayout([], ids)
    expect(result.map((item) => item.i).sort()).toEqual([...ids].sort())
    for (const item of result) {
      expect(item).toEqual({ i: item.i, ...DEFAULT_LAYOUT[item.i] })
    }
  })

  it('places an id with no DEFAULT_LAYOUT entry below the lowest existing item, at full column width fallback', () => {
    const saved = [{ i: 'ultrasonic', x: 0, y: 0, w: 4, h: 8 }]
    const result = reconcileLayout(saved, ['ultrasonic', 'brand-new-sensor'])
    const appended = result.find((item) => item.i === 'brand-new-sensor')
    expect(appended).toEqual({ i: 'brand-new-sensor', x: 0, y: 8, w: 4, h: 8 })
  })

  it('stacks two unknown appended ids below each other, not overlapping', () => {
    const result = reconcileLayout([], ['brand-new-a', 'brand-new-b'])
    expect(result).toEqual([
      { i: 'brand-new-a', x: 0, y: 0, w: 4, h: 8 },
      { i: 'brand-new-b', x: 0, y: 8, w: 4, h: 8 },
    ])
  })

  it('de-dupes saved items sharing the same id, keeping the first occurrence', () => {
    const saved = [
      { i: 'ultrasonic', x: 0, y: 0, w: 4, h: 8 },
      { i: 'ultrasonic', x: 5, y: 5, w: 4, h: 8 },
    ]
    const result = reconcileLayout(saved, ['ultrasonic'])
    expect(result).toEqual([{ i: 'ultrasonic', x: 0, y: 0, w: 4, h: 8 }])
  })
})

describe('COLS', () => {
  it('is 12', () => {
    expect(COLS).toBe(12)
  })
})

describe('expandItem', () => {
  it('sets w to COLS and x to 0, saving the prior position/size as prevLayout', () => {
    const items = [{ i: 'ultrasonic', x: 4, y: 2, w: 4, h: 8 }]
    const result = expandItem(items, 'ultrasonic')
    expect(result).toEqual([
      { i: 'ultrasonic', x: 0, y: 2, w: COLS, h: 8, prevLayout: { x: 4, y: 2, w: 4, h: 8 } },
    ])
  })

  it('leaves other items untouched', () => {
    const other = { i: 'pir', x: 4, y: 0, w: 4, h: 4 }
    const items = [{ i: 'ultrasonic', x: 0, y: 0, w: 4, h: 8 }, other]
    const result = expandItem(items, 'ultrasonic')
    expect(result[1]).toBe(other)
  })

  it('is a no-op if the item is already expanded (w === COLS)', () => {
    const items = [{ i: 'ultrasonic', x: 0, y: 0, w: COLS, h: 8 }]
    const result = expandItem(items, 'ultrasonic')
    expect(result).toEqual(items)
  })
})

describe('collapseItem', () => {
  it('restores x/y/w/h from prevLayout and removes prevLayout', () => {
    const items = [
      { i: 'ultrasonic', x: 0, y: 2, w: COLS, h: 8, prevLayout: { x: 4, y: 2, w: 4, h: 8 } },
    ]
    const result = collapseItem(items, 'ultrasonic')
    expect(result).toEqual([{ i: 'ultrasonic', x: 4, y: 2, w: 4, h: 8 }])
  })

  it('is a no-op when there is no prevLayout to restore', () => {
    const items = [{ i: 'ultrasonic', x: 0, y: 0, w: 4, h: 8 }]
    const result = collapseItem(items, 'ultrasonic')
    expect(result).toEqual(items)
  })
})
