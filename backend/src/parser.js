// Known multi-value keys get a named shape instead of a plain array.
// Exported so recorder.js can derive its CSV flattening (JOY -> JOY_x, JOY_y) from the
// same source instead of hardcoding the sub-key names a second time.
export const KNOWN_MULTI = { JOY: ['x', 'y'] };

// Keys that must never be coerced to a number (leading zeros / bit width matter).
// Exported so recorder.js knows to write these as-is rather than assuming a numeric cell.
export const STRING_KEYS = new Set(['TOUCH']);

function coerce(str) {
  if (/^-?\d+$/.test(str)) return parseInt(str, 10);
  if (/^-?\d*\.\d+$/.test(str)) return parseFloat(str);
  return str;
}

/**
 * Parses one line of the Arduino sensor protocol into a structured frame.
 * Never throws; malformed tokens are skipped, malformed/empty lines return null.
 */
export function parseLine(line) {
  const raw = line.replace(/\r+$/, '').trim();
  if (raw === '') return null;

  const data = {};
  let ts = null;

  for (const token of raw.split(',')) {
    if (token === '') continue;
    const parts = token.split(':');
    const key = parts[0];
    const values = parts.slice(1);
    if (!key || values.length === 0) continue;

    if (key === 'TS') {
      const parsedTs = coerce(values[0]);
      ts = typeof parsedTs === 'number' ? parsedTs : null;
      continue;
    }

    if (STRING_KEYS.has(key)) {
      data[key] = values[0];
    } else if (values.length > 1) {
      const names = KNOWN_MULTI[key];
      const coerced = values.map(coerce);
      data[key] = names ? Object.fromEntries(names.map((n, i) => [n, coerced[i]])) : coerced;
    } else {
      data[key] = coerce(values[0]);
    }
  }

  return { data, ts, raw };
}
