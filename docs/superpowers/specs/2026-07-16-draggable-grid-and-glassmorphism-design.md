# Draggable/Resizable Widget Grid + Glassmorphism Styling — Design

> Two related, frontend-only changes: (1) replace the fixed CSS-columns dashboard
> layout with a drag-and-resize grid (`react-grid-layout`), persisted per-widget to
> localStorage; (2) restyle `WidgetCard` toward a light glassmorphism look (semi-
> transparent background, subtle border, soft shadow — no `backdrop-filter` blur). No
> backend or protocol changes. Supersedes the `expanded` boolean and the
> `col-span-full` mechanism described in `2026-07-15-phase2-infrastructure-design.md`
> Part 2.

## Context

Current state before this work:
- `Dashboard.jsx` renders visible widgets in a Tailwind CSS-columns masonry layout
  (`columns-1 sm:columns-2 lg:columns-3`), each wrapped in a `break-inside-avoid` div
  that gets `[column-span:all]` when `widgetState[id].expanded` is true.
- `widgetState` (in `App.jsx`) is `{ [id]: { visible, expanded, resetToken } }` — no
  concept of position or size.
- `WidgetCard.jsx` is a shared shell: header (accent dot + title + icon buttons) over
  a `rounded-lg border border-neutral-800 bg-neutral-900 p-4` div. Icon buttons
  (expand/clear/hide) are conditionally rendered based on which handler props are
  passed.
- This is a personal dashboard viewed on one desktop screen — no requirement to
  support tablet/mobile breakpoints going forward (confirmed with user).
- `UltrasonicWidget` and `Gy87Widget` use Recharts `ResponsiveContainer` inside a
  fixed-height div (`h-40`, `h-44` respectively); `PirWidget` (canvas strip, 28px
  tall) `JoystickWidget` (180×180 canvas) and `Mpr121Widget` (fixed grid) have their
  own intrinsic sizes unrelated to chart responsiveness.

## Decisions

Confirmed with the user during brainstorming:

1. **Desktop-only, single fixed grid.** Use `react-grid-layout`'s plain `GridLayout`
   (12 columns), not `ResponsiveGridLayout`. One saved layout, not one per breakpoint.
2. **Expand is unified with the grid layout state**, not a separate boolean. Expanding
   sets that item's `w` to full width (12) and `x` to 0, saving its prior
   `{x,y,w,h}` so collapsing restores it exactly. This removes the old
   `expanded`/`col-span-full` mechanism entirely — resize and expand are the same
   underlying state.
3. **Drag handle is scoped to the header bar** via `draggableHandle`, and icon
   buttons additionally call `stopPropagation()` on `onMouseDown` so a click never
   starts a drag.
4. **No backdrop-filter / blur.** Styling change is background opacity + border +
   shadow only. Text/chart/icon colors are unchanged.

## Part 1 — Grid layout engine

### Dependency

Add `react-grid-layout` (`^2.2.3`; peer deps are `react >= 16.3.0` / `react-dom >=
16.3.0`, compatible with this project's React 19). Import its base stylesheets once,
globally:
```js
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
```
in `frontend/src/main.jsx`.

### `frontend/src/hooks/useWidgetLayout.js` (new)

Owns the RGL layout array and its localStorage persistence. Single responsibility:
given the set of registry widget ids, produce a valid RGL `layout` array and a setter
wired to RGL's `onLayoutChange`, independent of visibility or sensor data.

- **Storage key**: `sensor-dashboard:widget-layout:v1`.
- **Shape of a stored/live layout item**: RGL's standard `{ i, x, y, w, h }` plus an
  optional `prevLayout: { x, y, w, h }` used only while a widget is expanded (see
  Part 2).
- **Load-time reconciliation**: on mount, read the saved array. For any registry `id`
  not present (new widget added to `registry.js` since last save, or first run with no
  saved data at all), append a default entry:
  - If a hardcoded `DEFAULT_LAYOUT` (a small constant covering today's 5 known widget
    ids, arranged to roughly match the current 3-column masonry order) has an entry
    for that id, use it.
  - Otherwise, place it at `x: 0`, `w: 4`, `h: 8`, `y: <max(y+h) over all current
    items>` — i.e., append below everything else. No overlap, no crash.
- **`onLayoutChange(newLayout)`**: RGL calls this after every drag/resize with the
  full array (including non-visible... no — RGL only knows about items it's
  currently rendering, so hidden widgets are **not** in `newLayout`). The hook merges
  `newLayout` into its full stored array (updating only the ids present, leaving
  hidden widgets' stored entries untouched) and writes the merged result to
  localStorage. This is what makes "hide, then show again" restore the last position.
- **Returned API**: `{ layout, visibleLayout(visibleIds), onLayoutChange, expandWidget(id), collapseWidget(id) }`
  — `visibleLayout` filters the full array down to just the ids currently visible
  (what actually gets passed to `<GridLayout>`).

## Part 2 — Expand/collapse via the same state

`expandWidget(id)` / `collapseWidget(id)` (in `useWidgetLayout.js`) replace
`App.jsx`'s old `toggleExpand`:
- **Expand**: copy the item's current `{x,y,w,h}` into `prevLayout`, then set
  `x: 0, w: 12` (height unchanged).
- **Collapse**: if `prevLayout` exists, restore `{x,y,w,h}` from it and delete
  `prevLayout`; if it doesn't (e.g. edge case — item was never expanded), no-op.
- `expanded` as a rendered concept is now derived (`item.w === 12`), not stored
  separately — `WidgetCard`'s expand icon just reflects that derived boolean.
- Manually resizing an expanded widget (dragging its handle) is allowed and simply
  overwrites `w`/`h` going forward via the normal `onLayoutChange` path;
  `prevLayout` (if any) is left as-is and only consumed the next time collapse is
  explicitly triggered.

`App.jsx` no longer owns `expanded` in `widgetState` at all — `widgetState` shrinks to
`{ [id]: { visible, resetToken } }`. `WidgetCard`'s expand button now calls
`expandWidget`/`collapseWidget` from the new hook instead of `App.jsx`'s old toggle.

## Part 3 — `Dashboard.jsx` rendering

Replaces the CSS-columns wrapper with:
```jsx
<GridLayout
  className="layout"
  cols={12}
  rowHeight={30}
  width={<container width>}
  margin={[16, 16]}
  draggableHandle=".widget-drag-handle"
  layout={visibleLayout(visibleIds)}
  onLayoutChange={onLayoutChange}
>
  {visible.map(({ id, Component, hasHistory }) => (
    <div key={id}>
      <Component ... />
    </div>
  ))}
</GridLayout>
```
`GridLayout` needs an explicit pixel `width` (it doesn't measure its own parent) — use
a `ResizeObserver`-backed container width, the same pattern RGL's own docs recommend
(a small local `useContainerWidth` ref+effect, not a new dependency).

## Part 4 — Drag handle scoping (`WidgetCard.jsx`)

- The header `<div>` (currently `"mb-3 flex items-center justify-between"`) gains the
  class `widget-drag-handle`, matching `draggableHandle=".widget-drag-handle"` in
  Part 3.
- Every icon button (expand, clear, hide) gets `onMouseDown={(e) =>
  e.stopPropagation()}` in addition to its existing `onClick` — this stops RGL's
  mousedown-based drag-start listener (attached to the handle element) from ever
  firing when the target is a button inside it, while the button's own `onClick`
  still fires normally.
- Expand icon's `expanded` prop now comes from the derived `item.w === 12` check
  (computed in `Dashboard.jsx` or passed down), not a stored boolean.

## Part 5 — Content fills grid height

Consequence of making vertical resize meaningful:
- `UltrasonicWidget.jsx`: change the chart wrapper from `h-40` (fixed) to a flex
  child that fills available height (e.g. wrapping content in `flex h-full flex-col`
  and giving the chart wrapper `flex-1` instead of a fixed height class).
- `Gy87Widget.jsx`: same treatment for its `h-44` chart wrapper.
- `WidgetCard.jsx`'s outer div needs `h-full` (or equivalent) so it actually fills
  the grid item's height rather than sizing to content — otherwise resize would just
  add dead space below the card instead of growing it.
- `PirWidget`, `JoystickWidget`, `Mpr121Widget` are unchanged — their canvases/grid
  have fixed intrinsic sizes; resizing their grid item just changes surrounding
  whitespace within the (now `h-full`) card, which is acceptable since they aren't
  chart-shaped content.

## Part 6 — Styling pass (glassmorphism, no blur)

In `WidgetCard.jsx`, the outer div's classes change from
`rounded-lg border border-neutral-800 bg-neutral-900 p-4` to something like
`rounded-lg border border-white/10 bg-neutral-900/70 shadow-lg shadow-black/40 p-4`
(exact opacity numbers may be adjusted after visually checking contrast — see
Testing). No `backdrop-filter`, no background imagery, no other color changes
anywhere else in the file or in any widget.

## Testing

Manual, in mock mode (`SERIAL_SOURCE=mock npm --prefix backend run dev` +
`npm --prefix frontend run dev`):
- Drag a widget by its header to a new position; refresh — position persists.
- Resize a widget via the corner handle; refresh — size persists, and for
  Ultrasonic/GY-87 the chart itself visibly grew/shrank (not just blank space).
- Click each icon button (expand, clear, hide) directly — confirm none of them
  triggers a drag, and each still performs its existing action.
- Expand a widget, confirm full-width span; collapse, confirm it returns to its
  prior position/size (not a default).
- Hide a widget via sidebar or ×, confirm the rest keep their positions; show it
  again, confirm it reappears at its last saved spot.
- Visual check of all 5 widgets against the new card background, specifically GY-87's
  three chart lines and MPR121's 12-pad grid, for legibility regression.

## Out of scope

- Tablet/mobile responsive breakpoints for the grid (explicitly desktop-only per
  Decision 1).
- Any backend, protocol, or CSV recording change.
- Any color change beyond card background/border/shadow (chart colors, icon colors,
  accent dots, text all stay as-is).
- Drag/resize constraints beyond RGL's defaults (e.g. no custom min/max size rules
  requested).
