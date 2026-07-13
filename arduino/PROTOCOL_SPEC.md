# Arduino Protocol Spec

This spec is derived directly from what [`backend/src/parser.js`](../backend/src/parser.js)
and [`backend/src/config.js`](../backend/src/config.js) already implement and expect. It exists
so `arduino/sensor_dashboard/sensor_dashboard.ino` can be written by hand (see note below) and
parse correctly against `parser.js` with **zero changes to the parser**.

`sensor_dashboard.ino` currently emits `DIST` (Phase 1, flashed and verified on real hardware).
§8 below is the Phase 2 addendum for adding `PIR` to the same sketch.

## 1. Serial connection

- **Baud rate: `115200`** — call `Serial.begin(115200);` in `setup()`. This must match
  `backend/src/config.js`'s `BAUD` constant exactly, or every byte will be garbage on the
  backend side.
- Do not `Serial.print` anything before `Serial.begin()` has completed. Nothing should be
  written to the serial line until `setup()` finishes — the backend starts reading as soon as
  the port opens, and any pre-`setup()` noise (bootloader banners aside, which are a separate
  concern) would be handed to the parser as a malformed line.

## 2. Line format and timing

- One line per sensor-read cycle, terminated by `Serial.println(...)`.
- **Target cadence: ~50 ms per cycle** (`FRAME_MS` in `backend/src/config.js`, i.e. ~20 Hz).
  This isn't strictly enforced by the parser — it just parses whatever line arrives — but the
  frontend's data-rate readout and staleness detection assume roughly this cadence, so drifting
  far from it (e.g. only sending once a second) will make the UI look wrong even though nothing
  is technically broken.
- Format: comma-separated `KEY:VALUE` pairs, one line, no leading/trailing content other than
  the pairs themselves:
  ```
  DIST:23.4,TS:10234
  ```
- **Build the whole line in one buffer and print it once.** Don't call `Serial.print` once per
  key across multiple statements with no newline in between and expect the parser to cope with
  a line arriving in pieces — `Serial.println` should emit the entire frame as a single write,
  terminated by exactly one newline. (See §4 on why partial lines are risky.)

## 3. Keys recognized this phase

Only two keys are parsed meaningfully in Phase 1. Everything else is a stub for later phases —
don't emit them yet.

| Key    | Example    | Parses as                | Notes |
|--------|-----------|---------------------------|-------|
| `DIST` | `DIST:23.4` | JavaScript `number` (float) | Distance in cm from the HC-SR04. Any string matching `-?\d+` or `-?\d*\.\d+` is coerced to a number; anything else (e.g. `DIST:NaN` or `DIST:err`) is kept as the literal string `"NaN"`/`"err"` and **will visually break the chart** (Recharts will just not plot a non-numeric point) — see §5, never send a non-numeric `DIST`. |
| `TS`   | `TS:10234`  | Pulled out into a separate `ts` field (int), **not** left in `data` | Must be `millis()` — a plain non-negative integer, no decimal point. If `TS` is present but not a clean integer, the backend sets `ts: null` for that frame (not fatal, just loses timestamp fidelity). If `TS` is omitted entirely, `ts` is also `null`. |

**Do not add other keys yet** (`PIR`, `JOY`, `TOUCH`, `ROLL`/`PITCH`/`YAW`) — those are Phase 2.
The parser already has multi-value support (`JOY:x:y`) and a string-preserving special case
(`TOUCH`) wired for when that phase starts; you don't need to touch `parser.js` to add them
later, just emit the new `KEY:VALUE` pairs from the sketch when that phase begins.

Example full Phase-1 line:
```
DIST:23.4,TS:10234
```

## 4. Line-ending expectations

- `Serial.println()` on Arduino emits `\r\n` (CR+LF). **This is expected and already handled**
  — `parseLine` strips trailing `\r` before parsing. You do not need to manually strip it or
  use `Serial.print("...\n")` instead; `Serial.println` is the normal, correct call to use.
- Exactly one `\n`-terminated line per cycle. Don't emit blank lines between frames, and don't
  split one frame across two `println` calls.

## 5. Parser edge cases that matter at the sketch level

These are things the parser already tolerates (so they won't crash the backend), but getting
them right in the sketch still matters for correct *data*, not just for not-crashing:

- **Don't print partial lines.** If your read loop can produce a line before all fields are
  ready (e.g. sensor read still in progress), buffer the full line and print it atomically in
  one `println` call once every field for that cycle is available. A line arriving split across
  two writes (e.g. the process gets interrupted mid-`print`) risks being read by the backend as
  two separate malformed fragments instead of one valid frame.
- **Don't print anything before `setup()` completes** (§1) — includes avoiding stray `Serial.print`
  debug statements left in during development once you're testing against the real backend.
- **Numeric coercion has no fallback to zero or NaN-as-a-number.** If `DIST` can't be coerced
  to a number, the parser keeps it as a raw string rather than silently producing `NaN` — but
  the frontend chart expects a number and will effectively drop that point. Always send a
  properly formatted decimal (e.g. `23.4`, `0.0`, `-1.0` if you ever need a negative/error
  sentinel — just make sure it's a real parseable number, not a word).
  - Valid: `23.4`, `23`, `0.0`, `.5` — Invalid (kept as string, breaks the chart): `NaN`, `err`, `23,4` (comma instead of decimal point), `23.4cm` (units suffix).
- **`TOUCH`-style leading zeros / bit-width preservation doesn't apply to `DIST`** — this note
  is only relevant once Phase 2 adds `TOUCH`; ignore for this phase.
- **Empty/whitespace-only lines are tolerated** (parser returns `null`, dropped silently) — but
  don't rely on this; every line the sketch prints should be a real, complete frame.
- **Duplicate keys**: if you accidentally print `DIST` twice in one line, the parser keeps the
  *last* occurrence and silently discards the first. Don't do this; it's just documented
  behavior, not something to design around.
- **Never let the sketch hang or block indefinitely inside the read/print cycle** — the parser
  can't do anything about a Node backend that stops receiving bytes; keep the loop timing
  predictable (see §2's ~50 ms cadence).

## 6. HC-SR04 wiring reference (for your reference, not prescriptive)

This is background info, not a spec to follow rigidly — pin numbers are your choice.

- **VCC**: HC-SR04 typically wants 5V. The Uno R4 (Minima/WiFi) has a 5V pin broken out, so this
  is normally fine — just confirm against the datasheet/board pinout before wiring, since some
  R4-family logic considerations differ from classic AVR Unos.
- **GND**: common ground with the board, obviously.
- **TRIG / ECHO**: any two free digital pins; a common pattern is `trigPin = 9`, `echoPin = 10`
  (or similar), but pick whatever's convenient for your layout. `ECHO` returns a 5V logic pulse
  proportional to round-trip time — read it with `pulseIn()` and convert to cm
  (`duration * 0.034 / 2` is the usual formula, speed of sound ≈ 340 m/s).
- **Logic level**: the HC-SR04 signal pins are typically 5V-tolerant on the Uno R4's digital
  pins (unlike, say, a 3.3V-only board), but double-check the specific HC-SR04 module and board
  variant you have before assuming this — this is exactly the kind of thing worth verifying
  with a multimeter or datasheet rather than assuming from a general note like this one.

## 7. Sketch authorship note

Per project decision, **the human writes `sensor_dashboard.ino` by hand** (for C++ practice)
rather than Claude Code generating it. Once written, share it for review: Claude Code will
check it against this spec (protocol compliance — correct keys/types/timing/line-ending
behavior, `Serial.begin(115200)`, valid `setup()`/`loop()`, wiring documented in a header
comment) before it's committed. This applies to sketch updates in later phases too, not just
the initial Phase 1 version — the same review-before-commit loop repeats for `PIR` below,
and for each sensor after it.

## 8. Phase 2 addendum: PIR

The backend/frontend side of `PIR` is already built and committed — mock source emits it,
`parseLine` already handles it (single int, no parser change needed), and the frontend has a
`PirWidget` (status pulse + motion-event log, not a line chart, since PIR is on/off). This
section is what the **sketch** needs to add.

- **Key**: `PIR`, single value, **int** — `0` (no motion) or `1` (motion). Parses via the same
  int-coercion path as everything else (`/^-?\d+$/`), so just print the digital pin's read
  value directly: `Serial.print(digitalRead(pirPin))` gives you `0` or `1` already, no
  conversion needed.
- **Append to the same line, same cadence** — do not print `PIR` on its own line or on a
  different cycle than `DIST`. One combined line per cycle, e.g.:
  ```
  DIST:23.4,PIR:1,TS:10234
  ```
  Key order within the line doesn't matter to the parser (it's comma-split then colon-split
  per token), but keep it consistent for readability.
- **No debouncing/hold-time logic required in the sketch** — most PIR modules (e.g. HC-SR501)
  already hold their output HIGH for a few seconds after a trigger via an onboard potentiometer,
  so a raw `digitalRead()` each cycle is enough; the frontend's event log already derives
  discrete "motion started" events by diffing consecutive `0`→`1` readings, it doesn't need the
  sketch to do that debouncing.
- **Wiring reference (non-prescriptive, your pin choice)**: common PIR modules (e.g. HC-SR501)
  are 3-pin — VCC (5V), GND, and a digital OUT pin that goes HIGH on motion. OUT is a clean
  digital logic level (no `pulseIn`/analog conversion needed, unlike the HC-SR04) — just
  `pinMode(pirPin, INPUT)` and `digitalRead(pirPin)`. Many modules need a several-second warm-up
  after power-on before readings stabilize — don't be surprised by spurious `1`s in the first
  ~10-60s, that's the sensor calibrating, not a wiring bug.
- Update the header comment's wiring section to add the new pin, same as the existing
  Trig/Echo entries.

## 9. Phase 2 addendum: Joystick (JOY)

Backend/frontend support is already built and committed — mock source emits `JOY:x:y`,
`parseLine` already maps it to a named `{x, y}` shape via `KNOWN_MULTI` (no parser change
needed), and the frontend has a `JoystickWidget` (2D canvas dot, `requestAnimationFrame`-driven).
This is what the **sketch** needs to add.

- **Key**: `JOY`, two values, colon-separated: `JOY:<x>:<y>`. Both `x` and `y` are read via
  `analogRead()` on two analog pins — a standard 10-bit Arduino ADC read, so each value is an
  **int in the range 0-1023** (0 = one extreme, 1023 = the other, ~512 = centered/at-rest for a
  typical spring-loaded joystick module). Just print `Serial.print(analogRead(joyXPin))` and
  `Serial.print(analogRead(joyYPin))` directly — no conversion needed, matches the mock's range
  exactly.
- **Append to the same line, same cadence** as `DIST`/`PIR`/`TS` — one combined line per cycle:
  ```
  DIST:23.4,PIR:0,JOY:512:489,TS:10234
  ```
  The parser splits each `KEY:...` token on `:` and takes everything after the key as the value
  list, so `JOY:512:489` correctly becomes `{x: 512, y: 489}` — don't add a third value or
  change the separator, the multi-value handling here is specifically wired for exactly two.
- **Should `JOY` be gated behind anything, like `DIST` is?** No — unlike the ultrasonic reading,
  an `analogRead()` on an idle/centered joystick is not an "invalid" state the way an
  out-of-range echo is. Always include `JOY` on every line, unconditionally, the same way `PIR`
  already is.
- **Wiring reference (non-prescriptive, your pin choice)**: a standard 2-axis analog joystick
  module has 5 pins — VCC (5V or 3.3V depending on module, check silkscreen/datasheet), GND, VRx
  (X axis analog out), VRy (Y axis analog out), and often an SW (press-button, digital, active
  LOW) pin — the button isn't part of this phase's protocol, ignore it for now unless you want
  to fold it in as its own key later. Wire VRx/VRy to any two free **analog** pins (`A0`-`A5` on
  the Uno R4) and read with `analogRead()` — no `pinMode()` call needed for analog input pins.
- Update the header comment's wiring section to add the two new analog pins, same pattern as
  the existing entries.
