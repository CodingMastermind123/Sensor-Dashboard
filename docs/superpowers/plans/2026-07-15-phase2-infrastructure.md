# Phase 2 Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the remaining Phase 2 infrastructure from `PLAN.md` §6 — CSV session recording (backend), and pause/resume + per-widget controls (expand/clear/hide) + a visibility sidebar (frontend) — on top of the existing sensor-widget pipeline.

**Architecture:** Backend gets a new `recorder.js` module (isolated, unit-tested CSV writer) wired into `server.js` via four REST routes and two new `status` envelope fields. Frontend lifts widget visibility/expansion state out of the static registry into `App.jsx`, threads control callbacks through `WidgetCard.jsx` and the five widget components, and adds `Sidebar.jsx` + `ConnectionBar.jsx` controls for pause and recording.

**Tech Stack:** Node ESM + Express + `ws` (backend, Vitest); React 18 + Vite + Tailwind + Recharts (frontend, JSX, no test framework — manual mock-mode verification, matching existing convention).

**Design doc:** `docs/superpowers/specs/2026-07-15-phase2-infrastructure-design.md` (read first — this plan implements it, including the three refinements folded in after user review: the `ts`/`recvTs` reset gotcha comment, `parser.js`-derived column shape, and the disconnect-gap recorder test).

---

## Task 1: Share `parser.js`'s key-shape metadata (already done)

**Files:**
- Modify: `backend/src/parser.js:1-5`

- [x] **Step 1: Export `KNOWN_MULTI` and `STRING_KEYS`**

```js
// Known multi-value keys get a named shape instead of a plain array.
// Exported so recorder.js can derive its CSV flattening (JOY -> JOY_x, JOY_y) from the
// same source instead of hardcoding the sub-key names a second time.
export const KNOWN_MULTI = { JOY: ['x', 'y'] };

// Keys that must never be coerced to a number (leading zeros / bit width matter).
// Exported so recorder.js knows to write these as-is rather than assuming a numeric cell.
export const STRING_KEYS = new Set(['TOUCH']);
```

- [x] **Step 2: Run the existing parser tests to confirm nothing broke**

Run: `npm --prefix backend test -- parser.test.js`
Expected: PASS (adding `export` doesn't change behavior)

---

## Task 2: `recorder.js` — CSV session recorder (isolated, TDD)

**Files:**
- Create: `backend/src/recorder.js`
- Create: `backend/src/recorder.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// backend/src/recorder.test.js
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRecorder, COLUMNS } from './recorder.js';

describe('recorder', () => {
  let dir;
  let recorder;

  afterEach(() => {
    if (recorder?.isRecording()) recorder.stop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  function makeDir() {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sensor-dashboard-test-'));
    return dir;
  }

  it('writes a header row on start with the fixed column list', () => {
    recorder = createRecorder({ sessionsDir: makeDir() });
    const { file } = recorder.start();
    recorder.stop();
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    expect(content.split('\n')[0]).toBe(COLUMNS.join(','));
  });

  it('writes one row per write() call, flattening JOY and leaving missing keys empty', () => {
    recorder = createRecorder({ sessionsDir: makeDir() });
    const { file } = recorder.start();
    recorder.write({ ts: 100, data: { DIST: 23.4, JOY: { x: 512, y: 489 } }, raw: '' });
    recorder.write({ ts: 150, data: { PIR: 1 }, raw: '' });
    recorder.stop();

    const lines = fs.readFileSync(path.join(dir, file), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(3); // header + 2 rows

    const row1 = lines[1].split(',');
    expect(row1[COLUMNS.indexOf('DIST')]).toBe('23.4');
    expect(row1[COLUMNS.indexOf('JOY_x')]).toBe('512');
    expect(row1[COLUMNS.indexOf('JOY_y')]).toBe('489');
    expect(row1[COLUMNS.indexOf('PIR')]).toBe(''); // absent that frame, not carried forward

    const row2 = lines[2].split(',');
    expect(row2[COLUMNS.indexOf('PIR')]).toBe('1');
    expect(row2[COLUMNS.indexOf('DIST')]).toBe(''); // not carried forward from row1 either
  });

  it('keeps TOUCH as a raw string, preserving leading zeros', () => {
    recorder = createRecorder({ sessionsDir: makeDir() });
    const { file } = recorder.start();
    recorder.write({ ts: 1, data: { TOUCH: '000000000001' }, raw: '' });
    recorder.stop();
    const row = fs.readFileSync(path.join(dir, file), 'utf8').trim().split('\n')[1].split(',');
    expect(row[COLUMNS.indexOf('TOUCH')]).toBe('000000000001');
  });

  it('throws on double-start and double-stop, never leaving a half-open stream', () => {
    recorder = createRecorder({ sessionsDir: makeDir() });
    recorder.start();
    expect(() => recorder.start()).toThrow('already recording');
    recorder.stop();
    expect(() => recorder.stop()).toThrow('not recording');
  });

  it('write() before start() or after stop() is a safe no-op (no throw, no file)', () => {
    recorder = createRecorder({ sessionsDir: makeDir() });
    expect(() => recorder.write({ ts: 1, data: { DIST: 1 }, raw: '' })).not.toThrow();
    expect(fs.existsSync(dir) ? fs.readdirSync(dir).length : 0).toBe(0);
  });

  it('survives a gap in write() calls (simulated source disconnect) with no crash and a clean resume', () => {
    // The real scenario: the Arduino/mock source stops emitting 'line' events (unplugged,
    // swapped, reflashed) while the Node process keeps running — server.js's line handler
    // simply stops calling recorder.write() for a while. recorder never sees a "disconnect"
    // event itself; this test simulates exactly that gap directly against recorder.write().
    recorder = createRecorder({ sessionsDir: makeDir() });
    const { file } = recorder.start();

    recorder.write({ ts: 100, data: { DIST: 10 }, raw: '' });
    recorder.write({ ts: 150, data: { DIST: 11 }, raw: '' });
    // ...gap: source disconnected, nothing calls write() for a while...
    recorder.write({ ts: 5000, data: { DIST: 12 }, raw: '' });

    const result = recorder.stop();
    expect(result.rows).toBe(3);

    const lines = fs.readFileSync(path.join(dir, file), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(4); // header + 3 rows, no fabricated gap-filler rows
    expect(lines[3].split(',')[COLUMNS.indexOf('DIST')]).toBe('12');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix backend test -- recorder.test.js`
Expected: FAIL with "Cannot find module './recorder.js'" (or similar — file doesn't exist yet)

- [ ] **Step 3: Implement `recorder.js`**

```js
// backend/src/recorder.js
import fs from 'node:fs';
import path from 'node:path';
import { KNOWN_MULTI, STRING_KEYS } from './parser.js';

// parser.js has no exhaustive list of scalar (single-value) protocol keys — unknown
// keys deliberately pass through untouched there, for extensibility (see CLAUDE.md).
// That means "which top-level keys exist" can't be derived from parser.js without
// changing its pass-through design, so it's declared here by hand — a third
// hand-maintained list of protocol keys alongside PROTOCOL_SPEC.md and parser.js's
// KNOWN_MULTI/STRING_KEYS. What *is* shared from parser.js: JOY's sub-key names (so
// the JOY_x/JOY_y flattening isn't redeclared) and which keys must stay raw strings
// (TOUCH) rather than being treated as numeric cells. Update SCALAR_KEYS by hand
// whenever a new single-value sensor key is added to the protocol.
const SCALAR_KEYS = ['DIST', 'PIR', 'ROLL', 'PITCH', 'YAW'];
const MULTI_COLUMNS = Object.entries(KNOWN_MULTI).flatMap(([key, subs]) =>
  subs.map((sub) => ({ column: `${key}_${sub}`, key, sub })),
);
const STRING_COLUMNS = [...STRING_KEYS];

// `ts` is the Arduino's millis() and resets to ~0 on any board reset (power blip,
// reflash) mid-recording, while `recvTs` (server-side Date.now()) never resets — a
// session spanning a board reset will show `ts` jump backward even though nothing is
// corrupted. Use `recvTs` for real elapsed time; treat `ts` as relative-to-this-boot only.
export const COLUMNS = [
  'ts',
  'recvTs',
  ...SCALAR_KEYS,
  ...MULTI_COLUMNS.map((c) => c.column),
  ...STRING_COLUMNS,
];

export const FILENAME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.csv$/;

function csvEscape(value) {
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function formatRow(parsed) {
  const row = { ts: parsed.ts ?? '', recvTs: Date.now() };
  for (const key of SCALAR_KEYS) row[key] = parsed.data[key] ?? '';
  for (const { column, key, sub } of MULTI_COLUMNS) row[column] = parsed.data[key]?.[sub] ?? '';
  for (const key of STRING_COLUMNS) row[key] = parsed.data[key] ?? '';
  return COLUMNS.map((c) => csvEscape(row[c])).join(',');
}

/**
 * Creates a CSV session recorder scoped to `sessionsDir`. Only one recording can be
 * active at a time; write() is a safe no-op when inactive so callers (server.js) can
 * call it unconditionally on every parsed frame without checking state first.
 */
export function createRecorder({ sessionsDir }) {
  let stream = null;
  let file = null;
  let rows = 0;

  function isRecording() {
    return stream !== null;
  }

  function currentFile() {
    return file;
  }

  function start() {
    if (stream) throw new Error('already recording');
    fs.mkdirSync(sessionsDir, { recursive: true });
    const name = `${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
    stream = fs.createWriteStream(path.join(sessionsDir, name));
    stream.write(COLUMNS.join(',') + '\n');
    file = name;
    rows = 0;
    return { file };
  }

  function write(parsed) {
    if (!stream) return;
    stream.write(formatRow(parsed) + '\n');
    rows += 1;
  }

  function stop() {
    if (!stream) throw new Error('not recording');
    const result = { file, rows };
    stream.end();
    stream = null;
    file = null;
    rows = 0;
    return result;
  }

  return { start, write, stop, isRecording, currentFile };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix backend test -- recorder.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit** (bundled with Task 3 — see that task's commit step; a bare `recorder.js` isn't wired to anything yet, so it isn't a meaningful standalone checkpoint)

---

## Task 3: Wire recording into `server.js`

**Files:**
- Modify: `backend/src/config.js`
- Modify: `backend/src/server.js`
- Create: `backend/src/server.recording.test.js`

- [ ] **Step 1: Add `SESSIONS_DIR` to config**

```js
// backend/src/config.js
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PORT = Number(process.env.PORT) || 8080;
export const SERIAL_SOURCE = process.env.SERIAL_SOURCE || 'mock';
export const SERIAL_PATH = process.env.SERIAL_PATH || '';
export const BAUD = Number(process.env.BAUD) || 115200;
export const FRAME_MS = Number(process.env.FRAME_MS) || 50;
export const SESSIONS_DIR = path.join(__dirname, '..', 'sessions');
```

- [ ] **Step 2: Write the failing integration tests**

```js
// backend/src/server.recording.test.js
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { createServer } from './server.js';

describe('server (CSV recording)', () => {
  let handle;
  let dir;

  afterEach(async () => {
    await handle?.close();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  async function start() {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sensor-dashboard-test-'));
    handle = createServer({ SERIAL_SOURCE: 'mock', FRAME_MS: 10, PORT: 0, SESSIONS_DIR: dir });
    await new Promise((resolve) => handle.server.listen(0, resolve));
    return handle.server.address().port;
  }

  it('start -> frames accumulate -> stop produces a downloadable CSV', async () => {
    const port = await start();

    const startRes = await fetch(`http://localhost:${port}/recording/start`, { method: 'POST' });
    expect(startRes.status).toBe(200);
    const { file } = await startRes.json();
    expect(file).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.csv$/);

    await new Promise((resolve) => setTimeout(resolve, 100)); // let a few mock frames land

    const stopRes = await fetch(`http://localhost:${port}/recording/stop`, { method: 'POST' });
    expect(stopRes.status).toBe(200);
    const stopBody = await stopRes.json();
    expect(stopBody.rows).toBeGreaterThan(0);

    const dlRes = await fetch(`http://localhost:${port}/sessions/${file}`);
    expect(dlRes.status).toBe(200);
    const text = await dlRes.text();
    expect(text.split('\n')[0]).toContain('DIST');
  });

  it('rejects starting a second recording while one is active', async () => {
    const port = await start();
    await fetch(`http://localhost:${port}/recording/start`, { method: 'POST' });
    const res = await fetch(`http://localhost:${port}/recording/start`, { method: 'POST' });
    expect(res.status).toBe(409);
  });

  it('rejects stopping when nothing is recording', async () => {
    const port = await start();
    const res = await fetch(`http://localhost:${port}/recording/stop`, { method: 'POST' });
    expect(res.status).toBe(409);
  });

  it('GET /sessions lists completed recordings', async () => {
    const port = await start();
    await fetch(`http://localhost:${port}/recording/start`, { method: 'POST' });
    await fetch(`http://localhost:${port}/recording/stop`, { method: 'POST' });
    const res = await fetch(`http://localhost:${port}/sessions`);
    const list = await res.json();
    expect(list).toHaveLength(1);
    expect(list[0]).toHaveProperty('size');
  });

  it('GET /sessions returns [] before any recording exists', async () => {
    const port = await start();
    const res = await fetch(`http://localhost:${port}/sessions`);
    expect(await res.json()).toEqual([]);
  });

  it('rejects a GET /sessions/:file with a path-traversal-shaped filename', async () => {
    const port = await start();
    const res = await fetch(`http://localhost:${port}/sessions/${encodeURIComponent('../../../etc/passwd')}`);
    expect(res.status).toBe(400);
  });

  it('status envelope reflects recording state to a newly connected client', async () => {
    const port = await start();
    await fetch(`http://localhost:${port}/recording/start`, { method: 'POST' });

    const ws = new WebSocket(`ws://localhost:${port}`);
    const status = await new Promise((resolve) => {
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'status') resolve(msg);
      });
    });
    ws.close();
    expect(status.recording).toBe(true);
    expect(status.sessionFile).toMatch(/\.csv$/);
  });

  it('closes cleanly even mid-recording (no open handles, recording auto-stopped)', async () => {
    const port = await start();
    await fetch(`http://localhost:${port}/recording/start`, { method: 'POST' });
    await expect(handle.close()).resolves.not.toThrow();
    handle = null;
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm --prefix backend test -- server.recording.test.js`
Expected: FAIL (404s — routes don't exist yet)

- [ ] **Step 4: Wire `recorder.js` into `server.js`**

Modify `backend/src/server.js`:

```js
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createSource, listPorts } from './sources/index.js';
import { parseLine } from './parser.js';
import { createRecorder, FILENAME_RE } from './recorder.js';
```

Inside `createServer(config)`, after `const source = createSource(config);`:

```js
  const recorder = createRecorder({ sessionsDir: config.SESSIONS_DIR });
```

Add the four routes (alongside the existing `/health` and `/ports` routes):

```js
  app.post('/recording/start', (req, res) => {
    try {
      const { file } = recorder.start();
      broadcast(currentStatus());
      res.json({ ok: true, file });
    } catch (err) {
      res.status(409).json({ ok: false, error: err.message });
    }
  });

  app.post('/recording/stop', (req, res) => {
    try {
      const { file, rows } = recorder.stop();
      broadcast(currentStatus());
      res.json({ ok: true, file, rows });
    } catch (err) {
      res.status(409).json({ ok: false, error: err.message });
    }
  });

  app.get('/sessions', (req, res) => {
    if (!fs.existsSync(config.SESSIONS_DIR)) return res.json([]);
    const files = fs
      .readdirSync(config.SESSIONS_DIR)
      .filter((name) => FILENAME_RE.test(name))
      .map((name) => {
        const stat = fs.statSync(path.join(config.SESSIONS_DIR, name));
        return { file: name, size: stat.size, mtime: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.mtime.localeCompare(a.mtime));
    res.json(files);
  });

  app.get('/sessions/:file', (req, res) => {
    if (!FILENAME_RE.test(req.params.file)) return res.status(400).json({ error: 'invalid filename' });
    const filePath = path.join(config.SESSIONS_DIR, req.params.file);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'not found' });
    res.download(filePath);
  });
```

Note: `currentStatus()` and `broadcast()` are defined further down in the current file (after `const server = ...`/`const wss = ...`); since these routes only reference them inside their handler closures (executed later, at request time, not at route-registration time), it's fine for the route registrations to appear before those `function` declarations — `function` declarations are hoisted within the module scope of `createServer`.

Update `currentStatus()`:

```js
  function currentStatus() {
    return {
      type: 'status',
      connected,
      port: sourcePort,
      dataRateHz,
      recording: recorder.isRecording(),
      sessionFile: recorder.currentFile(),
    };
  }
```

Update the `'line'` handler to feed the recorder:

```js
  source.on('line', (line) => {
    const parsed = parseLine(line);
    if (!parsed) return;
    frameCount += 1;
    recorder.write(parsed);
    broadcast({
      type: 'sensors',
      ts: parsed.ts,
      recvTs: Date.now(),
      data: parsed.data,
      raw: parsed.raw,
    });
  });
```

Update `close()` to stop an in-progress recording cleanly:

```js
  function close() {
    return new Promise((resolve, reject) => {
      clearInterval(rateTimer);
      if (recorder.isRecording()) recorder.stop();
      source.close();
      wss.close(() => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      for (const client of wss.clients) client.terminate();
    });
  }
```

- [ ] **Step 5: Update `index.js` (no code change needed — verify)**

`backend/src/index.js` already does `import * as config from './config.js'; createServer(config)`, so the new `SESSIONS_DIR` export is picked up automatically. No edit required — just confirm by reading the file that this holds.

- [ ] **Step 6: Run all backend tests to verify everything passes**

Run: `npm --prefix backend test`
Expected: PASS — all suites, including `recorder.test.js`, `server.recording.test.js`, and the pre-existing `server.test.js`/`parser.test.js`/`mockSource.test.js`/`sources/index.test.js`

- [ ] **Step 7: Commit**

```bash
git add backend/src/parser.js backend/src/recorder.js backend/src/recorder.test.js \
        backend/src/config.js backend/src/server.js backend/src/server.recording.test.js
git commit -m "$(cat <<'EOF'
feat(backend): CSV session recording (start/stop/list/download)

Adds recorder.js (isolated CSV writer, fixed column list derived from
parser.js's KNOWN_MULTI/STRING_KEYS where possible) plus four REST
routes and status-envelope fields, per the Phase 2 infrastructure
design doc.
EOF
)"
```

---

## Task 4: `registry.js` — widget key/history metadata

**Files:**
- Modify: `frontend/src/widgets/registry.js`

- [ ] **Step 1: Replace the static `visible` field with `keys`/`hasHistory`**

```js
import UltrasonicWidget from './UltrasonicWidget.jsx'
import PirWidget from './PirWidget.jsx'
import JoystickWidget from './JoystickWidget.jsx'
import Gy87Widget from './Gy87Widget.jsx'
import Mpr121Widget from './Mpr121Widget.jsx'

/**
 * Maps a widget id to its component + metadata. Adding a sensor widget later is a
 * one-line addition here plus a new widget file — no changes needed to Dashboard.jsx.
 * `keys` lists the sensor keys this widget's history depends on (used to clear the
 * right slice of history on "clear"). `hasHistory` is false only for widgets with no
 * time-series concept (MPR121 is a bitfield snapshot) — their clear-history control
 * is omitted rather than shown as a no-op. Visibility/expansion state is no longer
 * static here — it's lifted into App.jsx's widgetState (Phase 2 infrastructure).
 */
export const registry = [
  {
    id: 'ultrasonic',
    title: 'Ultrasonic (DIST)',
    accentColor: '#22d3ee',
    keys: ['DIST'],
    hasHistory: true,
    Component: UltrasonicWidget,
  },
  {
    id: 'pir',
    title: 'PIR Motion',
    accentColor: '#f97316',
    keys: ['PIR'],
    hasHistory: true,
    Component: PirWidget,
  },
  {
    id: 'joystick',
    title: 'Joystick (JOY)',
    accentColor: '#a78bfa',
    keys: ['JOY'],
    hasHistory: true,
    Component: JoystickWidget,
  },
  {
    id: 'gy87',
    title: 'GY-87 (Roll/Pitch/Yaw)',
    accentColor: '#34d399',
    keys: ['ROLL', 'PITCH', 'YAW'],
    hasHistory: true,
    Component: Gy87Widget,
  },
  {
    id: 'mpr121',
    title: 'MPR121 Touch',
    accentColor: '#2dd4bf',
    keys: ['TOUCH'],
    hasHistory: false,
    Component: Mpr121Widget,
  },
]
```

(No commit yet — this lands with the rest of Task 4-7, which together form one working checkpoint.)

---

## Task 5: `useSensorSocket.js` — pause + clearHistory + recording state

**Files:**
- Modify: `frontend/src/hooks/useSensorSocket.js`

- [ ] **Step 1: Replace the whole file**

```js
import { useEffect, useRef, useState, useCallback } from 'react'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080'
// 600 comfortably covers a 30s rolling window (PirWidget's strip) even at ~60ms cadence,
// while still bounding memory — never an unbounded array.
const HISTORY_CAP = 600
const RECONNECT_MIN_MS = 500
const RECONNECT_MAX_MS = 5000

/**
 * Connects to the backend WebSocket, auto-reconnecting with backoff, and exposes live
 * sensor state plus a bounded per-key history for charts (ring buffer, capped at
 * HISTORY_CAP points — never an unbounded array).
 *
 * `paused`: while true, incoming sensor frames are still received (connection/rate
 * stats keep updating) but are not applied to latestByKey/historyByKey/lastFrame, so
 * the UI visibly freezes without the socket itself pausing or dropping data server-side.
 */
export function useSensorSocket(paused = false) {
  const [connected, setConnected] = useState(false)
  const [port, setPort] = useState(null)
  const [dataRateHz, setDataRateHz] = useState(0)
  const [recording, setRecording] = useState(false)
  const [sessionFile, setSessionFile] = useState(null)
  const [lastFrame, setLastFrame] = useState(null)
  const [latestByKey, setLatestByKey] = useState({})
  const [historyByKey, setHistoryByKey] = useState({})

  const wsRef = useRef(null)
  const reconnectDelayRef = useRef(RECONNECT_MIN_MS)
  const reconnectTimerRef = useRef(null)
  const mountedRef = useRef(true)
  const pausedRef = useRef(paused)

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  const send = useCallback((obj) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj))
  }, [])

  const clearHistory = useCallback((keys) => {
    setHistoryByKey((prev) => {
      const next = { ...prev }
      for (const key of keys) delete next[key]
      return next
    })
  }, [])

  useEffect(() => {
    mountedRef.current = true

    function connect() {
      if (!mountedRef.current) return
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        reconnectDelayRef.current = RECONNECT_MIN_MS
      }

      ws.onclose = () => {
        if (!mountedRef.current) return
        setConnected(false)
        reconnectTimerRef.current = setTimeout(connect, reconnectDelayRef.current)
        reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, RECONNECT_MAX_MS)
      }

      ws.onerror = () => ws.close()

      ws.onmessage = (event) => {
        if (!mountedRef.current) return
        let msg
        try {
          msg = JSON.parse(event.data)
        } catch {
          return
        }

        if (msg.type === 'status') {
          setConnected(msg.connected)
          setPort(msg.port)
          setDataRateHz(msg.dataRateHz ?? 0)
          setRecording(msg.recording ?? false)
          setSessionFile(msg.sessionFile ?? null)
        } else if (msg.type === 'sensors') {
          if (pausedRef.current) return
          setLastFrame(msg)
          setLatestByKey((prev) => ({ ...prev, ...msg.data }))
          setHistoryByKey((prev) => {
            const next = { ...prev }
            for (const [key, value] of Object.entries(msg.data)) {
              if (typeof value !== 'number') continue
              const existing = next[key] ?? []
              const point = { t: msg.recvTs, v: value }
              next[key] = existing.length >= HISTORY_CAP
                ? [...existing.slice(existing.length - HISTORY_CAP + 1), point]
                : [...existing, point]
            }
            return next
          })
        }
      }
    }

    connect()

    return () => {
      mountedRef.current = false
      clearTimeout(reconnectTimerRef.current)
      wsRef.current?.close()
    }
  }, [])

  return {
    connected,
    port,
    dataRateHz,
    recording,
    sessionFile,
    lastFrame,
    latestByKey,
    historyByKey,
    clearHistory,
    send,
  }
}
```

---

## Task 6: `WidgetCard.jsx` — header controls

**Files:**
- Modify: `frontend/src/components/WidgetCard.jsx`

- [ ] **Step 1: Replace the whole file**

```jsx
const ICON_BUTTON_CLASS =
  'rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200'

/**
 * Generic card shell shared by all widgets: title bar + accent color + content slot +
 * header controls (expand, clear-history, hide). This component holds no state of its
 * own — callers (widget components, forwarding props threaded down from Dashboard.jsx)
 * own expanded/visibility state. A control button only renders if its handler is passed
 * (e.g. `onClear` is omitted for widgets with `hasHistory: false` in the registry).
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
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="mb-3 flex items-center justify-between">
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
      {children}
    </div>
  )
}

export default WidgetCard
```

---

## Task 7: Forward control props through the five widget components

**Files:**
- Modify: `frontend/src/widgets/UltrasonicWidget.jsx`
- Modify: `frontend/src/widgets/PirWidget.jsx`
- Modify: `frontend/src/widgets/JoystickWidget.jsx`
- Modify: `frontend/src/widgets/Gy87Widget.jsx`
- Modify: `frontend/src/widgets/Mpr121Widget.jsx`

Each of these is a mechanical two-line change: accept the new props, forward them into the `<WidgetCard>` call. Only `JoystickWidget` needs an extra `useEffect` to react to `resetToken`, because its trail lives in a local ref (`trailRef`) outside `historyByKey`.

- [ ] **Step 1: `UltrasonicWidget.jsx`**

Change:
```js
function UltrasonicWidget({ latestByKey, historyByKey }) {
```
to:
```js
function UltrasonicWidget({ latestByKey, historyByKey, expanded, onToggleExpand, onHide, onClear }) {
```

Change:
```jsx
    <WidgetCard title="Ultrasonic (DIST)" accentColor={ACCENT}>
```
to:
```jsx
    <WidgetCard
      title="Ultrasonic (DIST)"
      accentColor={ACCENT}
      expanded={expanded}
      onToggleExpand={onToggleExpand}
      onHide={onHide}
      onClear={onClear}
    >
```

- [ ] **Step 2: `PirWidget.jsx`**

Change:
```js
function PirWidget({ latestByKey, historyByKey }) {
```
to:
```js
function PirWidget({ latestByKey, historyByKey, expanded, onToggleExpand, onHide, onClear }) {
```

Change:
```jsx
    <WidgetCard title="PIR Motion" accentColor={ACCENT}>
```
to:
```jsx
    <WidgetCard
      title="PIR Motion"
      accentColor={ACCENT}
      expanded={expanded}
      onToggleExpand={onToggleExpand}
      onHide={onHide}
      onClear={onClear}
    >
```

- [ ] **Step 3: `JoystickWidget.jsx`**

Change:
```js
function JoystickWidget({ latestByKey }) {
```
to:
```js
function JoystickWidget({ latestByKey, resetToken, expanded, onToggleExpand, onHide, onClear }) {
```

Add a new effect (place it next to the existing `latestByKey.JOY` effect, before the canvas-drawing effect):
```js
  // JOY's {x,y} shape lives in a local ref, not historyByKey — clearHistory() alone
  // can't reach it, so react to resetToken directly to wipe the trail on "clear".
  useEffect(() => {
    trailRef.current = []
  }, [resetToken])
```

Change:
```jsx
    <WidgetCard title="Joystick (JOY)" accentColor={ACCENT}>
```
to:
```jsx
    <WidgetCard
      title="Joystick (JOY)"
      accentColor={ACCENT}
      expanded={expanded}
      onToggleExpand={onToggleExpand}
      onHide={onHide}
      onClear={onClear}
    >
```

- [ ] **Step 4: `Gy87Widget.jsx`**

Change:
```js
function Gy87Widget({ latestByKey, historyByKey }) {
```
to:
```js
function Gy87Widget({ latestByKey, historyByKey, expanded, onToggleExpand, onHide, onClear }) {
```

Change:
```jsx
    <WidgetCard title="GY-87 (Roll/Pitch/Yaw)" accentColor={ACCENT}>
```
to:
```jsx
    <WidgetCard
      title="GY-87 (Roll/Pitch/Yaw)"
      accentColor={ACCENT}
      expanded={expanded}
      onToggleExpand={onToggleExpand}
      onHide={onHide}
      onClear={onClear}
    >
```

- [ ] **Step 5: `Mpr121Widget.jsx`**

Change:
```js
function Mpr121Widget({ latestByKey }) {
```
to:
```js
function Mpr121Widget({ latestByKey, expanded, onToggleExpand, onHide }) {
```

Change:
```jsx
    <WidgetCard title="MPR121 Touch" accentColor={ACCENT}>
```
to:
```jsx
    <WidgetCard
      title="MPR121 Touch"
      accentColor={ACCENT}
      expanded={expanded}
      onToggleExpand={onToggleExpand}
      onHide={onHide}
    >
```

(No `onClear` prop here at all — `registry.js`'s `hasHistory: false` for `mpr121` means `Dashboard.jsx`, in Task 9, never passes an `onClear` handler down to this component in the first place.)

---

## Task 8: `Dashboard.jsx` — visibility filter + expand wrapper + control wiring

**Files:**
- Modify: `frontend/src/components/Dashboard.jsx`

- [ ] **Step 1: Replace the whole file**

```jsx
import { registry } from '../widgets/registry.js'

function Dashboard({ latestByKey, historyByKey, widgetState, onToggleExpand, onHide, onClearHistory }) {
  const visible = registry.filter((w) => widgetState[w.id]?.visible)

  return (
    <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
      {visible.map(({ id, Component, hasHistory }) => {
        const state = widgetState[id]
        return (
          <div key={id} className={state.expanded ? 'sm:col-span-2 lg:col-span-3' : ''}>
            <Component
              latestByKey={latestByKey}
              historyByKey={historyByKey}
              expanded={state.expanded}
              onToggleExpand={() => onToggleExpand(id)}
              onHide={() => onHide(id)}
              onClear={hasHistory ? () => onClearHistory(id) : undefined}
              resetToken={state.resetToken}
            />
          </div>
        )
      })}
    </div>
  )
}

export default Dashboard
```

---

## Task 9: `App.jsx` — own `widgetState` and `paused`, wire everything together

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Replace the whole file**

```jsx
import { useMemo, useState } from 'react'
import { useSensorSocket } from './hooks/useSensorSocket.js'
import { registry } from './widgets/registry.js'
import ConnectionBar from './components/ConnectionBar.jsx'
import Sidebar from './components/Sidebar.jsx'
import Dashboard from './components/Dashboard.jsx'

function initialWidgetState() {
  return Object.fromEntries(
    registry.map((w) => [w.id, { visible: true, expanded: false, resetToken: 0 }]),
  )
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

  function toggleExpand(id) {
    setWidgetState((prev) => ({ ...prev, [id]: { ...prev[id], expanded: !prev[id].expanded } }))
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
            onToggleExpand={toggleExpand}
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

- [ ] **Step 2: Manual verification (mock mode)**

Run: `SERIAL_SOURCE=mock npm --prefix backend run dev` (one terminal), `npm --prefix frontend run dev` (another terminal), open the printed Vite URL.

Expected:
- All 5 widgets render as before, each with expand/clear/hide icons in its header.
- Clicking a card's expand icon grows it to full grid width; clicking again shrinks it back.
- Clicking a card's clear icon empties its chart/log (Joystick's trail included) without affecting other widgets.
- Clicking a card's × hides it (it disappears from the grid).
- No console errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/widgets/registry.js frontend/src/hooks/useSensorSocket.js \
        frontend/src/components/WidgetCard.jsx frontend/src/widgets/UltrasonicWidget.jsx \
        frontend/src/widgets/PirWidget.jsx frontend/src/widgets/JoystickWidget.jsx \
        frontend/src/widgets/Gy87Widget.jsx frontend/src/widgets/Mpr121Widget.jsx \
        frontend/src/components/Dashboard.jsx frontend/src/App.jsx
git commit -m "$(cat <<'EOF'
feat(frontend): per-widget controls (expand/clear/hide), stateful visibility

Lifts widget visible/expanded/resetToken state out of the static
registry into App.jsx and threads control handlers through
WidgetCard.jsx and all five widget components. Sidebar.jsx (visibility
nav) lands in the next commit — this checkpoint is fully working on
its own via each card's own hide (x) button.
EOF
)"
```

Note: this commit references `Sidebar.jsx`, which doesn't exist until Task 10 — `App.jsx`'s `import Sidebar from './components/Sidebar.jsx'` will fail to build until that file exists. **Do Task 10 before running the Step 2 manual verification or committing Task 9** (the two tasks are interdependent; verify and commit them together as shown at the end of Task 10 instead of separately, if working strictly file-by-file). The step ordering above assumes you create `Sidebar.jsx` first — see Task 10 — then come back and verify/commit both together.

---

## Task 10: `Sidebar.jsx` — widget visibility nav

**Files:**
- Create: `frontend/src/components/Sidebar.jsx`

- [ ] **Step 1: Create the file**

```jsx
/**
 * Left nav listing every registered widget with a show/hide checkbox. Visibility state
 * lives in App.jsx (widgetState) — this component is a dumb list bound to it, driving
 * the same shared state a widget card's own hide (x) button also updates.
 */
function Sidebar({ registry, widgetState, onToggleVisible }) {
  return (
    <aside className="w-48 shrink-0 border-r border-neutral-800 bg-neutral-900 p-3">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Widgets
      </h2>
      <ul className="space-y-1">
        {registry.map((w) => (
          <li key={w.id}>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={widgetState[w.id]?.visible ?? true}
                onChange={() => onToggleVisible(w.id)}
              />
              {w.title}
            </label>
          </li>
        ))}
      </ul>
    </aside>
  )
}

export default Sidebar
```

- [ ] **Step 2: Now perform Task 9's manual verification**

Same steps as Task 9 Step 2, plus: confirm the sidebar checkbox for a widget and that widget's own × button stay in sync (unchecking in the sidebar hides the card; re-checking brings it back).

- [ ] **Step 3: Commit (Task 9 + Task 10 together, per the note above)**

```bash
git add frontend/src/widgets/registry.js frontend/src/hooks/useSensorSocket.js \
        frontend/src/components/WidgetCard.jsx frontend/src/widgets/UltrasonicWidget.jsx \
        frontend/src/widgets/PirWidget.jsx frontend/src/widgets/JoystickWidget.jsx \
        frontend/src/widgets/Gy87Widget.jsx frontend/src/widgets/Mpr121Widget.jsx \
        frontend/src/components/Dashboard.jsx frontend/src/App.jsx \
        frontend/src/components/Sidebar.jsx
git commit -m "$(cat <<'EOF'
feat(frontend): per-widget controls (expand/clear/hide) and visibility sidebar

Lifts widget visible/expanded/resetToken state out of the static
registry into App.jsx, threads control handlers through WidgetCard.jsx
and all five widget components, and adds a Sidebar nav for toggling
widget visibility — both the sidebar checkbox and each card's own
hide (x) button drive the same shared state.
EOF
)"
```

---

## Task 11: `ConnectionBar.jsx` — pause/resume, record/stop, sessions list

**Files:**
- Modify: `frontend/src/components/ConnectionBar.jsx`

- [ ] **Step 1: Replace the whole file**

```jsx
import { useEffect, useRef, useState } from 'react'

const API_BASE = (import.meta.env.VITE_WS_URL || 'ws://localhost:8080').replace(/^ws/, 'http')

/**
 * `recording` is driven by the WS status envelope (via App.jsx / useSensorSocket), not
 * local component state — that way it reflects true backend state (correct after a
 * page reload, a second browser tab, or a backend restart mid-session) rather than
 * just the last button click.
 */
function ConnectionBar({ connected, port, dataRateHz, paused, onTogglePause, recording }) {
  const [sessions, setSessions] = useState([])
  const [showSessions, setShowSessions] = useState(false)
  const [busy, setBusy] = useState(false)
  const prevRecording = useRef(recording)

  async function refreshSessions() {
    try {
      const res = await fetch(`${API_BASE}/sessions`)
      setSessions(await res.json())
    } catch {
      // backend unreachable — leave the last-known list in place
    }
  }

  useEffect(() => {
    refreshSessions()
  }, [])

  useEffect(() => {
    if (prevRecording.current && !recording) refreshSessions() // just stopped — pick up the new file
    prevRecording.current = recording
  }, [recording])

  async function toggleRecording() {
    setBusy(true)
    try {
      await fetch(`${API_BASE}/recording/${recording ? 'stop' : 'start'}`, { method: 'POST' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3 border-b border-neutral-800 bg-neutral-900 px-4 py-2 text-sm">
      <span
        className={`h-2.5 w-2.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500'}`}
        aria-hidden="true"
      />
      <span className="font-medium text-neutral-100">
        {connected ? 'Connected' : 'Disconnected'}
      </span>
      <span className="text-neutral-500">·</span>
      <span className="text-neutral-400">source: {port ?? 'unknown'}</span>
      <span className="text-neutral-500">·</span>
      <span className="text-neutral-400">{dataRateHz.toFixed(0)} Hz</span>

      <span className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onTogglePause}
          className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800"
        >
          {paused ? 'Resume' : 'Pause'}
        </button>

        <button
          type="button"
          onClick={toggleRecording}
          disabled={busy}
          className={`rounded border px-2 py-1 text-xs hover:bg-neutral-800 disabled:opacity-50 ${
            recording ? 'border-red-600 text-red-400' : 'border-neutral-700 text-neutral-200'
          }`}
        >
          {recording ? '● Stop' : 'Record'}
        </button>

        <span className="relative">
          <button
            type="button"
            onClick={() => setShowSessions((s) => !s)}
            className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800"
          >
            Sessions ({sessions.length})
          </button>
          {showSessions && (
            <div className="absolute right-0 z-10 mt-1 w-56 rounded border border-neutral-800 bg-neutral-900 p-2 shadow-lg">
              {sessions.length === 0 ? (
                <div className="text-xs text-neutral-500">No sessions yet</div>
              ) : (
                <ul className="space-y-1">
                  {sessions.map((s) => (
                    <li key={s.file}>
                      <a
                        href={`${API_BASE}/sessions/${s.file}`}
                        className="block truncate text-xs text-cyan-400 hover:underline"
                        download
                      >
                        {s.file}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </span>
      </span>
    </div>
  )
}

export default ConnectionBar
```

- [ ] **Step 2: Manual verification (mock mode)**

With both dev servers running from Task 9/10's verification:
- Click **Pause**: charts/values freeze; the connection dot and Hz counter keep updating; button now reads **Resume**.
- Click **Resume**: charts pick back up from the next live frame.
- Click **Record**: button turns into **● Stop** (red); after a few seconds click **Stop** — button reverts to **Record**, and the **Sessions (N)** count increments.
- Click **Sessions**: dropdown lists the file; clicking it downloads a `.csv` with a header row and populated data rows (open it and confirm `DIST`/`PIR`/etc. columns have values, `TOUCH` preserves leading zeros, and empty cells appear for keys not present in a given frame).
- Reload the page mid-recording (start a recording, then refresh the browser tab): **● Stop** should still show as active immediately, proving `recording` comes from the server's status envelope and not local state.
- No console errors, no failed network requests (check via `read_network_requests` / `read_console_messages` in the browser preview).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ConnectionBar.jsx
git commit -m "$(cat <<'EOF'
feat(frontend): pause/resume and CSV record controls in the top bar

Pause freezes chart/value updates while the connection indicator and
data rate keep reflecting the live socket. Recording state is read
from the WS status envelope (not local button state) so it stays
correct across reloads and reconnects. Completes the Phase 2
infrastructure design doc's Part 3.
EOF
)"
```

---

## Task 12: Update `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Document the new REST routes and status fields**

Add to the "WebSocket message contract" section's Status example, updating it to show the two new fields:

```markdown
Status (server → client, on connect + periodically):
```json
{ "type": "status", "connected": true, "port": "mock", "dataRateHz": 20, "recording": false, "sessionFile": null }
```
```

Add a new short section documenting the recording REST routes (placed after the WebSocket contract section):

```markdown
## CSV session recording (Phase 2)

- `POST /recording/start` → `{ ok, file }` (409 if already recording)
- `POST /recording/stop` → `{ ok, file, rows }` (409 if not recording)
- `GET /sessions` → `[{ file, size, mtime }]`
- `GET /sessions/:file` → downloads the CSV
- Files land in `backend/sessions/<timestamp>.csv` (gitignored). Columns are a fixed
  list (`ts, recvTs, DIST, PIR, JOY_x, JOY_y, TOUCH, ROLL, PITCH, YAW`) declared in
  `backend/src/recorder.js` — a key not in that list is dropped from CSV rows (still
  visible live in the UI). `ts` is the Arduino's `millis()` and resets to ~0 on any
  board reset mid-recording; `recvTs` (server receive time) never resets — use it for
  real elapsed time across a session that spans a reboot.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record CSV recording REST contract and status-envelope fields in CLAUDE.md"
```

---

## Self-Review Notes (already applied above)

- **Spec coverage**: Part 1 (recorder.js + routes) → Tasks 2–3. Part 2 (state lifting,
  WidgetCard, 5 widgets, Dashboard) → Tasks 4–9. Part 3 (Sidebar, ConnectionBar) →
  Tasks 10–11. All three user-requested refinements (ts/recvTs comment, parser.js
  metadata reuse, disconnect-gap test) are in Task 2. CLAUDE.md update in Task 12
  matches the project's own convention of keeping that file as the durable contract.
- **Placeholder scan**: no TBD/TODO left; every step has literal code.
- **Type/prop consistency check**: `onClear` is only ever passed where `hasHistory` is
  true (enforced once, in `Dashboard.jsx`'s Task 8) — individual widget files (Task 7)
  just forward whatever they're given, so `Mpr121Widget` receiving `undefined` for
  `onClear` (since it doesn't even accept the prop) is correct, not an oversight.
  `resetToken` is threaded to all five widgets for uniformity but only consumed by
  `JoystickWidget` — intentional per the design doc, not dead plumbing elsewhere (it's
  cheap to pass, and keeps every widget's prop signature symmetric).
