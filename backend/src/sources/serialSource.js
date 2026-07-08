import { EventEmitter } from 'node:events';

/**
 * Real serial source backed by the `serialport` package. `serialport` is only ever
 * import()ed lazily, inside start()/listPorts() — never at module top level — so mock
 * mode and unit tests stay native-free.
 */
export function createSerialSource({ path, baud }) {
  const emitter = new EventEmitter();
  let port = null;

  emitter.start = async () => {
    const { SerialPort } = await import('serialport');
    const { ReadlineParser } = await import('@serialport/parser-readline');

    port = new SerialPort({ path, baudRate: baud }, (err) => {
      if (err) emitter.emit('status', { connected: false, port: path, error: err.message });
    });

    const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));
    parser.on('data', (line) => emitter.emit('line', line));

    port.on('open', () => emitter.emit('status', { connected: true, port: path }));
    port.on('close', () => emitter.emit('status', { connected: false, port: path }));
    port.on('error', (err) => emitter.emit('status', { connected: false, port: path, error: err.message }));
  };

  emitter.write = (str) => {
    if (!port || !port.isOpen) throw new Error('serial port is not open');
    port.write(str);
  };

  emitter.close = () => {
    port?.close();
    port = null;
  };

  return emitter;
}

/** Lists available serial ports. Returns a friendly error instead of throwing if serialport fails to load. */
export async function listPorts() {
  try {
    const { SerialPort } = await import('serialport');
    return await SerialPort.list();
  } catch (err) {
    return { error: `serialport unavailable: ${err.message}` };
  }
}
