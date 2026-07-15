# PLAN.md

> Execution plan for **Claude Code Sonnet 4.6**. Read this end-to-end before writing any code.
> This is a greenfield build. Follow the phases and substeps in order. **Commit after every green checkpoint.**

---

## 1. Objective

Build a modular, widget-based browser dashboard ("Grafana for Arduino") that:

- Streams live sensor data from an Arduino Uno R4 to a React frontend in real time (Monitor mode).
- Sends control commands from the browser back to the Arduino (Control mode).
- Logs sessions for later analysis (CSV first, SQLite optional later).

Data flow: **Arduino (C++) ⇄ Node serial bridge (serialport) ⇄ WebSocket ⇄ React (Recharts + Tailwind)**.

**Hardware is available and will be used to verify the real pipeline.** The Arduino is not plugged in *right now*, but the human can attach it on demand. Therefore the plan uses a **two-track verification model**:
- **Mock serial source** = the fast, always-available build/test/CI path so Sonnet is never blocked waiting on a physical board (build the whole pipeline, pass unit + integration tests, then).
- **Real hardware** = the true end-to-end proof. Flashing the Uno R4 and verifying via a live serial stream is a **first-class part of Phase 1's exit criteria**, not a deferred afterthought. Some flashing/serial-monitor steps are human-run (Arduino IDE is a GUI app), but they are required, not optional.

Scope of *this* execution pass: **Phase 1 (end-to-end pipeline with ultrasonic) fully built, tested, and committed**, plus scaffolding and clearly-specified stubs for Phases 2–4. Do **not** attempt to build all sensors/actuators in one pass — the project's core working principle is *one sensor/actuator at a time, verified, then commit*.

---

## 2. Repo Instructions / Local Rules

- **No instruction files exist.** There is no `AGENTS.md`, `agents.md`, `CLAUDE.md`, `claude.md`, or any workflow doc in the repo, and no `~/.claude/CLAUDE.md`. There are therefore no repo-specific rules to obey or conflict with.
- **The user request itself defines the binding working principles** — treat these as the local rules for this project:
  1. **One sensor/actuator at a time**: wire → code → verify → commit → next.
  2. **Read-only before read-write**: do not build or wire the control (write) channel until the sensor (read) pipeline is fully solid.
  3. **Verify at the lowest level first when debugging**: Serial Monitor → Node console → WebSocket → React. This ordering tells you which layer broke.
  4. **Commit after each working checkpoint.**
- **Action for Sonnet**: Because these principles are the de-facto project rules and there is no existing doc, **create a `CLAUDE.md` at repo root as part of Phase 0** capturing (a) the monorepo layout, (b) the serial protocol, (c) the WebSocket message contract, (d) the four working principles, and (e) how to run in mock vs. real mode. This becomes the durable contract for future sessions. Keep it short and factual.

---

## 3. Current-State Understanding

- Repository root: `/Users/amrith/Documents/Documents - Kishore's MacBook Pro/Amrith/Sensor Dashboard` (note the space and smart apostrophe in the path — always quote paths in shell commands).
- `git status`: on `main`, **no commits yet**, clean. `origin` → `https://github.com/CodingMastermind123/Sensor-Dashboard.git`.
- Local toolchain: **Node v25.6.0**, **npm 11.11.0**. macOS (darwin), zsh. **Note: Node 25 reached end-of-life on 2026-06-01 and no longer receives security patches — it must NOT be the dev runtime.** Phase 0 switches the runtime to an LTS (Node 24 Active LTS, or Node 22 Maintenance LTS) via `nvm` before any backend code is written. All commands below assume the LTS runtime is active.
- Serial ports at recon: only `/dev/tty.Bluetooth-Incoming-Port`, `/dev/tty.BoseQCHeadphones`, `/dev/tty.debug-console`. **No `/dev/tty.usbmodem*` yet** — the Arduino is not plugged in at this moment, but the human will attach it. On macOS an **Uno R4 enumerates as `/dev/cu.usbmodemXXXX`** (use the `cu.` device for writing/serialport, not `tty.`).
- **Arduino tooling present**: `Arduino IDE.app` is installed at `/Applications/Arduino IDE.app`. **No `arduino-cli`** (installable via the available Homebrew at `/opt/homebrew/bin/brew` if CLI flashing is wanted). **`screen` is available** at `/usr/bin/screen` for a terminal serial monitor.
- **Uno R4 board core**: requires the **Arduino Renesas core** (`arduino:renesas_uno`) — NOT the classic AVR core. The human must have this board package installed in the Arduino IDE before flashing.
- Nothing else exists — every file below is new.

**Serial protocol (from the request), Arduino → Dashboard, one line per 50 ms cycle:**
```
PIR:1,DIST:23.4,JOY:512:489,TOUCH:100000000000,ROLL:12.3,PITCH:-4.5,YAW:89.0,TS:10234
```
- `KEY:VALUE`, comma-separated. Multi-value fields use nested colons (`JOY:X:Y`). `TOUCH` is a 12-char bitfield. `TS` is Arduino `millis()`. Adding a sensor = adding a key.

**Control protocol, Dashboard → Arduino (plain strings written over serial):**
```
SERVO:90
STEPPER:FWD:200
FAN:ON
PUMP:OFF
```

**Widget mapping (target end state):** PIR→event log + status pulse; Ultrasonic→live line graph; Joystick→2D canvas dot; MPR121→12-pad touch grid; GY-87→3-channel graph (roll/pitch/yaw); Servo→slider; Stepper→dir+speed; Fan→toggle; Pump→toggle + timed pulse; Keypad→last key + history.

---

## 4. Assumptions and Open Questions

Proceed with these assumptions (do not block on them):

1. **Monorepo, npm workspaces not required.** Use three sibling folders (`arduino/`, `backend/`, `frontend/`) plus root-level `package.json` scripts for convenience. Do **not** introduce a monorepo tool (turbo/nx/pnpm) — keep it plain npm.
2. **Backend framework**: Express + `ws` + `serialport` (+ `@serialport/parser-readline`), CommonJS or ESM — **use ESM (`"type": "module"`)** to match the modern Node LTS runtime and Vite. Keep consistent across backend.
3. **Frontend**: React 18 + Vite + Tailwind CSS + Recharts, JavaScript (not TypeScript) unless trivially cheap — the request lists no TS and the prior project (StudyBot) is the familiarity anchor; **default to JS/JSX** to reduce friction. If you prefer TS, it is acceptable but must be applied consistently and must not delay Phase 1.
4. **Serial source is abstracted** behind an interface so a **mock generator** can replace the real port. Selection via env var `SERIAL_SOURCE=mock|real` (default `mock` in dev). This is what makes the build verifiable with no hardware.
5. **WebSocket message contract** (you own defining it; use this): JSON envelopes
   - Sensor frame: `{ "type": "sensors", "ts": <arduinoMillis|null>, "recvTs": <serverEpochMs>, "data": { "DIST": 23.4, "PIR": 1, "JOY": {"x":512,"y":489}, ... }, "raw": "<original line>" }`
   - Command (client→server): `{ "type": "command", "cmd": "SERVO", "args": ["90"] }`
   - Status/meta (server→client): `{ "type": "status", "connected": true, "port": "mock", "dataRateHz": 20 }`
6. **Runtime is a supported Node LTS (24 or 22), not Node 25** — switched via `nvm` in Phase 0 (Step 0.0). `serialport` ships prebuilt binaries for LTS releases, so the native build is expected to just work. **Independently of Node version, keep `serialport` as a lazily-`import()`ed dependency only loaded when `SERIAL_SOURCE=real`** — this is good architecture (mock mode and all unit/integration tests never touch native code, so `npm install` + mock mode stay fast and portable), not a workaround for a bad runtime.
7. **Ports**: backend HTTP+WS on `8080`, Vite dev server on `5173` (Vite default). Frontend connects to `ws://localhost:8080`. Make the WS URL configurable via `frontend` env (`VITE_WS_URL`).
8. **CSV logging** first (Phase 2); SQLite deferred. Log files go to `backend/sessions/` (gitignored).
9. **Baud rate** `115200` for the real Arduino (fast enough for 50 ms frames). Make it a config constant. The sketch's `Serial.begin(115200)` and the backend `BAUD` must match exactly.
10. **Hardware flashing is human-run via Arduino IDE.app** (GUI). Sonnet writes the sketch and precise flash/verify instructions; the human selects board = *Arduino Uno R4 Minima/WiFi* (Renesas core), selects the `cu.usbmodem*` port, and uploads. Optionally, if the human wants a scriptable path, `brew install arduino-cli` enables `arduino-cli compile/upload -b arduino:renesas_uno` — but do not assume it; default to IDE.
11. **Serial port is single-owner.** Only one process can hold the port. The Arduino IDE Serial Monitor, a `screen` session, and the Node backend **cannot** open the same port simultaneously — close the monitor before starting the backend in real mode, and vice-versa. Bake this into the debug ladder instructions.

Open questions to verify while implementing (best-effort defaults chosen above; only revisit if something breaks):
- Exact serialport package major version — install the current stable major on the chosen Node LTS and confirm it loads at install time; if a specific LTS has an issue, use the other LTS (24 ↔ 22).
- Whether the human wants TS — assume no.

---

## 5. Risks / Edge Cases

**System / build**
- **Node runtime must be an LTS, not Node 25**: Node 25 hit end-of-life on 2026-06-01 (no security patches) and is not a valid dev runtime — this is a prerequisite, not a fallback. **Phase 0 Step 0.0 switches to Node 24 (Active LTS) or Node 22 (Maintenance LTS) via `nvm` before any backend code exists.** On an LTS, `serialport` has prebuilt binaries and native install is expected to succeed. Verify once after switching: `node -e "import('serialport').then(m=>console.log('ok', !!m.SerialPort))"`. If the chosen LTS has any issue loading it, use the other LTS (24 ↔ 22) and record which one in `CLAUDE.md`. Keep `serialport` lazy-loaded regardless, so mock mode and all tests stay green independent of the native binary — but this is architecture, not a hedge against a stale runtime.
- **Serial port contention**: backend, IDE Serial Monitor, and `screen` cannot share the `cu.usbmodem*` port. A "port busy / access denied" error almost always means another process holds it — close the other first.
- **Uno R4 wrong core**: flashing with the AVR core instead of `arduino:renesas_uno` will fail or misbehave — verify the board selection.
- **ESM/CJS mismatch**: mixing `require` and `import` will crash. Pick ESM everywhere in backend and keep it consistent.
- **Path has spaces + a smart apostrophe** (`Kishore's`): always quote paths in shell; never `cd` inside compound commands (can trigger prompts).

**Protocol parsing (highest-value correctness area)**
- Partial/torn serial lines: `parser-readline` handles line framing, but the first chunk after connect may be a partial line — the parser must skip malformed lines gracefully, never throw.
- Unknown keys: must pass through, not crash (extensibility requirement).
- Multi-value fields (`JOY:512:489`): must not be parsed as `JOY:512` dropping `489`.
- `TOUCH:100000000000`: keep as a 12-char string/bitfield, do **not** coerce to a number (leading-zero / precision loss).
- Numeric coercion: `DIST:23.4` → float, `PIR:1` → int, but a stray non-numeric must not become `NaN` silently propagated to charts. Decide: keep raw string if not parseable, and flag.
- Missing `TS`, empty line, trailing comma, whitespace, `\r\n` vs `\n` line endings (Arduino `Serial.println` emits `\r\n`) — trim.
- Duplicate keys in one line — last wins (document it).

**Frontend / UX**
- Recharts re-render cost at 20 Hz with unbounded history → memory growth and jank. **Cap history** (ring buffer, e.g. last N=300 points per channel) and throttle chart updates.
- WebSocket reconnect: dev server restarts, backend restarts, laptop sleep. Client must auto-reconnect with backoff and reflect state in the connection bar.
- Pause/resume must stop UI updates without dropping the socket (or must clearly define whether it also stops logging).
- Stale data: if frames stop, the "current value" should visually indicate staleness rather than showing a frozen number as if live.

**Control channel (Phase 3) — do not build until Phase 2 is solid**
- Writing to a closed/absent serial port must fail safe (return error to client, surface in UI), never crash the backend.
- Command injection / malformed command strings — validate against an allowlist of command verbs and argument shapes before writing to serial.
- No hardware attached → control has nothing to verify against; provide a mock "command echo/loopback" so control widgets can be built and tested in mock mode.

---

## 6. Implementation Plan

Phases map to the request's build order. **Phase 1 is the deliverable for this pass and must be fully green + committed.** Phases 2–4 are specified for continuity but built one unit at a time in later sessions.

### Phase 0 — Repo scaffold & conventions (foundational)

**Step 0.0 — Node runtime prerequisite (do this FIRST, before any code).**
- Purpose: Node 25 is end-of-life (2026-06-01) and must not be the dev runtime. Switch to a supported LTS so the whole project — including the `serialport` native build — runs on a patched, prebuilt-supported runtime.
- Action: use `nvm` to install and activate an LTS — **Node 24 (Active LTS) preferred, or Node 22 (Maintenance LTS)**: e.g. `nvm install 24 && nvm use 24` (or `22`). If `nvm` is not installed, install it first (`brew install nvm` + shell setup, or the official install script).
- Pin the version for the repo: add a `.nvmrc` at repo root containing the major (`24` or `22`) so future sessions and contributors get the same runtime via `nvm use`.
- Verify: `node -v` shows the chosen LTS. Record the exact version in `CLAUDE.md`.
- DoD: active `node -v` is an LTS (24.x or 22.x), `.nvmrc` committed, version noted in `CLAUDE.md`. **Do not proceed to backend code on Node 25.**

**Step 0.1 — Root scaffold.**
- Purpose: establish monorepo layout and shared conventions.
- Create:
  - `.gitignore` (root): `node_modules/`, `dist/`, `.env`, `.env.local`, `backend/sessions/`, `*.log`, `.DS_Store`. (Note: `.env.example` is NOT matched by the `.env` pattern and stays checked in.)
  - `.env.example` (root, checked-in template): document every configurable var with placeholder/default values and a one-line comment each — **backend**: `PORT=8080`, `SERIAL_SOURCE=mock`, `SERIAL_PATH=` (e.g. `/dev/cu.usbmodemXXXX` in real mode), `BAUD=115200`, `FRAME_MS=50`; **frontend**: `VITE_WS_URL=ws://localhost:8080`. Real `.env`/`.env.local` files stay gitignored; contributors copy this template. Note in the file (or README) that Vite only reads `VITE_`-prefixed vars and expects them under `frontend/` (`frontend/.env`), while backend vars belong to the backend process env — keep the split clear even though the template lists both.
  - `README.md` (root): one-paragraph project description + "Quick start" (mock mode) + folder map. Mention copying `.env.example` and the Node LTS requirement (`nvm use`).
  - `CLAUDE.md` (root): the durable contract described in §2 (layout, serial protocol, WS contract, 4 working principles, mock-vs-real run instructions).
  - Root `package.json` with convenience scripts only (no deps): `"dev": "npm --prefix backend run dev & npm --prefix frontend run dev"`, `"dev:backend"`, `"dev:frontend"`, `"test": "npm --prefix backend test"`. Note: the `&` combo is convenience; document running the two servers in separate terminals as the reliable path.
- Definition of done: files exist; `git add -A` shows the scaffold; nothing runs yet.

**Step 0.2 — Directory skeleton.**
- Create empty dirs with `.gitkeep` where needed: `arduino/`, `backend/src/`, `frontend/src/`, `backend/sessions/` (gitkeep, gitignored contents).
- DoD: `find . -type d -not -path './.git/*'` shows the intended tree.

**Commit checkpoint C0**: `chore: scaffold monorepo layout, gitignore, CLAUDE.md contract`.

---

### Phase 1 — End-to-end pipeline (ultrasonic only)

Goal: prove **Arduino → Node → WebSocket → React** with a single sensor (`DIST`), verifiable entirely in **mock mode** with no hardware. This is the backbone every later phase reuses.

#### 1A. Backend serial bridge

**Step 1.1 — Backend package init.**
- Precondition: Step 0.0 done — active runtime is a Node LTS (24 or 22), not Node 25.
- Files: `backend/package.json` (`"type": "module"`), deps: `express`, `ws`, `cors`; dev deps: `vitest`, `nodemon`. Add `serialport` (+ `@serialport/parser-readline`) as a normal dependency — on the LTS runtime its prebuilt binary installs cleanly. Regardless, it must **never be imported at top level** (only lazily inside the real serial source, Step 1.6). Verify `npm install` succeeds.
- DoD: `npm --prefix backend install` completes clean on the LTS runtime.

**Step 1.2 — Config module.** `backend/src/config.js`
- Export constants read from env with defaults: `PORT=8080`, `SERIAL_SOURCE=(process.env.SERIAL_SOURCE || 'mock')`, `SERIAL_PATH=(process.env.SERIAL_PATH || '')`, `BAUD=115200`, `FRAME_MS=50`.
- DoD: importable, no side effects.

**Step 1.3 — Protocol parser (pure, unit-tested FIRST).** `backend/src/parser.js`
- Export `parseLine(line: string): { data: object, ts: number|null, raw: string } | null`.
- Behavior (encode all §5 parsing rules):
  - Trim, strip `\r`. Return `null` for empty/whitespace-only lines.
  - Split on `,`; each token split on `:` — first segment is KEY, remainder is the value list.
  - Single value → coerce: integer-looking → int, float-looking → float, else keep string.
  - **Special-case `TOUCH`**: keep as string (preserve leading zeros / 12-char width).
  - **Multi-value** (`JOY:512:489`): map known multi-value keys to named shape (`JOY → {x,y}`); unknown multi-value keys → array of coerced values.
  - `TS` → pulled out into the `ts` field (int) and also left out of / kept in `data` consistently (document choice; recommend: `ts` separate, not duplicated in `data`).
  - Unknown keys pass through untouched (extensibility).
  - Never throw; malformed token is skipped, not fatal.
- Maintain a small `KNOWN_MULTI = { JOY: ['x','y'] }` and `STRING_KEYS = new Set(['TOUCH'])` so extension is a one-line change (matches the "adding a sensor is adding a key" ethos).
- **This module is the highest-risk correctness surface — write its tests before wiring anything (see Testing Plan 1.T1).**
- DoD: unit tests pass for all cases in §5.

**Step 1.4 — Serial source abstraction.** `backend/src/sources/index.js` + two impls.
- Define a common interface: a source is an `EventEmitter` (or async iterator) that emits `'line'` (string) and `'status'` events and exposes `write(str)` (used in Phase 3) and `close()`.
- `backend/src/sources/mockSource.js`: emits a synthetic protocol line every `FRAME_MS`. For Phase 1, emit realistic `DIST` values (e.g., a slow sine or random walk between 5–200 cm) plus `TS` = incrementing millis. Keep it easy to extend to more keys later. **No native deps.**
- `backend/src/sources/serialSource.js`: **lazy** `const { SerialPort } = await import('serialport'); const { ReadlineParser } = await import('@serialport/parser-readline');` inside a `start()` — so mock mode never loads native code. Wire `ReadlineParser({ delimiter: '\n' })`, emit `'line'` per line, emit `'status'` on open/close/error.
- `sources/index.js`: factory `createSource(config)` returns mock or real based on `SERIAL_SOURCE`.
- DoD: `createSource({SERIAL_SOURCE:'mock'})` emits parseable lines; unit test asserts an emitted line parses to an object containing `DIST`.

**Step 1.5 — Server: HTTP + WebSocket broadcast.** `backend/src/server.js` (+ `backend/src/index.js` entry).
- Create Express app; **apply CORS middleware before the routes** — `app.use(cors())` (or scope it to the Vite dev origin, e.g. `cors({ origin: 'http://localhost:5173' })`) so `GET /health` and `GET /ports` are fetchable from the frontend origin (`cors` is already a dependency from Step 1.1). Note: the WebSocket connection itself is not subject to CORS, but the REST helper routes are — without this, browser `fetch` to them fails.
- Add the health route `GET /health` → `{ok:true, source, connected}`, and attach the `ws` server on the same HTTP server.
- On startup: `createSource()`, subscribe to `'line'` → `parseLine` → if non-null, wrap in the **sensor envelope** (§4.5) and broadcast JSON to all WS clients. Drop nulls.
- Track and periodically broadcast a `status` envelope (connected state, source name, measured `dataRateHz` = frames counted per second).
- On new WS client connect: immediately send current `status`.
- Handle incoming client messages: for Phase 1, accept and ignore `command` messages (log them) — **do not wire to serial write yet** (read-only-before-read-write principle). Leave a clearly-marked `// Phase 3: route to source.write()` stub.
- Graceful shutdown on SIGINT: close source + WS + HTTP.
- Add `dev` script: `nodemon src/index.js`; `start`: `node src/index.js`.
- DoD: `SERIAL_SOURCE=mock npm --prefix backend run dev` logs frames; `GET /health` returns ok; a raw WS client (e.g., a tiny node script or `wscat`) receives `sensors` envelopes ~20/s.

**Step 1.6 — Real-serial wiring (code-complete, hardware-deferred).**
- Ensure `serialSource.js` is complete and would work with a real port; in this pass it is exercised for real in sub-phase 1H once the board is connected. Provide a listing helper: `GET /ports` → lazy `SerialPort.list()` for the human to pick the port. Guard so it returns a friendly error if `serialport` fails to load for any reason, rather than crashing.
- DoD: code reviewed for correctness; mock mode unaffected; `/ports` returns an array or a clear error, never crashes.

**Commit checkpoint C1a**: `feat(backend): serial bridge with mock source, protocol parser, WS broadcast`.

#### 1B. Frontend raw pipeline

**Step 1.7 — Frontend scaffold.** `frontend/`
- `npm create vite@latest frontend -- --template react` (JS). Then add Tailwind (`tailwindcss @tailwindcss/postcss` or the current Tailwind-Vite plugin — use the current official Vite install path), Recharts. Configure Tailwind dark theme (`darkMode: 'class'` or default dark palette). Verify `npm --prefix frontend run dev` serves the starter.
- Add `.env` support: `VITE_WS_URL=ws://localhost:8080`.
- DoD: Vite dev server renders; Tailwind classes apply.

**Step 1.8 — WebSocket hook.** `frontend/src/hooks/useSensorSocket.js`
- Custom hook: connects to `VITE_WS_URL`, parses incoming JSON, exposes `{ connected, lastFrame, dataRateHz, port, latestByKey, send }`.
- **Auto-reconnect with backoff** (e.g., 0.5s → cap 5s), cleanup on unmount, no leaks (guard against setState after unmount).
- Maintain a **bounded history** per key (ring buffer, cap ~300) for charts — but keep this in the hook or a small store; do not keep unbounded arrays.
- `send(obj)` serializes and sends command envelopes (used Phase 3; harmless now).
- DoD: hook returns live `latestByKey.DIST` updating ~20/s in mock mode.

**Step 1.9 — Phase-1 raw display + connection bar.** `frontend/src/App.jsx`, `frontend/src/components/ConnectionBar.jsx`
- Connection bar (top): source/port name, connection state (colored dot), live data rate (Hz). Reflects hook state.
- Below it, for Phase 1: a raw readout — current `DIST` (large number) and a **live Recharts line chart** of `DIST` over time (this doubles as the first real "Ultrasonic widget" and de-risks charting early). Show min/max and last-updated timestamp.
- Dark theme styling via Tailwind. Keep it minimal but not ugly — this is meant to look like a tool.
- DoD: with backend in mock mode, the number and chart update smoothly; connection bar shows connected + ~20 Hz; killing the backend flips the bar to disconnected and it auto-recovers on restart.

**Step 1.10 — Widget architecture seed (so Phase 2 is additive).** `frontend/src/widgets/`
- Establish the pattern **now**, even with one widget, so later sensors are drop-in:
  - `widgets/registry.js`: maps a sensor key (or logical widget id) → widget component + metadata (title, accent color, data selector).
  - `widgets/UltrasonicWidget.jsx`: the DIST line-graph card (extract from Step 1.9). Standard card chrome: name, big current value, graph, min/max, last-reading timestamp.
  - A generic `WidgetCard.jsx` shell providing the card frame + per-widget controls placeholders (show/hide, expand, clear history) wired minimally or stubbed with TODOs clearly marking Phase 2.
  - A responsive CSS-grid `Dashboard.jsx` that renders registered/visible widgets.
- Do **not** build other sensors' widgets yet — just the registry + one real widget + the grid. This directly serves modularity/extensibility.
- DoD: Ultrasonic widget renders through the registry/grid; adding a second entry later requires only a new file + registry line.

**Commit checkpoint C1b**: `feat(frontend): WS hook, connection bar, ultrasonic widget via registry`.

**Step 1.11 — Arduino protocol spec (human writes the sketch).** `arduino/PROTOCOL_SPEC.md`
- **Change from original plan**: the human is writing `arduino/sensor_dashboard/sensor_dashboard.ino` themselves, for C++ practice. Claude Code does **not** generate the `.ino` file.
- Instead, Claude Code writes `arduino/PROTOCOL_SPEC.md`: a precise, backend-derived spec of exactly what the sketch must emit — baud rate, line format/timing, exact key names + value types the parser recognizes this phase, line-ending expectations, parser edge cases that matter at the sketch level, and an HC-SR04 wiring reference (non-prescriptive on pin choice).
- `arduino/sensor_dashboard/` stays an empty directory (tracked via `.gitkeep`) until the human adds the sketch.
- **Review gate**: once the human shares the sketch, Claude Code reviews it for protocol compliance and correctness (matches `PROTOCOL_SPEC.md`, compiles clean, wiring documented) before committing C1c — Claude Code does not write the sketch, only reviews it.
- DoD: `PROTOCOL_SPEC.md` present and precise enough that a sketch written against it parses correctly against `parser.js` with zero parser changes.

**Commit checkpoint C1c**: `docs(arduino): protocol spec for human-authored ultrasonic sketch` (spec only). A follow-up commit adds the human-written, Claude-reviewed sketch once shared.

#### 1H. Real-hardware bring-up (human-in-the-loop — the true Phase-1 proof)

**This is a SEPARATE SESSION from the software track above.** Treat commit **C1c** (software track fully green + committed) as a clean stopping point and end the session there. Sub-phase 1H (Steps 1.12–1.14, commit C1d) is a new session that **assumes the human is physically at their desk with the Uno R4 connected** — it is interactive, human-gated, and cannot be done unattended. Starting it presupposes: mock track green and committed, and `ls /dev/cu.usbmodem*` shows a connected board.

Do this **after** mock mode is fully green and committed, so any failure here is isolated to the hardware/serial layer, not the software. Follow the **low-level-first debug ladder** — verify each rung before climbing:

**Step 1.12 — Flash + Serial Monitor (rung 1: is the Arduino emitting correct frames?).**
- Human action: open `Arduino IDE.app`, ensure the **Uno R4 Renesas board package** is installed (Boards Manager → "Arduino UNO R4"), open `arduino/sensor_dashboard/sensor_dashboard.ino`, select the correct board + `cu.usbmodem*` port, **Upload**.
- Verify with the IDE **Serial Monitor at 115200** (or `screen /dev/cu.usbmodem* 115200`, exit with `Ctrl-A K`): confirm lines like `DIST:23.4,TS:10234` stream ~20/s and distance changes when you move a hand in front of the sensor.
- Sonnet's role: detect the port programmatically to hand the human the exact device path — `ls /dev/cu.usbmodem*` (also expose it via the backend `/ports` route once real mode is up). **Close the Serial Monitor/screen before the next step** (single-owner port).
- DoD: correct, changing frames visible in a raw serial monitor. If not → the bug is in wiring or the sketch; do not proceed.

**Step 1.13 — Real serial source in Node (rung 2: does Node read + parse it?).**
- Confirm the runtime is the Node LTS from Step 0.0 (`node -v`) and that serialport loads (`node -e "import('serialport').then(m=>console.log('ok'))"`). On the LTS this should already pass from Step 1.1; if not, switch between the two LTS lines (24 ↔ 22) via `nvm` and reinstall backend deps.
- Run backend in real mode: `SERIAL_SOURCE=real SERIAL_PATH=/dev/cu.usbmodemXXXX npm --prefix backend run dev`. Watch the Node console log parsed objects containing `DIST` and a numeric `ts`.
- DoD: Node console shows parsed frames from the real board; `/health` reports `connected:true`, source `real`.

**Step 1.14 — WebSocket + React on real data (rungs 3 & 4: end-to-end).**
- With the backend in real mode, open the frontend. Confirm the connection bar shows the real `cu.usbmodem*` port + live Hz, and the Ultrasonic widget's number/chart track the physical sensor as you move your hand.
- DoD: **full physical pipeline proven** — moving a hand in front of the HC-SR04 visibly moves the chart in the browser.

**Commit checkpoint C1d** (docs only): `docs: record verified real-hardware bring-up steps and port in CLAUDE.md` — capture the exact board package, port pattern, Node version used for real mode, and any wiring notes discovered.

**Phase 1 exit criteria — split across two sessions:**

- **Session 1 — Software track (ends at commit C1c):** Node LTS runtime active (Step 0.0); parser unit tests green; backend broadcasts valid envelopes ~20 Hz in mock mode; frontend shows live number + chart + connection bar; reconnect works; registry/grid in place; integration tests green; Arduino sketch written flash-ready; everything committed through C1c. **This is a complete, self-contained deliverable and a natural stopping point** — the board does not need to be plugged in to reach it.
- **Session 2 — Hardware track (Steps 1.12–1.14, ends at commit C1d):** a separate, human-attended session that assumes the Uno R4 is physically connected. Sketch flashed to the board; correct frames in a raw serial monitor; backend real mode parses them; the browser Ultrasonic widget tracks the physical sensor live; bring-up notes recorded in `CLAUDE.md`.

Phase 1 is fully done only after both sessions complete. Do not block or fail Session 1 on hardware availability.

---

### Phase 2 — Sensor widgets (one at a time)

Order (matches request): confirm ultrasonic solid → **PIR → Joystick → MPR121 → GY-87**. For **each** sensor repeat this loop and commit between each:

1. **Extend the mock source** to also emit that sensor's key(s), so the widget is buildable/testable without hardware.
2. **Extend the parser** (usually just add to `KNOWN_MULTI` / `STRING_KEYS` or nothing — most keys need no change) and add a parser unit test for the new key shape.
3. **Add a widget** file + one line in `widgets/registry.js`:
   - PIR → **event-log + status pulse** component (timestamped on/off list, green/red pulse). *Not a line chart* (per request — on/off events don't need one).
   - Joystick → **2D canvas** dot moving in X/Y space (use `<canvas>`, requestAnimationFrame, driven by `latestByKey.JOY`).
   - MPR121 → **12-pad grid**, highlight active pads from the `TOUCH` 12-char bitfield (index = pad). Verify bit order with the human against real hardware later.
   - GY-87 → **3-channel Recharts** line (roll/pitch/yaw), color-coded channels.
4. **Update the Arduino sketch** to append that sensor's `KEY:VALUE` (I2C init for GY-87/MPR121). Note the shared I2C bus (A4/A5) and **flag the GY-87 vs MPR121 address-conflict check** as a hardware step for the human.
5. Verify in mock mode (and, when the human has hardware, in real mode via the low-level-first debug ladder), then **commit**.

**Also in Phase 2 (infrastructure, build once, reuse):**
- **Pause/resume**: global "pause all / resume all" that freezes UI updates (define whether logging continues — recommend: pause = freeze UI only; recording is a separate control).
- **Per-widget controls**: show/hide, expand-to-full-width, clear-graph-history (finish the stubs from 1.10).
- **Sidebar/nav** to toggle widget visibility.
- **CSV session logging + export**: backend writes each frame to `backend/sessions/<timestamp>.csv` when recording is on; frontend has start/stop recording + a download/export path. Header row = union of keys seen; document how new keys mid-session are handled (recommend: fixed header decided at start, or JSON-lines fallback).
- **Color-coded accents per channel**; polish dark UI.
- Detailed design + implementation plan for the four items above:
  `docs/superpowers/specs/2026-07-15-phase2-infrastructure-design.md` and
  `docs/superpowers/plans/2026-07-15-phase2-infrastructure.md`.

**Do not start Phase 3 until every Phase 2 sensor widget works and the read pipeline is rock-solid.**

---

### Phase 3 — Control widgets (reverse channel, one at a time)

Only after Phase 2 is solid (read-only-before-read-write principle).

1. **Enable the write channel**: implement the Phase-1 stub in `server.js` — validate incoming `command` envelopes against an **allowlist** of verbs/arg-shapes (`SERVO:0-180`, `STEPPER:FWD|REV:<int>`, `FAN:ON|OFF`, `PUMP:ON|OFF`), then `source.write(commandString + '\n')`. Reject invalid commands with an error envelope back to the sender.
2. **Mock loopback**: mock source's `write()` echoes an acknowledgement (and optionally reflects state into its emitted frames) so control widgets are testable with no hardware.
3. **Fail-safe writes**: writing when no port is open returns a clear error to the UI; never crash.
4. Build control widgets **one at a time**, commit between each: Servo (slider 0–180) → Fan (toggle) → Pump (toggle + timed pulse) → Stepper (dir + steps/sec) → Keypad (last key + history; keypad is input-logging, read side).
5. Extend the Arduino sketch to **parse inbound command lines** and drive actuators — clearly separated from the sensor-emit loop. Document wiring per actuator.

---

### Phase 4 — Polish + gimbal integration

Specified for later; not this pass:
- Widget reordering (drag), session replay from logged CSV/SQLite, threshold alerts.
- **GY-87 roll/pitch/yaw live stream** while moving the gimbal to spot drift/noise visually.
- **PID tuning panel**: send PID constants from dashboard over the control channel (no re-flash).
- **Expected-vs-actual servo angle overlay** to evaluate stabilization.
- Optional SQLite migration for logging. **Electron wrapper explicitly deferred — do not build it.**

---

## 7. Testing Plan

**Test framework**: Vitest for backend (and optionally frontend). Add `"test": "vitest run"` to `backend/package.json`.

### Phase 1 (must all pass before committing C1x / declaring Phase 1 done)

- **1.T1 Parser unit tests** — `backend/src/parser.test.js` (write BEFORE `parser.js` is wired anywhere):
  - Full-line example from the spec parses to expected object; `JOY` → `{x:512,y:489}`; `TOUCH` stays the 12-char string; `TS` extracted as int.
  - Empty line / whitespace / trailing comma / `\r\n` line ending → no throw, sane result (`null` for empty).
  - Unknown key passes through. Malformed token skipped, not fatal. `DIST:23.4` → float, `PIR:1` → int. Non-numeric value kept as string, not `NaN`.
  - Duplicate key → last wins.
- **1.T2 Mock source test** — emits a line on an interval that `parseLine` turns into an object containing `DIST` and a numeric `ts`.
- **1.T3 Server/WS integration test** — start server with `SERIAL_SOURCE=mock` on an ephemeral port, connect a WS client in-test, assert ≥1 `sensors` envelope arrives within ~500 ms with the expected shape, and a `status` envelope on connect. Assert `GET /health` → ok. Close cleanly (no open-handle leaks).
- **1.T4 Manual mock E2E (the low-level-first ladder)** — run backend in mock mode, then frontend; confirm: connection bar shows connected + ~20 Hz; DIST number + chart update; min/max/last-updated correct.
- **1.T5 Reconnect regression** — with frontend open, kill backend → bar shows disconnected within a couple seconds; restart backend → auto-reconnects and resumes without refresh.
- **1.T6 Runtime + native-module check** — confirm `node -v` is the Node LTS from Step 0.0 (not 25), and that `npm --prefix backend install` + mock mode run **without** loading `serialport` native code (mock never imports it). Separately confirm `serialport` itself loads on the LTS (`node -e "import('serialport').then(m=>console.log('ok'))"`) so real mode is ready.
- **1.T7 Lint/build** — `npm --prefix frontend run build` succeeds (no Vite/Tailwind config errors); no console errors in the browser during a 1-minute run.

### Phase 2+ (per sensor, repeat)
- Add a parser unit test for each new key shape (esp. `TOUCH` bitfield indexing, `JOY` scaling, GY-87 signed floats).
- Extend mock source; verify the new widget renders and updates in mock mode.
- **CSV logging test**: record a short session in mock mode, assert a well-formed CSV with a header and rows; export/download works; new-key-mid-session behavior matches the documented choice.
- Pause/resume: assert UI freezes/thaws; define + verify logging behavior during pause.
- Regression: existing widgets still update after adding a new one (registry additive, no cross-talk).

### Phase 3 (control)
- Allowlist validation unit tests: valid commands accepted, out-of-range/malformed rejected with an error envelope; no serial write on invalid input.
- Mock loopback: sending `SERVO:90` yields an ack; UI reflects it.
- Fail-safe: command with no port open returns error, backend stays up.

### Hardware verification (available — part of Phase 1 exit; see Steps 1.12–1.14)
- **Low-level-first ladder every time**: Arduino **Serial Monitor** (`screen /dev/cu.usbmodem* 115200` or IDE monitor) shows correct frames → **Node console** (real mode) logs parsed objects → **WS** client receives envelopes → **React** widget updates. Whichever rung breaks localizes the failing layer. Remember the **single-owner port** rule — only one of {monitor, backend} may hold the port at a time.
- Flashing is human-run via Arduino IDE.app with the **Uno R4 Renesas core**; select the `cu.usbmodem*` port.
- Runtime must be a Node LTS (24 or 22) per Step 0.0, never Node 25; confirm `serialport` loads on it before real mode (`node -e "import('serialport')..."`). If one LTS misbehaves, use the other (24 ↔ 22).
- I2C bring-up (Phase 2, GY-87/MPR121): run an I2C scanner sketch; **check GY-87 vs MPR121 address conflict on the shared A4/A5 bus** before wiring both.

---

## 8. Validation Checklist for Sonnet (before declaring a checkpoint done)

- [ ] Active runtime is a Node LTS (24 or 22), not Node 25 (`node -v`); `.nvmrc` present.
- [ ] `npm --prefix backend install` and `npm --prefix frontend install` succeed on the LTS runtime.
- [ ] `npm --prefix backend test` (Vitest) is green, including all parser edge cases.
- [ ] `npm --prefix frontend run build` succeeds; no browser console errors during a live mock run.
- [ ] Mock-mode E2E works: connection bar, live DIST value, live chart, min/max, timestamp.
- [ ] WebSocket auto-reconnect verified (kill/restart backend).
- [ ] `serialport` is never imported in mock mode; `/ports` and real mode degrade gracefully if native load fails.
- [ ] **Real-hardware track (Phase 1 exit)**: sketch flashed to Uno R4; correct frames in a raw serial monitor; backend real mode parses them; browser Ultrasonic widget tracks the physical sensor live; bring-up notes recorded in `CLAUDE.md`.
- [ ] serialport confirmed loading on the LTS runtime (real mode ready); exact LTS version recorded in `CLAUDE.md`.
- [ ] No unbounded arrays feeding Recharts (history is capped).
- [ ] Control channel is NOT wired to serial until Phase 3 (Phase 1/2 only log inbound commands).
- [ ] Widget registry + grid in place so new sensors are additive (no core edits needed to add one).
- [ ] `CLAUDE.md` + `README.md` reflect actual run commands, protocol, and WS contract.
- [ ] No dead code / no half-wired stubs left unlabeled (Phase-N TODOs are explicit).
- [ ] A commit exists at each green checkpoint with a clear message.

## 9. Suggested Execution Order for Sonnet

**Split Phase 1 into two sessions. Do not attempt both in one pass.**

**Session 1 — Software track (no hardware required; ends at C1c):**
1. **Step 0.0 first**: switch runtime to Node LTS (24 or 22) via `nvm`, add `.nvmrc`. Then Phase 0 scaffold (`.gitignore`, `.env.example`, `README`, `CLAUDE.md`, root scripts, dirs) → **commit C0**.
2. Backend: `package.json` → `config.js` → **`parser.test.js` (write tests first)** → `parser.js` → `sources/` (mock first, real lazy) → `server.js`/`index.js` (with `app.use(cors())`). Run Vitest; get 1.T1–1.T3 green. Verify mock frames via a scratch WS client. → **commit C1a**.
3. Frontend: Vite+Tailwind+Recharts scaffold → `useSensorSocket` hook → connection bar → ultrasonic raw display → refactor into `widgets/` registry + grid. Verify E2E in mock mode (1.T4), reconnect (1.T5), build (1.T7). → **commit C1b**.
4. Arduino protocol spec (`arduino/PROTOCOL_SPEC.md`, no `.ino` file) → **commit C1c**. **Human writes the sketch** against the spec for C++ practice; Claude Code reviews it for protocol compliance and correctness once shared, then a follow-up commit adds it.
5. **Stop here.** Session 1 is a complete deliverable: the full software pipeline proven in mock mode, committed through C1c. Do not proceed to hardware unless the human is present with the board connected and the sketch has been written + reviewed.

**Session 2 — Hardware bring-up (separate, human-attended; requires the Uno R4 physically connected):**
6. Precheck: `node -v` is the LTS, mock track is green/committed, `ls /dev/cu.usbmodem*` shows a board. **Real-hardware bring-up (1H)**: human flashes via Arduino IDE (Uno R4 Renesas core) → verify raw serial monitor (rung 1) → backend real mode parses (rung 2) → browser widget tracks the physical sensor (rungs 3–4). Record notes in `CLAUDE.md` → **commit C1d**. Sequenced after the mock track so any failure is isolated to the hardware/serial layer.
7. Phase 1 done (both sessions complete). (Later work: Phase 2 sensors one at a time, then Phase 3, then Phase 4 — commit between every unit, one sensor/actuator per session where hardware is involved.)

Run the **two dev servers in separate terminals** (backend then frontend) for reliable local verification; the combined root `dev` script is convenience only.

## 10. Final Notes for Sonnet

- **Do the parser test-first.** It is the correctness heart of the whole system and cheap to get exactly right up front; every layer downstream trusts its output.
- **Mock mode is not a throwaway** — it is the permanent, fast build/test/CI path and the substrate for building every future widget. Keep it faithful to the real protocol and easy to extend (one place to add a key). **But mock is not the finish line: real hardware is available and Phase 1 isn't done until the physical HC-SR04 moves the browser chart** (Steps 1.12–1.14). Build+test on mock, then prove on hardware.
- **Sequence the two tracks deliberately**: get everything green on mock and committed *first*, then do hardware bring-up. That way a hardware-stage failure is unambiguously in the wiring/sketch/serial layer, honoring low-level-first debugging.
- **Single-owner serial port**: never run the backend real mode and a Serial Monitor/`screen` on the same port at once — close one before opening the other.
- **Respect the four working principles literally**: one unit at a time, read-only before read-write, low-level-first debugging, commit each checkpoint. Do not get tempted to scaffold all ten widgets at once — the registry makes later additions cheap, so there's no payoff to rushing.
- **Get off Node 25 in Step 0.0 before anything else** — it is end-of-life (2026-06-01) and unpatched. Run on a Node LTS (24 Active, or 22 Maintenance) via `nvm`, pinned by `.nvmrc`. On an LTS, `serialport`'s prebuilt binary installs cleanly, so the native build is a non-issue. Keep `serialport` lazy-loaded anyway — that keeps mock mode and tests native-free by design, not as a hedge against a bad runtime.
- **Quote every path** (the repo path contains a space and a smart apostrophe) and avoid `cd` inside compound shell commands.
- **Don't build Electron** (explicitly deferred) and don't add SQLite until Phase 4 — CSV first.
- When wiring real hardware later, the human owns the I2C address-conflict check (GY-87 vs MPR121 on A4/A5) and all flashing/Serial-Monitor verification — surface these as instructions, not as things you can execute here.
- Push to `origin` only if the human asks; commit locally at each checkpoint regardless.
