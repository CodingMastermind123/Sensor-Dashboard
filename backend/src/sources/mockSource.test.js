import { describe, it, expect, afterEach } from 'vitest';
import { createMockSource } from './mockSource.js';
import { parseLine } from '../parser.js';

describe('mockSource', () => {
  let source;

  afterEach(() => {
    source?.close();
  });

  it('emits a line on an interval that parses to an object containing DIST and a numeric ts', async () => {
    source = createMockSource({ frameMs: 10 });

    const line = await new Promise((resolve) => {
      source.once('line', resolve);
      source.start();
    });

    const parsed = parseLine(line);
    expect(parsed).not.toBeNull();
    expect(typeof parsed.data.DIST).toBe('number');
    expect(typeof parsed.ts).toBe('number');
  });

  it('emits a status event on start', async () => {
    source = createMockSource({ frameMs: 10 });

    const status = await new Promise((resolve) => {
      source.once('status', resolve);
      source.start();
    });

    expect(status.connected).toBe(true);
    expect(status.port).toBe('mock');
  });

  it('includes a PIR key (0 or 1) on every emitted line', async () => {
    source = createMockSource({ frameMs: 5 });

    const lines = await new Promise((resolve) => {
      const collected = [];
      source.on('line', (line) => {
        collected.push(line);
        if (collected.length >= 10) resolve(collected);
      });
      source.start();
    });

    for (const line of lines) {
      const parsed = parseLine(line);
      expect([0, 1]).toContain(parsed.data.PIR);
    }
  });
});
