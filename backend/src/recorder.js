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
 *
 * Uses synchronous file I/O (openSync/writeSync/closeSync) rather than a write stream:
 * frames arrive at ~20Hz, so the sync overhead is negligible, and it avoids write
 * streams' async open/flush timing entirely — a caller can start(), write() a few
 * rows, stop(), and immediately read the file back with no race to wait out.
 */
export function createRecorder({ sessionsDir }) {
  let fd = null;
  let file = null;
  let rows = 0;

  function isRecording() {
    return fd !== null;
  }

  function currentFile() {
    return file;
  }

  function start() {
    if (fd !== null) throw new Error('already recording');
    fs.mkdirSync(sessionsDir, { recursive: true });
    const name = `${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
    fd = fs.openSync(path.join(sessionsDir, name), 'w');
    fs.writeSync(fd, COLUMNS.join(',') + '\n');
    file = name;
    rows = 0;
    return { file };
  }

  function write(parsed) {
    if (fd === null) return;
    fs.writeSync(fd, formatRow(parsed) + '\n');
    rows += 1;
  }

  function stop() {
    if (fd === null) throw new Error('not recording');
    const result = { file, rows };
    fs.closeSync(fd);
    fd = null;
    file = null;
    rows = 0;
    return result;
  }

  return { start, write, stop, isRecording, currentFile };
}
