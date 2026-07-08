import { EventEmitter } from 'node:events';

const MIN_DIST = 5;
const MAX_DIST = 200;

/**
 * Synthetic serial source: emits realistic protocol lines on an interval, no hardware
 * or native deps required. Implements the same interface as serialSource (EventEmitter
 * with 'line'/'status' events, write(), close()).
 */
export function createMockSource({ frameMs = 50 } = {}) {
  const emitter = new EventEmitter();
  let timer = null;
  let dist = 50; // slow random walk between MIN_DIST and MAX_DIST
  const startedAt = Date.now();

  emitter.start = () => {
    emitter.emit('status', { connected: true, port: 'mock' });
    timer = setInterval(() => {
      dist += (Math.random() - 0.5) * 10;
      dist = Math.min(MAX_DIST, Math.max(MIN_DIST, dist));
      const ts = Date.now() - startedAt;
      const line = `DIST:${dist.toFixed(1)},TS:${ts}`;
      emitter.emit('line', line);
    }, frameMs);
  };

  emitter.write = () => {
    // Phase 3: mock loopback ack. No-op for Phase 1 (read-only).
  };

  emitter.close = () => {
    if (timer) clearInterval(timer);
    timer = null;
    emitter.emit('status', { connected: false, port: 'mock' });
  };

  return emitter;
}
