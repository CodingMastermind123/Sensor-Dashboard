import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PORT = Number(process.env.PORT) || 8080;
export const SERIAL_SOURCE = process.env.SERIAL_SOURCE || 'mock';
export const SERIAL_PATH = process.env.SERIAL_PATH || '';
export const BAUD = Number(process.env.BAUD) || 115200;
export const FRAME_MS = Number(process.env.FRAME_MS) || 50;
export const SESSIONS_DIR = path.join(__dirname, '..', 'sessions');
