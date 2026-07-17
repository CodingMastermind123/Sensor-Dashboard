export const COLS = 12
export const STORAGE_KEY = 'sensor-dashboard:widget-layout:v1'

// Roughly matches the pre-grid masonry order: ultrasonic+gy87 stacked in column 1,
// pir+mpr121 stacked in column 2, joystick alone in column 3.
export const DEFAULT_LAYOUT = {
  ultrasonic: { x: 0, y: 0, w: 4, h: 8 },
  pir: { x: 4, y: 0, w: 4, h: 4 },
  joystick: { x: 8, y: 0, w: 4, h: 8 },
  gy87: { x: 0, y: 8, w: 4, h: 8 },
  mpr121: { x: 4, y: 4, w: 4, h: 8 },
}

const FALLBACK_W = 4
const FALLBACK_H = 8

export function reconcileLayout(savedItems, registryIds) {
  const seen = new Set()
  const result = []
  for (const item of savedItems) {
    if (seen.has(item.i)) continue
    result.push(item)
    seen.add(item.i)
  }
  let maxBottom = result.reduce((max, item) => Math.max(max, item.y + item.h), 0)

  for (const id of registryIds) {
    if (seen.has(id)) continue
    const def = DEFAULT_LAYOUT[id]
    const item = def ? { i: id, ...def } : { i: id, x: 0, y: maxBottom, w: FALLBACK_W, h: FALLBACK_H }
    result.push(item)
    maxBottom = Math.max(maxBottom, item.y + item.h)
    seen.add(id)
  }

  return result
}

export function expandItem(items, id) {
  return items.map((item) => {
    if (item.i !== id || item.w === COLS) return item
    const { x, y, w, h } = item
    return { ...item, x: 0, w: COLS, prevLayout: { x, y, w, h } }
  })
}

export function collapseItem(items, id) {
  return items.map((item) => {
    if (item.i !== id || !item.prevLayout) return item
    const { i } = item
    return { i, ...item.prevLayout }
  })
}
