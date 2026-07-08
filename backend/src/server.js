import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createSource, listPorts } from './sources/index.js';
import { parseLine } from './parser.js';

/**
 * Builds (but does not start listening on) the HTTP+WS server wired to a serial source.
 * Returns { app, server, wss, close } so callers (index.js, tests) control the listen
 * lifecycle and ephemeral ports.
 */
export function createServer(config) {
  const app = express();
  app.use(cors());

  const source = createSource(config);
  let connected = false;
  let sourcePort = config.SERIAL_SOURCE === 'real' ? config.SERIAL_PATH : 'mock';
  let frameCount = 0;
  let dataRateHz = 0;

  app.get('/health', (req, res) => {
    res.json({ ok: true, source: config.SERIAL_SOURCE, connected });
  });

  app.get('/ports', async (req, res) => {
    const result = await listPorts();
    if (result?.error) return res.status(200).json({ error: result.error });
    res.json(result);
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  function currentStatus() {
    return { type: 'status', connected, port: sourcePort, dataRateHz };
  }

  function broadcast(envelope) {
    const json = JSON.stringify(envelope);
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) client.send(json);
    }
  }

  source.on('status', (s) => {
    connected = s.connected;
    if (s.port) sourcePort = s.port;
    broadcast(currentStatus());
  });

  source.on('line', (line) => {
    const parsed = parseLine(line);
    if (!parsed) return;
    frameCount += 1;
    broadcast({
      type: 'sensors',
      ts: parsed.ts,
      recvTs: Date.now(),
      data: parsed.data,
      raw: parsed.raw,
    });
  });

  const rateTimer = setInterval(() => {
    dataRateHz = frameCount;
    frameCount = 0;
    broadcast(currentStatus());
  }, 1000);

  wss.on('connection', (ws) => {
    ws.send(JSON.stringify(currentStatus()));

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg?.type === 'command') {
        // Phase 3: route to source.write(). For now (read-only-before-read-write), just log.
        console.log('[command] received (not yet wired to serial):', msg);
      }
    });
  });

  source.start();

  function close() {
    return new Promise((resolve, reject) => {
      clearInterval(rateTimer);
      source.close();
      wss.close(() => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      for (const client of wss.clients) client.terminate();
    });
  }

  return { app, server, wss, close };
}
