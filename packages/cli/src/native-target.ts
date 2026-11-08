import type { NativeTarget } from './types/commands.ts';
export function parseNativeTarget(value: unknown): NativeTarget {
  if (typeof value !== 'string' || value.length > 32) throw new TypeError('InvalidTarget');
  const match = /^s(0|[1-9]\d*):p(0|[1-9]\d*)$/u.exec(value);
  if (!match) throw new TypeError('InvalidTarget');
  const section = Number(match[1]),
    paragraph = Number(match[2]);
  if (![section, paragraph].every((n) => Number.isSafeInteger(n) && n <= 0xffffffff))
    throw new RangeError('InvalidTarget');
  return Object.freeze({ section, paragraph });
}
