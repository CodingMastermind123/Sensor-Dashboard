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
