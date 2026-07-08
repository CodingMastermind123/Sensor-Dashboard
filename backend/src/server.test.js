import { describe, it, expect, afterEach } from 'vitest';
import WebSocket from 'ws';
import { createServer } from './server.js';

describe('server (mock source, integration)', () => {
  let handle;

  afterEach(async () => {
    await handle?.close();
  });

  async function start() {
    handle = createServer({ SERIAL_SOURCE: 'mock', FRAME_MS: 10, PORT: 0 });
    await new Promise((resolve) => handle.server.listen(0, resolve));
    const port = handle.server.address().port;
    return port;
  }

  it('GET /health returns ok', async () => {
    const port = await start();
    const res = await fetch(`http://localhost:${port}/health`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.source).toBe('mock');
  });

  it('sends a status envelope on connect and a sensors envelope within 500ms', async () => {
    const port = await start();
    const ws = new WebSocket(`ws://localhost:${port}`);

    const messages = [];
    const gotBoth = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timed out waiting for envelopes')), 500);
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        messages.push(msg);
        if (messages.some((m) => m.type === 'status') && messages.some((m) => m.type === 'sensors')) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });

    await gotBoth;
    ws.close();

    const status = messages.find((m) => m.type === 'status');
    expect(status).toMatchObject({ type: 'status', connected: true, port: 'mock' });

    const sensors = messages.find((m) => m.type === 'sensors');
    expect(sensors).toHaveProperty('data.DIST');
    expect(sensors).toHaveProperty('ts');
    expect(sensors).toHaveProperty('recvTs');
    expect(sensors).toHaveProperty('raw');
  });

  it('closes cleanly with no open handles', async () => {
    await start();
    await expect(handle.close()).resolves.not.toThrow();
    handle = null;
  });
});
