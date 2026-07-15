import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createSource, listPorts } from './sources/index.js';
import { parseLine } from './parser.js';
import { createRecorder, FILENAME_RE } from './recorder.js';

/**
 * Builds (but does not start listening on) the HTTP+WS server wired to a serial source.
 * Returns { app, server, wss, close } so callers (index.js, tests) control the listen
 * lifecycle and ephemeral ports.
 */
export function createServer(config) {
  const app = express();
  app.use(cors());

  const source = createSource(config);
  const recorder = createRecorder({ sessionsDir: config.SESSIONS_DIR });
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

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

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
    recorder.write(parsed);
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
      if (recorder.isRecording()) recorder.stop();
      source.close();
      wss.close(() => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      for (const client of wss.clients) client.terminate();
    });
  }

  return { app, server, wss, close };
}
