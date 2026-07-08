import { createMockSource } from './mockSource.js';
import { createSerialSource } from './serialSource.js';

/** Factory: returns a mock or real serial source based on config.SERIAL_SOURCE. */
export function createSource(config) {
  if (config.SERIAL_SOURCE === 'real') {
    return createSerialSource({ path: config.SERIAL_PATH, baud: config.BAUD });
  }
  return createMockSource({ frameMs: config.FRAME_MS });
}

export { listPorts } from './serialSource.js';
