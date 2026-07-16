# Draggable/Resizable Widget Grid + Glassmorphism Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed CSS-columns dashboard layout with a drag-and-resize grid (`react-grid-layout`) persisted to localStorage, and restyle widget cards toward a light (no-blur) glassmorphism look.

**Architecture:** A new pure module (`layoutUtils.js`) implements layout reconciliation, expand/collapse, and merge logic as plain functions over arrays — unit tested directly. A thin hook (`useWidgetLayout.js`) wraps those pure functions with React state + localStorage persistence and is used locally inside `Dashboard.jsx` (no prop drilling through `App.jsx`, since expand/position/size are purely a layout concern now). `Dashboard.jsx` renders widgets inside `react-grid-layout`'s `GridLayout`, with the drag handle scoped to `WidgetCard`'s header via `draggableHandle`. `WidgetCard.jsx` also gets the new background/border/shadow treatment.

**Tech Stack:** React 19, `react-grid-layout` (new), Tailwind CSS v4, Vitest (new, frontend has no existing test runner) for the pure-logic unit tests only — drag/resize/styling verification is manual via the running app, per the design spec's Testing section.

**Design spec:** `docs/superpowers/specs/2026-07-16-draggable-grid-and-glassmorphism-design.md`

---

## Task 1: Add dependencies

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Add `react-grid-layout` and `vitest`**

Edit `frontend/package.json`:
- Add to `"dependencies"`: `"react-grid-layout": "^2.2.3"`
- Add to `"devDependencies"`: `"vitest": "^4.1.10"`
- Add to `"scripts"`: `"test": "vitest run"`

- [ ] **Step 2: Install**

Run: `cd frontend && npm install`
Expected: installs cleanly, `node_modules/react-grid-layout` and `node_modules/vitest` present, no peer-dep errors (react-grid-layout@2.2.3 declares `react >= 16.3.0`).

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore(frontend): add react-grid-layout and vitest"
```

---

## Task 2: Layout constants + `reconcileLayout`

**Files:**
- Create: `frontend/src/hooks/layoutUtils.js`
- Create: `frontend/src/hooks/layoutUtils.test.js`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/hooks/layoutUtils.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { reconcileLayout, DEFAULT_LAYOUT, COLS } from './layoutUtils.js'

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
})

describe('COLS', () => {
  it('is 12', () => {
    expect(COLS).toBe(12)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/hooks/layoutUtils.test.js`
Expected: FAIL — `layoutUtils.js` does not exist / has no exports.

- [ ] **Step 3: Implement `layoutUtils.js` (constants + `reconcileLayout` only for now)**

Create `frontend/src/hooks/layoutUtils.js`:

```js
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
  const seen = new Set(savedItems.map((item) => item.i))
  const result = [...savedItems]
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/hooks/layoutUtils.test.js`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/layoutUtils.js frontend/src/hooks/layoutUtils.test.js
git commit -m "feat(frontend): pure layout reconciliation logic"
```

---

## Task 3: `expandItem` / `collapseItem`

**Files:**
- Modify: `frontend/src/hooks/layoutUtils.js`
- Modify: `frontend/src/hooks/layoutUtils.test.js`

- [ ] **Step 1: Add the failing tests**

Append to `frontend/src/hooks/layoutUtils.test.js`:

```js
import { collapseItem, expandItem } from './layoutUtils.js'

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/hooks/layoutUtils.test.js`
Expected: FAIL — `expandItem`/`collapseItem` not exported.

- [ ] **Step 3: Implement**

Append to `frontend/src/hooks/layoutUtils.js`:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/hooks/layoutUtils.test.js`
Expected: PASS (all tests so far).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/layoutUtils.js frontend/src/hooks/layoutUtils.test.js
git commit -m "feat(frontend): expand/collapse folded into grid layout state"
```

---

## Task 4: `mergeLayoutChange`

**Files:**
- Modify: `frontend/src/hooks/layoutUtils.js`
- Modify: `frontend/src/hooks/layoutUtils.test.js`

- [ ] **Step 1: Add the failing tests**

Append to `frontend/src/hooks/layoutUtils.test.js`:

```js
import { mergeLayoutChange } from './layoutUtils.js'

describe('mergeLayoutChange', () => {
  it('updates x/y/w/h for items present in the changed set', () => {
    const full = [{ i: 'ultrasonic', x: 0, y: 0, w: 4, h: 8 }]
    const changed = [{ i: 'ultrasonic', x: 2, y: 1, w: 5, h: 9 }]
    const result = mergeLayoutChange(full, changed)
    expect(result).toEqual([{ i: 'ultrasonic', x: 2, y: 1, w: 5, h: 9 }])
  })

  it('preserves an existing prevLayout that the changed payload does not carry', () => {
    const full = [
      { i: 'ultrasonic', x: 0, y: 0, w: 12, h: 8, prevLayout: { x: 4, y: 0, w: 4, h: 8 } },
    ]
    const changed = [{ i: 'ultrasonic', x: 0, y: 0, w: 12, h: 10 }]
    const result = mergeLayoutChange(full, changed)
    expect(result).toEqual([
      { i: 'ultrasonic', x: 0, y: 0, w: 12, h: 10, prevLayout: { x: 4, y: 0, w: 4, h: 8 } },
    ])
  })

  it('leaves items not present in the changed set (hidden widgets) completely untouched', () => {
    const hidden = { i: 'pir', x: 4, y: 0, w: 4, h: 4 }
    const full = [{ i: 'ultrasonic', x: 0, y: 0, w: 4, h: 8 }, hidden]
    const changed = [{ i: 'ultrasonic', x: 1, y: 1, w: 5, h: 9 }]
    const result = mergeLayoutChange(full, changed)
    expect(result[1]).toBe(hidden)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/hooks/layoutUtils.test.js`
Expected: FAIL — `mergeLayoutChange` not exported.

- [ ] **Step 3: Implement**

Append to `frontend/src/hooks/layoutUtils.js`:

```js
export function mergeLayoutChange(fullItems, changedItems) {
  const changedById = Object.fromEntries(changedItems.map((item) => [item.i, item]))
  return fullItems.map((item) => {
    const changed = changedById[item.i]
    if (!changed) return item
    return item.prevLayout ? { ...changed, prevLayout: item.prevLayout } : changed
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/hooks/layoutUtils.test.js`
Expected: PASS (all tests — 12 total across the file).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/layoutUtils.js frontend/src/hooks/layoutUtils.test.js
git commit -m "feat(frontend): merge RGL layout-change payloads into stored layout"
```

---

## Task 5: `useWidgetLayout` hook

**Files:**
- Create: `frontend/src/hooks/useWidgetLayout.js`

No automated test for this file — it's a thin React/localStorage wrapper around the
pure functions tested in Tasks 2-4. Verified manually in Task 9's browser QA pass.

- [ ] **Step 1: Implement**

Create `frontend/src/hooks/useWidgetLayout.js`:

```js
import { useCallback, useEffect, useState } from 'react'
import { STORAGE_KEY, collapseItem, expandItem, mergeLayoutChange, reconcileLayout } from './layoutUtils.js'

function loadStoredLayout() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/**
 * Owns the full per-widget layout array (position + size for every registry id,
 * including currently-hidden ones) and its localStorage persistence. Display-only
 * preference — never sent to the backend or involved in CSV recording.
 */
export function useWidgetLayout(registryIds) {
  const [layout, setLayout] = useState(() => reconcileLayout(loadStoredLayout(), registryIds))

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
  }, [layout])

  const visibleLayout = useCallback(
    (visibleIds) => layout.filter((item) => visibleIds.includes(item.i)),
    [layout],
  )

  const onLayoutChange = useCallback((changed) => {
    setLayout((prev) => mergeLayoutChange(prev, changed))
  }, [])

  const expandWidget = useCallback((id) => {
    setLayout((prev) => expandItem(prev, id))
  }, [])

  const collapseWidget = useCallback((id) => {
    setLayout((prev) => collapseItem(prev, id))
  }, [])

  return { layout, visibleLayout, onLayoutChange, expandWidget, collapseWidget }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useWidgetLayout.js
git commit -m "feat(frontend): useWidgetLayout hook wiring layout state to localStorage"
```

---

## Task 6: `useContainerWidth` hook

**Files:**
- Create: `frontend/src/hooks/useContainerWidth.js`

`GridLayout` requires an explicit pixel `width` (it does not measure its own parent).

- [ ] **Step 1: Implement**

Create `frontend/src/hooks/useContainerWidth.js`:

```js
import { useEffect, useRef, useState } from 'react'

/** Returns [ref, width] — attach ref to the element whose rendered width should drive layout. */
export function useContainerWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined

    setWidth(el.getBoundingClientRect().width)
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return [ref, width]
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useContainerWidth.js
git commit -m "feat(frontend): useContainerWidth hook for GridLayout's explicit width prop"
```

---

## Task 7: Wire `react-grid-layout` into `Dashboard.jsx`

**Files:**
- Modify: `frontend/src/main.jsx`
- Modify: `frontend/src/components/Dashboard.jsx`

- [ ] **Step 1: Import RGL's base stylesheets globally**

Edit `frontend/src/main.jsx`:

```js
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 2: Rewrite `Dashboard.jsx` to render a `GridLayout`**

Replace the full contents of `frontend/src/components/Dashboard.jsx`:

```jsx
import GridLayout from 'react-grid-layout'
import { registry } from '../widgets/registry.js'
import { useWidgetLayout } from '../hooks/useWidgetLayout.js'
import { useContainerWidth } from '../hooks/useContainerWidth.js'
import { COLS } from '../hooks/layoutUtils.js'

const ROW_HEIGHT = 30
const MARGIN = [16, 16]

function Dashboard({ latestByKey, historyByKey, widgetState, onHide, onClearHistory }) {
  const visible = registry.filter((w) => widgetState[w.id]?.visible)
  const visibleIds = visible.map((w) => w.id)
  const registryIds = registry.map((w) => w.id)

  const { visibleLayout, onLayoutChange, expandWidget, collapseWidget } = useWidgetLayout(registryIds)
  const [containerRef, containerWidth] = useContainerWidth()

  const items = visibleLayout(visibleIds)

  return (
    <div ref={containerRef} className="p-4">
      {containerWidth > 0 && (
        <GridLayout
          cols={COLS}
          rowHeight={ROW_HEIGHT}
          width={containerWidth}
          margin={MARGIN}
          draggableHandle=".widget-drag-handle"
          layout={items}
          onLayoutChange={onLayoutChange}
        >
          {visible.map(({ id, Component, hasHistory }) => {
            const state = widgetState[id]
            const item = items.find((it) => it.i === id)
            const expanded = item?.w === COLS

            return (
              <div key={id}>
                <Component
                  latestByKey={latestByKey}
                  historyByKey={historyByKey}
                  expanded={expanded}
                  onToggleExpand={() => (expanded ? collapseWidget(id) : expandWidget(id))}
                  onHide={() => onHide(id)}
                  onClear={hasHistory ? () => onClearHistory(id) : undefined}
                  resetToken={state.resetToken}
                />
              </div>
            )
          })}
        </GridLayout>
      )}
    </div>
  )
}

export default Dashboard
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/main.jsx frontend/src/components/Dashboard.jsx
git commit -m "feat(frontend): replace CSS-columns dashboard with react-grid-layout"
```

---

## Task 8: Scope the drag handle to the header in `WidgetCard.jsx`

**Files:**
- Modify: `frontend/src/components/WidgetCard.jsx`

- [ ] **Step 1: Add the handle class and stop propagation on every icon button**

Replace the full contents of `frontend/src/components/WidgetCard.jsx`:

```jsx
const ICON_BUTTON_CLASS =
  'rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200'

/**
 * Generic card shell shared by all widgets: title bar + accent color + content slot +
 * header controls (expand, clear-history, hide). This component holds no state of its
 * own — callers (widget components, forwarding props threaded down from Dashboard.jsx)
 * own expanded/visibility state. A control button only renders if its handler is passed
 * (e.g. `onClear` is omitted for widgets with `hasHistory: false` in the registry).
 * The header carries `widget-drag-handle` (react-grid-layout's `draggableHandle`
 * selector) so only it can start a drag — every button additionally stops the
 * mousedown from propagating so a click never gets swallowed as a drag-start.
 */
function WidgetCard({
  title,
  accentColor = '#22d3ee',
  expanded = false,
  onToggleExpand,
  onClear,
  onHide,
  children,
}) {
  return (
    <div className="flex h-full flex-col rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="widget-drag-handle mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-200">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: accentColor }}
            aria-hidden="true"
          />
          {title}
        </h2>
        <div className="flex items-center gap-1">
          {onToggleExpand && (
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={onToggleExpand}
              className={ICON_BUTTON_CLASS}
              title={expanded ? 'Collapse' : 'Expand to full width'}
              aria-label={expanded ? 'Collapse' : 'Expand to full width'}
            >
              {expanded ? '⤡' : '⤢'}
            </button>
          )}
          {onClear && (
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={onClear}
              className={ICON_BUTTON_CLASS}
              title="Clear history"
              aria-label="Clear history"
            >
              ⟲
            </button>
          )}
          {onHide && (
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={onHide}
              className={ICON_BUTTON_CLASS}
              title="Hide widget"
              aria-label="Hide widget"
            >
              ×
            </button>
          )}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  )
}

export default WidgetCard
```

Note: background/border classes stay as today's solid dark theme for now — the
glassmorphism treatment is Task 12, kept separate so grid mechanics can be verified
independently of the styling change.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/WidgetCard.jsx
git commit -m "feat(frontend): scope drag handle to widget header, fill grid item height"
```

---

## Task 9: Update `App.jsx` — drop the old `expanded` state

**Files:**
- Modify: `frontend/src/App.jsx`

`expanded` is now entirely owned by `useWidgetLayout` inside `Dashboard.jsx` (Task 7).
`App.jsx` no longer needs it in `widgetState`, and no longer passes `onToggleExpand`.

- [ ] **Step 1: Remove `expanded` and `toggleExpand`**

Edit `frontend/src/App.jsx`:

```jsx
import { useMemo, useState } from 'react'
import { useSensorSocket } from './hooks/useSensorSocket.js'
import { registry } from './widgets/registry.js'
import ConnectionBar from './components/ConnectionBar.jsx'
import Sidebar from './components/Sidebar.jsx'
import Dashboard from './components/Dashboard.jsx'

function initialWidgetState() {
  return Object.fromEntries(registry.map((w) => [w.id, { visible: true, resetToken: 0 }]))
}

function App() {
  const [paused, setPaused] = useState(false)
  const [widgetState, setWidgetState] = useState(initialWidgetState)
  const { connected, port, dataRateHz, recording, latestByKey, historyByKey, clearHistory } =
    useSensorSocket(paused)

  const keysById = useMemo(() => Object.fromEntries(registry.map((w) => [w.id, w.keys])), [])

  function toggleVisible(id) {
    setWidgetState((prev) => ({ ...prev, [id]: { ...prev[id], visible: !prev[id].visible } }))
  }

  function hideWidget(id) {
    setWidgetState((prev) => ({ ...prev, [id]: { ...prev[id], visible: false } }))
  }

  function clearWidgetHistory(id) {
    clearHistory(keysById[id])
    setWidgetState((prev) => ({
      ...prev,
      [id]: { ...prev[id], resetToken: prev[id].resetToken + 1 },
    }))
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <ConnectionBar
        connected={connected}
        port={port}
        dataRateHz={dataRateHz}
        paused={paused}
        onTogglePause={() => setPaused((p) => !p)}
        recording={recording}
      />
      <div className="flex">
        <Sidebar registry={registry} widgetState={widgetState} onToggleVisible={toggleVisible} />
        <div className="flex-1">
          <Dashboard
            latestByKey={latestByKey}
            historyByKey={historyByKey}
            widgetState={widgetState}
            onHide={hideWidget}
            onClearHistory={clearWidgetHistory}
          />
        </div>
      </div>
    </div>
  )
}

export default App
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "refactor(frontend): drop expanded from widgetState, owned by grid layout now"
```

---

## Task 10: Flex-fill chart containers (Ultrasonic, GY-87)

**Files:**
- Modify: `frontend/src/widgets/UltrasonicWidget.jsx:48`
- Modify: `frontend/src/widgets/Gy87Widget.jsx:47`

Without this, resizing a grid item taller/shorter just adds/removes blank space below
the card instead of the chart itself growing — `WidgetCard`'s content wrapper (Task 8)
is now a flex column, so a `flex-1` chart wrapper actually receives the extra height.

- [ ] **Step 1: Change `UltrasonicWidget.jsx`'s chart wrapper**

In `frontend/src/widgets/UltrasonicWidget.jsx`, change line 48 from:

```jsx
      <div className="h-40 w-full">
```

to:

```jsx
      <div className="min-h-0 w-full flex-1">
```

- [ ] **Step 2: Change `Gy87Widget.jsx`'s chart wrapper**

In `frontend/src/widgets/Gy87Widget.jsx`, change line 47 from:

```jsx
      <div className="h-44 w-full">
```

to:

```jsx
      <div className="min-h-0 w-full flex-1">
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/widgets/UltrasonicWidget.jsx frontend/src/widgets/Gy87Widget.jsx
git commit -m "feat(frontend): let Ultrasonic and GY-87 charts fill resized grid height"
```

---

## Task 11: Manual QA — grid mechanics

**Files:** none (verification only)

- [ ] **Step 1: Run the automated unit tests**

Run: `cd frontend && npm test`
Expected: PASS (all `layoutUtils.test.js` cases from Tasks 2-4).

- [ ] **Step 2: Start the app in mock mode**

Run in one terminal: `nvm use && SERIAL_SOURCE=mock npm --prefix backend run dev`
Run in another: `nvm use && npm --prefix frontend run dev`
Open the printed Vite URL in the browser preview tool.

- [ ] **Step 3: Verify drag is header-scoped**

Click and drag a widget's header title bar — confirm it moves and snaps to the grid.
Click and drag the chart/content area of a widget (not the header) — confirm it does
**not** start a drag.

- [ ] **Step 4: Verify icon buttons still work without triggering drag**

Click each visible icon button (expand, clear-history where present, hide) directly —
confirm each performs its action (chart resets, widget hides) and does not move the
card.

- [ ] **Step 5: Verify resize**

Drag a widget's corner resize handle to make it taller. For the Ultrasonic or GY-87
widget, confirm the chart itself visibly grows (not just blank space below it).

- [ ] **Step 6: Verify persistence**

Refresh the page. Confirm the dragged/resized widget(s) are in the same position/size
as before the refresh (check `localStorage.getItem('sensor-dashboard:widget-layout:v1')`
via the browser devtools console to confirm the stored JSON matches what's rendered).

- [ ] **Step 7: Verify expand/collapse**

Click a widget's expand icon (⤢) — confirm it spans full width. Click collapse (⤡) —
confirm it returns to its exact prior position and size, not a default.

- [ ] **Step 8: Verify hide/show preserves position**

Hide a widget via the sidebar checkbox (or its × button). Confirm the remaining
widgets keep their positions (no reflow). Show it again — confirm it reappears at its
last saved position, not a default one.

- [ ] **Step 9: Fix forward** — if any check above fails, diagnose and fix before
proceeding to Task 12 (don't layer the styling change on top of broken grid mechanics).

---

## Task 12: Glassmorphism styling pass

**Files:**
- Modify: `frontend/src/components/WidgetCard.jsx`

- [ ] **Step 1: Update the outer card classes**

In `frontend/src/components/WidgetCard.jsx`, change:

```jsx
    <div className="flex h-full flex-col rounded-lg border border-neutral-800 bg-neutral-900 p-4">
```

to:

```jsx
    <div className="flex h-full flex-col rounded-lg border border-white/10 bg-neutral-900/70 p-4 shadow-lg shadow-black/40">
```

No other lines in this file change — text/icon colors, chart colors, and everything
in the widget components are untouched.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/WidgetCard.jsx
git commit -m "style(frontend): light glassmorphism card treatment (no blur)"
```

---

## Task 13: Manual QA — styling legibility

**Files:** none (verification only)

- [ ] **Step 1: Reload the running app**

With both dev servers still running from Task 11, reload the browser preview.

- [ ] **Step 2: Visual check across all 5 widgets**

Take a screenshot. Confirm for each widget:
- Ultrasonic: number readout and chart line stay clearly readable.
- PIR: motion strip colors still distinguishable against the new card background.
- Joystick: dot and trail still visible against the canvas.
- GY-87: all three chart lines (roll/pink, pitch/blue, yaw/yellow) stay distinguishable
  from each other and from the card background — this is the highest-risk widget for
  a contrast regression.
- MPR121: all 12 touch-pad grid cells stay clearly distinguishable in both touched and
  untouched states.

- [ ] **Step 3: Adjust opacity if anything reads poorly**

If any of the above is degraded, adjust the opacity fraction on `bg-neutral-900/70`
(e.g. to `/80` or `/85` — more opaque, less see-through) in `WidgetCard.jsx` and
re-check. Commit any adjustment as a follow-up:

```bash
git add frontend/src/components/WidgetCard.jsx
git commit -m "style(frontend): tune card opacity for chart legibility"
```

(Skip this step's commit if no adjustment was needed.)

- [ ] **Step 4: Final full regression pass**

Re-run Task 11 steps 3-8 once more against the now-styled cards (drag, resize,
refresh-persistence, icon buttons, expand/collapse, hide/show) to confirm the styling
change didn't regress the grid mechanics.

---

## Out of scope (per design spec)

- Tablet/mobile responsive breakpoints.
- Any backend, protocol, or CSV recording change.
- Any color change beyond card background/border/shadow.
- Custom min/max resize constraints beyond `react-grid-layout` defaults.
