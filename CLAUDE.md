# CLAUDE.md

Durable contract for this repo. Keep this file short and factual — update it whenever the
protocol, layout, or run instructions change.

## Layout

```
arduino/     Arduino sketch(es), flashed via Arduino IDE.app (GUI, human-run)
backend/     Express + ws + serialport bridge. ESM ("type": "module"). Node LTS runtime.
  src/config.js       env-driven constants (PORT, SERIAL_SOURCE, SERIAL_PATH, BAUD, FRAME_MS)
  src/parser.js       pure protocol parser (serial line -> object), unit-tested
  src/sources/        serial source abstraction: mockSource.js (default) / serialSource.js (lazy)
  src/server.js       Express + WebSocket broadcast
  sessions/           gitignored CSV session logs (Phase 2+)
frontend/    React + Vite + Tailwind + Recharts. JavaScript (JSX), not TypeScript.
  src/hooks/useSensorSocket.js   WS client hook: connect, reconnect, bounded history
  src/widgets/                   registry.js + one widget component per sensor
  src/components/                shared UI (ConnectionBar, WidgetCard, Dashboard)
```

## Runtime

- Node LTS pinned via `.nvmrc` (currently `24`, installed as v24.18.0 via `nvm install 24`).
  Node 25 is end-of-life (2026-06-01) and must never be the dev runtime.
- Run `nvm use` in the repo root before any backend/frontend command.
- `serialport` is a normal backend dependency but is **only ever `import()`ed lazily** inside
  `serialSource.js`, never at module top level — mock mode and all tests stay native-free.

## Serial protocol — Arduino → Backend (one line per ~50ms cycle, `Serial.println`, 115200 baud)

```
PIR:1,DIST:23.4,JOY:512:489,TOUCH:100000000000,ROLL:12.3,PITCH:-4.5,YAW:89.0,TS:10234
```

- `KEY:VALUE` pairs, comma-separated. Multi-value fields use nested colons (`JOY:X:Y`).
- `TOUCH` is always a 12-char bitfield string — never coerced to a number (leading zeros matter).
- `TS` is Arduino `millis()`, pulled into a separate `ts` field, not duplicated in `data`.
- Unknown keys pass through untouched. Adding a sensor = adding a key — no core parser changes
  needed unless it's a new multi-value shape (add to `KNOWN_MULTI` in `parser.js`).
- Duplicate keys in one line: last one wins.
- Malformed/empty lines never throw; they're skipped or return `null`.

## Control protocol — Backend → Arduino (plain strings written over serial, Phase 3+)

```
SERVO:90
STEPPER:FWD:200
FAN:ON
PUMP:OFF
```

Validated against an allowlist of verbs/arg-shapes before writing. Not wired to serial until
Phase 3 (Phase 1/2 backend only logs inbound `command` messages).

## WebSocket message contract (`ws://localhost:8080` by default)

Sensor frame (server → client):
```json
{ "type": "sensors", "ts": 10234, "recvTs": 1735000000000, "data": { "DIST": 23.4 }, "raw": "DIST:23.4,TS:10234" }
```

Status (server → client, on connect + periodically):
```json
{ "type": "status", "connected": true, "port": "mock", "dataRateHz": 20 }
```

Command (client → server, Phase 3+):
```json
{ "type": "command", "cmd": "SERVO", "args": ["90"] }
```

## Working principles (binding for this project)

1. **One sensor/actuator at a time**: wire → code → verify → commit → next. Don't build ahead.
2. **Read-only before read-write**: the control (write) channel is not wired to serial until
   the sensor (read) pipeline is fully solid (Phase 3 only, after Phase 2 is done).
3. **Verify at the lowest level first when debugging**: Serial Monitor → Node console →
   WebSocket → React. Whichever rung breaks localizes the failing layer.
4. **Commit after each working checkpoint.**

## Running: mock vs. real

- **Mock** (default, no hardware): `SERIAL_SOURCE=mock npm --prefix backend run dev`. Emits
  synthetic protocol lines on an interval — the permanent fast build/test/CI path.
- **Real**: `SERIAL_SOURCE=real SERIAL_PATH=/dev/cu.usbmodemXXXX npm --prefix backend run dev`.
  Find the port via `GET /ports` or `ls /dev/cu.usbmodem*` (use `cu.`, not `tty.`, for writing).
- **Single-owner port**: the Arduino IDE Serial Monitor, a `screen` session, and the Node
  backend cannot hold the same port simultaneously — close one before starting another.
- Board = Arduino Uno R4 (Minima/WiFi), requires the **Renesas core** (`arduino:renesas_uno`),
  not the classic AVR core.

## Hardware bring-up notes

Verified end-to-end (Phase 1 Session 2, Steps 1.12–1.14) with a physical Uno R4 + HC-SR04:

- **Port pattern seen**: `/dev/cu.usbmodem3CDC7545DB0C2` (the exact suffix is per-device/per-USB-port;
  always re-run `ls /dev/cu.usbmodem*` or `GET /ports` rather than assuming this literal path).
- **Node version used for real mode**: v24.18.0 (the pinned `.nvmrc` LTS) — `serialport` loaded
  and streamed cleanly, no native-build issues.
- **Wiring used (current, post-PIR-addition)**: HC-SR04 VCC→5V, GND→GND, Trig→pin 3, Echo→pin 4;
  PIR VCC→5V, GND→GND, OUT→pin 2 (see header comment in
  `arduino/sensor_dashboard/sensor_dashboard.ino`). Trig/Echo were originally on A1/A2 during
  the Phase 1 DIST-only bring-up and were moved to digital pins 3/4 when PIR was added.
- **Sensor floor is ~2cm**: the sketch only emits `DIST:` when `2 < distance < 400`; readings
  at/below 2cm are dropped rather than emitted as noise — by design (also roughly the HC-SR04's
  physical minimum range), not a parsing or wiring bug.
- **`DIST` and `PIR` are decoupled**: `PIR` (and `TS`) are appended to every line regardless of
  whether the ultrasonic reading was valid that cycle; `DIST:` is simply omitted (not zeroed)
  when out of range. A line can therefore look like `PIR:0,TS:12345` (no `DIST`) or
  `DIST:23.4,PIR:0,TS:12345`. The parser and frontend already handle a missing key on a given
  frame by keeping the last known value — verified real lines of both shapes parsed correctly
  and neither dropped nor corrupted the other sensor's data.
- Verified the full ladder twice — once for DIST-only (Phase 1), once again after adding PIR
  (Phase 2): raw serial monitor showed correct frames → backend in `SERIAL_SOURCE=real` mode
  parsed them (`/health` reported `connected:true`, source `real`) → the browser widgets
  tracked the physical sensors live (Ultrasonic chart moved with a hand in front of the
  HC-SR04; PIR widget flipped to "Motion detected" and logged the event with a hand wave).
