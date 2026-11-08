import type { Diagnostic, Observation, ObservationSdk } from '../types/document-view.ts';

export const LIMITS = Object.freeze({
  maxDepth: 32,
  maxBlocks: 200000,
  maxTextUnits: 4 * 1024 * 1024,
});
export const uint = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
export const diagnostic = (
  code: string,
  message: unknown,
  source?: Diagnostic['source'],
): Diagnostic => ({
  code,
  message: String(message).slice(0, 512),
  ...(source ? { source: { ...source } } : {}),
});
export function call<T = unknown>(
  sdk: ObservationSdk,
  method: string,
  args: readonly unknown[],
  warnings: Diagnostic[],
  source?: Diagnostic['source'],
): Observation<T> {
  try {
    const getter: unknown = Reflect.get(sdk, method);
    if (typeof getter !== 'function') throw new Error(`${method}Unavailable`);
    // JS SDK가 해당 코덱에서 검증한 반환값입니다. 소비자는 선택한 관측 DTO만 투영합니다.
    return { ok: true, value: Reflect.apply(getter, sdk, args) as T };
  } catch (error) {
    const message: unknown =
      error !== null && (typeof error === 'object' || typeof error === 'function')
        ? (Reflect.get(error, 'message') ?? 'UnknownError')
        : 'UnknownError';
    warnings.push(diagnostic('ObservationUnavailable', `${method}: ${message}`, source));
    return { ok: false, value: null };
  }
}
export function array<T>(
  result: Observation<unknown>,
  warnings: Diagnostic[],
  name: string,
  source?: Diagnostic['source'],
): T[] {
  if (result.ok && Array.isArray(result.value) && result.value.length <= LIMITS.maxBlocks)
    return result.value as T[];
  if (result.ok) warnings.push(diagnostic('InvalidObservation', name, source));
  result.ok = false;
  return [];
}
export function unique<T, K>(
  rows: readonly T[],
  key: (row: T) => K,
  warnings: Diagnostic[],
  name: string,
): Map<K, T | null> {
  const map = new Map<K, T | null>();
  for (const row of rows) {
    const id = key(row);
    if (map.has(id)) {
      map.set(id, null);
      warnings.push(diagnostic('AmbiguousSourceIdentity', name));
    } else map.set(id, row);
  }
  return map;
}
export const key = (section: number, id: number): string => `${section}:${id}`;
