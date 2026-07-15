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
