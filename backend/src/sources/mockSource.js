import { EventEmitter } from 'node:events';

const MIN_DIST = 5;
const MAX_DIST = 200;
const PIR_TRIGGER_CHANCE = 0.02; // per-frame chance of a motion event starting
const PIR_HOLD_MS = 3000; // real PIR modules hold HIGH for a few seconds after trigger
const JOY_CENTER = 512; // 10-bit ADC midpoint, like a real analog joystick at rest
const JOY_MIN = 0;
const JOY_MAX = 1023;
const JOY_SPRING = 0.08; // pulls x/y back toward center each frame, like a spring-loaded stick

/**
 * Synthetic serial source: emits realistic protocol lines on an interval, no hardware
 * or native deps required. Implements the same interface as serialSource (EventEmitter
 * with 'line'/'status' events, write(), close()).
 */
export function createMockSource({ frameMs = 50 } = {}) {
  const emitter = new EventEmitter();
  let timer = null;
  let dist = 50; // slow random walk between MIN_DIST and MAX_DIST
  let pir = 0;
  let pirHoldUntil = 0;
  let joyX = JOY_CENTER;
  let joyY = JOY_CENTER;
  const startedAt = Date.now();

  emitter.start = () => {
    emitter.emit('status', { connected: true, port: 'mock' });
    timer = setInterval(() => {
      dist += (Math.random() - 0.5) * 10;
      dist = Math.min(MAX_DIST, Math.max(MIN_DIST, dist));

      const now = Date.now();
      if (pir === 1 && now >= pirHoldUntil) {
        pir = 0;
      } else if (pir === 0 && Math.random() < PIR_TRIGGER_CHANCE) {
        pir = 1;
        pirHoldUntil = now + PIR_HOLD_MS;
      }

      joyX += (Math.random() - 0.5) * 60 - (joyX - JOY_CENTER) * JOY_SPRING;
      joyY += (Math.random() - 0.5) * 60 - (joyY - JOY_CENTER) * JOY_SPRING;
      joyX = Math.round(Math.min(JOY_MAX, Math.max(JOY_MIN, joyX)));
      joyY = Math.round(Math.min(JOY_MAX, Math.max(JOY_MIN, joyY)));

      const ts = now - startedAt;
      const line = `DIST:${dist.toFixed(1)},PIR:${pir},JOY:${joyX}:${joyY},TS:${ts}`;
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
