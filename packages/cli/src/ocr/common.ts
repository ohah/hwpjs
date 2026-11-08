export const OCR_LIMITS = Object.freeze({
  maxInputBytes: 8 * 1024 * 1024,
  maxOutputBytes: 256 * 1024,
  maxStdoutBytes: 2 * 1024 * 1024,
  maxStderrBytes: 16 * 1024,
  timeoutMs: 30000,
});

export class OcrError extends Error {
  declare code: string;
  declare reason: string;
  declare exitCode?: number | null;
  declare stderr?: string;
  constructor(code: string, options: { cause?: unknown; reason?: string } = {}) {
    super(code, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'OcrError';
    this.code = code;
    this.reason = options.reason ?? code;
  }
}

const byteLength: ((this: Uint8Array) => unknown) | undefined = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype),
  'byteLength',
)?.get;
export function ownedBytes(
  value: unknown,
  maxBytes: number,
  name = 'Ocr',
  allowEmpty = false,
): Uint8Array<ArrayBuffer> {
  if (!(value instanceof Uint8Array)) throw new TypeError('Expected' + name + 'Uint8Array');
  if (!byteLength) throw new Error('TypedArrayLengthUnavailable');
  const length = byteLength.call(value);
  if (typeof length !== 'number') throw new TypeError('InvalidOcrByteLength');
  if ((!allowEmpty && length === 0) || length > maxBytes)
    throw new OcrError(name === 'Ocr' ? 'OcrInputLimitExceeded' : name + 'LimitExceeded');
  const bytes = new Uint8Array(length);
  bytes.set(value);
  return bytes;
}

export function ocrLimits(value: unknown = {}): OcrProcessBudget {
  if (!isRecord(value)) throw new TypeError('InvalidOcrLimits');
  const result: OcrProcessBudget = { ...OCR_LIMITS };
  for (const [key, ceiling] of Object.entries(OCR_LIMITS)) {
    const limit = value[key] ?? ceiling;
    if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 1 || limit > ceiling)
      throw new RangeError('InvalidOcrLimit:' + key);
    result[key as keyof OcrProcessBudget] = limit;
  }
  return result;
}

export function ocrLanguages(value: unknown = 'kor+eng'): OcrLanguage[] {
  const list = typeof value === 'string' ? value.split('+') : value;
  const length = Array.isArray(list) ? list.length : 0;
  if (!Number.isSafeInteger(length) || length < 1 || length > 8)
    throw new TypeError('InvalidOcrLanguages');
  const result: OcrLanguage[] = [],
    seen = new Set<string>();
  for (let i = 0; i < length; i++) {
    const language: unknown = Array.isArray(list) ? list[i] : undefined;
    if (
      typeof language !== 'string' ||
      !/^[a-z]{3}(?:_[a-z0-9]{1,12})?$/u.test(language) ||
      seen.has(language)
    )
      throw new TypeError('InvalidOcrLanguages');
    seen.add(language);
    result.push(language as OcrLanguage);
  }
  return result;
}

export function imageInput(value: unknown, maxBytes: number): Uint8Array<ArrayBuffer> {
  const bytes = ownedBytes(value, maxBytes);
  const prefix = (...values: number[]) => values.every((byte, index) => bytes[index] === byte);
  // 픽셀 유효성 검사가 아닌 입력 종류 경계입니다. 파일 목록·SVG·PDF·OLE는 OCR 실행기로 넘기지 않습니다.
  const raster =
    prefix(137, 80, 78, 71, 13, 10, 26, 10) ||
    prefix(255, 216, 255) ||
    prefix(66, 77) ||
    prefix(71, 73, 70, 56, 55, 97) ||
    prefix(71, 73, 70, 56, 57, 97) ||
    prefix(73, 73, 42, 0) ||
    prefix(77, 77, 0, 42) ||
    (prefix(82, 73, 70, 70) &&
      bytes[8] === 87 &&
      bytes[9] === 69 &&
      bytes[10] === 66 &&
      bytes[11] === 80);
  if (!raster) throw new OcrError('OcrInputUnsupported');
  return bytes;
}

export async function recognizeImage(options: unknown = {}): Promise<RecognizedImage> {
  if (!isRecord(options)) throw new TypeError('InvalidOcrOptions');
  const { bytes, provider, languages = 'kor+eng', limits } = options;
  const signal = ocrSignal(options.signal);
  const budget = ocrLimits(limits);
  const input = imageInput(bytes, budget.maxInputBytes);
  const requested = ocrLanguages(languages);
  if (signal?.aborted) throw new OcrError('OcrAborted');
  if (!isProvider(provider)) throw new OcrError('ProviderUnavailable');
  const result = await provider.recognize({
    bytes: input,
    languages: [...requested],
    limits: budget,
    signal,
  });
  if (signal?.aborted) throw new OcrError('OcrAborted');
  const text = isRecord(result) ? result.text : undefined;
  if (typeof text !== 'string') throw new OcrError('ProviderInvalidResponse');
  if (text.length > budget.maxOutputBytes) throw new OcrError('OcrOutputLimitExceeded');
  if (!text.isWellFormed()) throw new OcrError('ProviderInvalidResponse');
  if (new TextEncoder().encode(text).length > budget.maxOutputBytes)
    throw new OcrError('OcrOutputLimitExceeded');
  return { status: text.trim().length ? 'recognized' : 'no-text', text, languages: requested };
}
import type { OcrLanguage, OcrProcessBudget, OcrProvider, RecognizedImage } from './types.ts';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function ocrSignal(value: unknown): AbortSignal | undefined {
  if (value === undefined) return undefined;
  if (!(value instanceof AbortSignal)) throw new TypeError('InvalidOcrSignal');
  return value;
}
export function errorCode(value: unknown): string | undefined {
  const code = isRecord(value) ? value.code : undefined;
  return typeof code === 'string' ? code : undefined;
}
export function isProvider(value: unknown): value is OcrProvider {
  return (
    isRecord(value) &&
    typeof value.recognize === 'function' &&
    (value.prepare === undefined || typeof value.prepare === 'function') &&
    (value.id === undefined || value.id === 'tesseract' || value.id === 'vision')
  );
}
