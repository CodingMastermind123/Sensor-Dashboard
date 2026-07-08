import { describe, it, expect } from 'vitest';
import { parseLine } from './parser.js';

describe('parseLine', () => {
  it('parses the full spec example line', () => {
    const line = 'PIR:1,DIST:23.4,JOY:512:489,TOUCH:100000000000,ROLL:12.3,PITCH:-4.5,YAW:89.0,TS:10234';
    const result = parseLine(line);
    expect(result).toEqual({
      data: {
        PIR: 1,
        DIST: 23.4,
        JOY: { x: 512, y: 489 },
        TOUCH: '100000000000',
        ROLL: 12.3,
        PITCH: -4.5,
        YAW: 89.0,
      },
      ts: 10234,
      raw: line,
    });
  });

  it('returns null for an empty line', () => {
    expect(parseLine('')).toBeNull();
  });

  it('returns null for a whitespace-only line', () => {
    expect(parseLine('   ')).toBeNull();
  });

  it('handles a trailing comma without throwing', () => {
    const result = parseLine('DIST:23.4,TS:10234,');
    expect(result).toEqual({ data: { DIST: 23.4 }, ts: 10234, raw: 'DIST:23.4,TS:10234,' });
  });

  it('strips \\r\\n line endings (Arduino Serial.println)', () => {
    const result = parseLine('DIST:23.4,TS:10234\r\n');
    expect(result).toEqual({ data: { DIST: 23.4 }, ts: 10234, raw: 'DIST:23.4,TS:10234' });
  });

  it('passes unknown keys through untouched', () => {
    const result = parseLine('FOO:42,TS:1');
    expect(result.data.FOO).toBe(42);
  });

  it('skips a malformed token without failing the whole line', () => {
    const result = parseLine('DIST:23.4,justsomejunk,TS:10234');
    expect(result).toEqual({ data: { DIST: 23.4 }, ts: 10234, raw: 'DIST:23.4,justsomejunk,TS:10234' });
  });

  it('coerces DIST to a float', () => {
    const result = parseLine('DIST:23.4');
    expect(result.data.DIST).toBe(23.4);
    expect(typeof result.data.DIST).toBe('number');
  });

  it('coerces PIR to an int', () => {
    const result = parseLine('PIR:1');
    expect(result.data.PIR).toBe(1);
    expect(Number.isInteger(result.data.PIR)).toBe(true);
  });

  it('keeps a non-numeric value as a string instead of producing NaN', () => {
    const result = parseLine('DIST:banana');
    expect(result.data.DIST).toBe('banana');
    expect(Number.isNaN(result.data.DIST)).toBe(false);
  });

  it('keeps TOUCH as a string, preserving leading zeros / 12-char width', () => {
    const result = parseLine('TOUCH:000000000001');
    expect(result.data.TOUCH).toBe('000000000001');
    expect(typeof result.data.TOUCH).toBe('string');
  });

  it('parses JOY as a named {x,y} shape, not dropping the second value', () => {
    const result = parseLine('JOY:512:489');
    expect(result.data.JOY).toEqual({ x: 512, y: 489 });
  });

  it('parses an unknown multi-value key as an array of coerced values', () => {
    const result = parseLine('WEIRD:1:2:3');
    expect(result.data.WEIRD).toEqual([1, 2, 3]);
  });

  it('extracts TS as a separate int field, not duplicated in data', () => {
    const result = parseLine('DIST:1.0,TS:5000');
    expect(result.ts).toBe(5000);
    expect(result.data.TS).toBeUndefined();
  });

  it('sets ts to null when TS is missing', () => {
    const result = parseLine('DIST:1.0');
    expect(result.ts).toBeNull();
  });

  it('resolves duplicate keys with last-wins', () => {
    const result = parseLine('DIST:1,DIST:2');
    expect(result.data.DIST).toBe(2);
  });

  it('never throws on a garbage line', () => {
    expect(() => parseLine(':::,,,:::')).not.toThrow();
  });
});
