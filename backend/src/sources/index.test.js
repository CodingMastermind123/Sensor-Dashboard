import { describe, it, expect, afterEach } from 'vitest';
import { createSource } from './index.js';
import { parseLine } from '../parser.js';

describe('createSource', () => {
  let source;

  afterEach(() => {
    source?.close();
  });

  it('returns a mock source that never imports serialport, emitting parseable DIST lines', async () => {
    source = createSource({ SERIAL_SOURCE: 'mock', FRAME_MS: 10 });

    const line = await new Promise((resolve) => {
      source.once('line', resolve);
      source.start();
    });

    const parsed = parseLine(line);
    expect(parsed.data.DIST).toBeTypeOf('number');
  });
});
