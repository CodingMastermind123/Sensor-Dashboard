# Phase 2 Infrastructure — Design

> Covers the remaining Phase 2 infrastructure items from `PLAN.md` §6: pause/resume,
> per-widget controls, sidebar/nav, and CSV session logging + export. Sensor widgets
> (PIR, Joystick, GY-87, MPR121) are already built; this spec only covers dashboard
> chrome and backend logging, not new sensors.

## Context

Current state before this work:
- `frontend/src/widgets/registry.js` is a static array with a hardcoded `visible: true` —
  not stateful, no `expanded` or per-widget key metadata.
- `frontend/src/components/WidgetCard.jsx` is a dumb shell with a TODO stub where
  per-widget controls (show/hide, expand, clear-history) were deferred from Step 1.10.
- `frontend/src/hooks/useSensorSocket.js` maintains `latestByKey` and a capped
  `historyByKey` ring buffer (numeric values only — `JOY` and `TOUCH` are not stored
  here since they aren't plain numbers).
- No sidebar/nav exists. No pause state exists. No CSV logging exists on the backend.
- `backend/src/server.js` already has a `command` WS message stub reserved for Phase 3
  control-channel writes (SERVO/FAN/etc.) — recording control intentionally does **not**
  reuse this channel (see Decisions).

## Decisions

These were confirmed with the user during brainstorming; each is binding for the
implementation plan:

1. **Pause = freeze UI only.** The WebSocket keeps streaming; the frontend just stops
   applying incoming frames to state. Recording (if active) is a fully independent
   control and is unaffected by pause.
2. **CSV header is fixed at the protocol level**, not derived from what's been seen in
   a given session. A key not in the fixed column list is simply omitted from CSV rows
   (still visible live in the UI).
3. **Recording start/stop/download use REST endpoints**, not the WS `command` channel —
   that channel stays reserved for future Phase 3 device control. File listing/download
   is a natural REST fit.
4. **Sidebar = widget visibility only.** Global pause/resume and recording controls live
   in the top bar (`ConnectionBar`), not the sidebar.
5. **Each widget card gets its own quick hide (×) button** in addition to the sidebar
   checkbox — both control the same shared visibility state, so either place works.

### Refinements added after user review of this spec

6. **`ts` vs `recvTs` gotcha is documented inline in `recorder.js`**, directly above the
   column list — not only here. `ts` (Arduino `millis()`) resets to ~0 on any board
   reboot mid-recording; `recvTs` (server receive time) never resets. A session spanning
   a reset will show `ts` jump backward even though nothing is corrupted — this needs to
   be visible to whoever reads the code later, not just this doc.
7. **`recorder.js`'s CSV column list partially derives from `parser.js`.** `parser.js`
   exports `KNOWN_MULTI`/`STRING_KEYS` (previously module-private) so `recorder.js`
   reuses JOY's sub-key names (`JOY_x`/`JOY_y` flattening) and which keys must stay raw
   strings (`TOUCH`), instead of redeclaring that shape independently. What still can't
   be shared: `parser.js` has no exhaustive list of scalar keys at all — unknown keys
   deliberately pass through untouched there (extensibility). So `recorder.js` keeps its
   own `SCALAR_KEYS` list (`DIST, PIR, ROLL, PITCH, YAW`) by hand, with a comment
   explaining why — a documented tradeoff, not an oversight.
8. **Recorder tests cover a source disconnect during an active recording** (Arduino
   unplugged, source swapped — Node process keeps running), not just a full backend
   restart. Since `recorder.write()` is only ever called from the `'line'` handler, a
   disconnect simply means a gap in `write()` calls, not a distinct code path — the test
   confirms this produces no crash, no fabricated rows, and a clean resume.

## Part 1 — Backend: CSV recording

### `backend/src/recorder.js` (new, unit-testable in isolation)

- Fixed column list (protocol-level constant, extended by hand whenever a new sensor
  key is added — same "one-line change" ethos as `KNOWN_MULTI`/`STRING_KEYS` in
  `parser.js`):
  ```
  ts, recvTs, DIST, PIR, JOY_x, JOY_y, TOUCH, ROLL, PITCH, YAW
  ```
  `JOY` is flattened into `JOY_x`/`JOY_y`; everything else maps 1:1 to a parsed data key.
- `start()`: opens `backend/sessions/<timestamp>.csv` (colon-safe timestamp, e.g.
  `2026-07-15T14-32-05.csv`) and writes the header row. Throws/returns an error if a
  recording is already active (caller maps this to HTTP 409).
- `write(parsed)`: appends one row per frame while active. Only that frame's actual
  data is written — a key absent that cycle is an empty cell, not carried forward from
  the last known value (this is a raw per-frame log, distinct from the frontend's
  latest-value-persists behavior).
- `stop()`: closes the file, returns `{ file, rows }`. Errors (409-mapped) if not active.
- `isRecording()` / `currentFile()`: for status-envelope wiring.

### `server.js` wiring

- `POST /recording/start` → `{ ok: true, file }` (409 if already active)
- `POST /recording/stop` → `{ ok: true, file, rows }` (409 if not active)
- `GET /sessions` → `[{ file, size, mtime }]`, reading `backend/sessions/`
- `GET /sessions/:file` → download (`Content-Disposition: attachment`). The `:file`
  param is validated against the exact generated-filename pattern
  (`/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.csv$/`) before touching the filesystem —
  no path traversal.
- The existing `source.on('line')` handler calls `recorder.write(parsed)` after a
  successful parse, only when recording is active.
- The `status` envelope (`currentStatus()`) gains `recording: boolean` and
  `sessionFile: string|null`, so a client that connects or reconnects mid-session sees
  correct recording state rather than assuming it's off.

## Part 2 — Frontend: state lifting + per-widget controls

### `registry.js`

Each entry gains:
- `keys: string[]` — the sensor keys this widget's history depends on (e.g.
  `['ROLL','PITCH','YAW']` for GY-87, `['DIST']` for Ultrasonic, `['JOY']` for
  Joystick, `['TOUCH']` for MPR121, `['PIR']` for PIR).
- `hasHistory: boolean` — `false` only for MPR121 (a bitfield snapshot has no
  time-series concept; its clear-history button is omitted, not just disabled).

The static `visible: true` field is removed — visibility/expansion state moves to
`App.jsx`.

### `App.jsx`

Owns `widgetState: { [id]: { visible: boolean, expanded: boolean, resetToken: number } }`,
initialized from the registry (`visible: true, expanded: false, resetToken: 0` for
every entry). Exposes:
- `toggleVisible(id)`
- `toggleExpand(id)`
- `clearHistory(id)` — calls the hook's `clearHistory(keys)` for that widget's `keys`
  **and** bumps `resetToken[id]` so widgets with local (non-`historyByKey`) buffers can
  react.

### `useSensorSocket.js`

- Accepts a `paused` argument. While `paused` is true, `onmessage`'s `sensors` branch
  skips `setLastFrame`/`setLatestByKey`/`setHistoryByKey` — the `status` branch
  (`connected`/`port`/`dataRateHz`) is untouched by pause, so the connection indicator
  stays live even while the display is frozen.
- Gains `clearHistory(keys: string[])`: removes those keys from `historyByKey` state
  (used by numeric-history widgets — Ultrasonic, GY-87, PIR's derived event log).

### `WidgetCard.jsx`

Replaces the TODO stub with up to three header icon buttons, rendered from props only
(no internal state):
- Expand/collapse toggle (always shown) — calls `onToggleExpand`.
- Clear-history (⟲) — only rendered if `onClear` is passed (i.e., `hasHistory` is true
  for that widget).
- Hide (×) — always shown — calls `onHide`.

### The 5 widget files

Each accepts `expanded, onToggleExpand, onHide, onClear, resetToken` as additional
props (alongside the existing `latestByKey`/`historyByKey`) and forwards
`expanded/onToggleExpand/onHide/onClear` straight into its `<WidgetCard>` call.

Only `JoystickWidget` needs to *act* on `resetToken` — a `useEffect` keyed on it
clears `trailRef.current`, since `JOY`'s `{x,y}` shape lives outside `historyByKey`
and isn't cleared by `clearHistory()`. Every other widget's clear behavior falls out
for free once `historyByKey` is cleared, because their rendering reads directly from
it (min/max, chart data, PIR's derived rising-edge event list).

### `Dashboard.jsx`

Renders a wrapper `<div>` per visible widget (not touching `WidgetCard`'s own markup)
that gets `col-span-full` when that widget's `expanded` is true. This keeps "expand"
entirely a Dashboard-level concern — no widget file needs layout changes for it, only
the icon-state prop forwarding described above. Filters out non-visible widgets before
rendering (reads `widgetState` from `App.jsx` via props).

## Part 3 — Sidebar + pause/record controls

### `Sidebar.jsx` (new)

A fixed-width column to the left of the dashboard grid, styled consistently with the
existing dark/minimal Tailwind theme. Lists every registry entry with a checkbox bound
to `widgetState[id].visible`, calling `toggleVisible(id)`. Nothing else lives here.

### `ConnectionBar.jsx`

Gains, alongside the existing status readout:
- **Pause/Resume** toggle — flips `App.jsx`'s `paused` state, passed into
  `useSensorSocket`.
- **Record/Stop** toggle — calls `POST /recording/start` / `POST /recording/stop`
  directly (REST, not WS, per Decision 3). Shows a "● REC" indicator driven by the
  `recording` field now present in the `status` envelope (so it reflects true backend
  state, including across reconnects — not just local button-click state).
- **Sessions** — once `GET /sessions` returns at least one file, a small dropdown/list
  of past sessions with download links to `GET /sessions/:file`.

## Testing

- **Backend**: `recorder.js` unit tests (start/write/stop lifecycle, fixed-column
  formatting, missing-key-is-empty-cell behavior, error on double-start/double-stop,
  **and a source-disconnect-during-recording case**: a gap in `write()` calls —
  simulating the Arduino/mock source going quiet while the Node process keeps
  running, as distinct from a full backend restart — produces no crash, no fabricated
  rows, and a clean resume). Server integration tests for the four new REST routes
  (happy path + 409s + path traversal rejection on `GET /sessions/:file`).
- **Frontend**: manual mock-mode E2E — sidebar checkbox hides/shows a widget; hide (×)
  on a card matches the sidebar unchecking; expand grows a card to full width; clear
  resets a chart/log to empty (including Joystick's trail); pause freezes all widgets
  while the connection dot/Hz keep updating, resume picks back up; record → stop
  produces a downloadable CSV with the fixed header and correct rows; killing/restarting
  the backend mid-recording is reflected correctly via the `status` envelope on
  reconnect.

## Out of scope

- Multiple simultaneous recordings, recording rotation/size limits.
- Reordering widgets (explicitly Phase 4 per `PLAN.md`).
- Any change to the sensor widgets' own internals beyond the mechanical prop-forwarding
  described in Part 2.
- SQLite logging (explicitly deferred past CSV per `PLAN.md`).
