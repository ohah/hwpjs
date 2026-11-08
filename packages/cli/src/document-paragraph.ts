import type { DocumentFormat, DocumentOpenOptions } from './types/native-document.ts';
import type { ObservationSdk, CharacterRange } from './types/document-view.ts';
export interface ParagraphDocument {
  format: DocumentFormat;
  sourceSha256: string;
  sectionCount: number;
  sdk: ObservationSdk;
  close(): void | Promise<void>;
}
export interface ParagraphInspectionDependencies {
  openDocument?: (input: DocumentOpenOptions) => Promise<ParagraphDocument>;
}
export interface ParagraphInspectionResult {
  schemaVersion: 1;
  format: DocumentFormat;
  sourceSha256: string;
  target: { section: number; paragraph: number };
  text: string;
}
function method(sdk: ObservationSdk, name: string): ((...args: unknown[]) => unknown) | null {
  const getter: unknown = Reflect.get(sdk, name);
  return typeof getter === 'function'
    ? (...args) => Reflect.apply(getter, sdk, args) as unknown
    : null;
}
import { detectDocumentFormat } from '../../../js/document-format.mjs';
import { createDisplayEscaper } from './render-escape.ts';

const MAX_DOCUMENT_BYTES = 64 * 1024 * 1024;
const MAX_WASM_BYTES = 32 * 1024 * 1024;
const MAX_TEXT_BYTES = 4 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 64 * 1024;
const MAX_ROWS = 100000;
const encoder = new TextEncoder();
const uint = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function ownBytes(value: unknown, limit: number, name: string): Uint8Array<ArrayBuffer> {
  if (!(value instanceof Uint8Array)) throw new TypeError(`Expected${name}Uint8Array`);
  if (!value.byteLength || value.byteLength > limit) throw new RangeError(`${name}LimitExceeded`);
  return Uint8Array.from(value);
}

function checkText(value: unknown): string {
  if (typeof value !== 'string') throw new TypeError('InvalidParagraphText');
  if (value.length > MAX_TEXT_BYTES || encoder.encode(value).byteLength > MAX_TEXT_BYTES)
    throw new RangeError('ParagraphTextLimitExceeded');
  return value;
}

// 표시용 정규화 없이 각 UTF-16 단위를 JSON으로 그대로 왕복시킵니다.
function asciiJson(value: string): string {
  const chunks = ['"'];
  let length = 2;
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    const chunk =
      unit < 0x20 || unit >= 0x7f || unit === 0x22 || unit === 0x5c
        ? '\\u' + unit.toString(16).padStart(4, '0')
        : value[index];
    length += chunk.length;
    if (length > MAX_OUTPUT_BYTES) throw new RangeError('ParagraphDetailLimitExceeded');
    chunks.push(chunk);
  }
  chunks.push('"');
  return chunks.join('');
}

function paragraphSnapshot(sdk: ObservationSdk, section: number, paragraph: number): string {
  const snapshot = method(sdk, 'paragraphTextSnapshot');
  if (!snapshot) throw new Error('ParagraphInventoryUnavailable');
  const rows = snapshot(section);
  if (!Array.isArray(rows) || rows.length > MAX_ROWS) throw new Error('InvalidParagraphInventory');
  const seen = new Set();
  let found: string | undefined,
    size = 0;
  for (const row of rows) {
    if (!record(row)) throw new Error('InvalidParagraphInventory');
    const { paragraph: id, text, section: observedSection } = row;
    if (
      !uint(id) ||
      id === 0 ||
      seen.has(id) ||
      (observedSection !== undefined && observedSection !== section)
    )
      throw new Error('InvalidParagraphInventory');
    seen.add(id);
    const display = checkText(text);
    size += encoder.encode(display).byteLength;
    if (size > MAX_TEXT_BYTES) throw new RangeError('ParagraphTextLimitExceeded');
    if (id === paragraph) found = display;
  }
  if (!seen.has(paragraph) || found === undefined) throw new RangeError('ParagraphNotFound');
  return found;
}

function shapeId(sdk: ObservationSdk, section: number, paragraph: number): number | null {
  const getter = method(sdk, 'paragraphShapeId');
  if (!getter) return null;
  try {
    const value = getter(section, paragraph);
    return uint(value) ? value : null;
  } catch {
    return null;
  }
}

function characterRanges(
  sdk: ObservationSdk,
  section: number,
  paragraph: number,
  units: number,
): CharacterRange[] | null {
  const getter = method(sdk, 'characterRanges');
  if (!getter) return null;
  try {
    const rows = getter(section, paragraph);
    if (!Array.isArray(rows) || rows.length > MAX_ROWS) return null;
    const result: CharacterRange[] = [];
    let cursor = 0;
    for (const row of rows) {
      if (!record(row)) return null;
      const { start, end, charShapeId } = row;
      if (
        !uint(start) ||
        !uint(end) ||
        start !== cursor ||
        end < start ||
        end > units ||
        (charShapeId !== null && !uint(charShapeId))
      )
        return null;
      cursor = end;
      result.push({ start, end, charShapeId });
      // 메타데이터만으로도 출력 예산을 넘는 배열을 만들지 않습니다.
      if (result.length > MAX_OUTPUT_BYTES / 32) return null;
    }
    return result;
  } catch {
    return null;
  }
}

/** 원문은 이번 요청에서만 읽으며 문서 모델이나 전역 캐시에 보관하지 않습니다. */
export async function inspectDocumentParagraph(
  options: unknown = {},
  dependencies: ParagraphInspectionDependencies = {},
): Promise<ParagraphInspectionResult> {
  if (!record(options)) throw new TypeError('InvalidParagraphTarget');
  const { bytes, wasm, target, expectedSha256, format = 'text' } = options;
  if (format !== 'text' && format !== 'markdown') throw new TypeError('InvalidRenderFormat');
  if (!record(target)) throw new TypeError('InvalidParagraphTarget');
  const { section, paragraph } = target;
  if (!uint(section) || !uint(paragraph)) throw new RangeError('InvalidParagraphTarget');
  const suppliedOpen = dependencies.openDocument;
  if (suppliedOpen !== undefined && typeof suppliedOpen !== 'function')
    throw new TypeError('InvalidDocumentOpener');
  if (
    expectedSha256 !== undefined &&
    (typeof expectedSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(expectedSha256))
  )
    throw new TypeError('InvalidExpectedSha256');
  const input = ownBytes(bytes, MAX_DOCUMENT_BYTES, 'Document');
  const binary = ownBytes(wasm, MAX_WASM_BYTES, 'Wasm');
  const actualFormat = detectDocumentFormat(input);
  if (!globalThis.crypto?.subtle) throw new Error('WebCryptoUnavailable');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', input);
  const sourceSha256 = Array.from(new Uint8Array(digest), (unit) =>
    unit.toString(16).padStart(2, '0'),
  ).join('');
  if (expectedSha256 !== undefined && expectedSha256 !== sourceSha256)
    throw new Error('SourceSha256Mismatch');
  const open = suppliedOpen ?? (await import('./engine.ts')).openDocument;
  if (typeof open !== 'function') throw new TypeError('InvalidDocumentOpener');
  const document = await open({ bytes: input, wasm: binary, expectedSha256 });
  let failed = false;
  let failure: unknown;
  let output: ParagraphInspectionResult | undefined;
  let close: ParagraphDocument['close'] | undefined;
  try {
    close = document?.close;
    const sdk = document?.sdk;
    if (!document || typeof close !== 'function' || !record(sdk))
      throw new Error('InvalidOpenedDocument');
    if (document.format !== actualFormat) throw new Error('DocumentFormatMismatch');
    if (document.sourceSha256 !== sourceSha256) throw new Error('DocumentSnapshotSha256Mismatch');
    if (
      !uint(document.sectionCount) ||
      document.sectionCount === 0 ||
      document.sectionCount > 4096 ||
      section >= document.sectionCount
    )
      throw new RangeError('InvalidParagraphSection');
    let displayText: string | null = null;
    let nativeText: string;
    if (actualFormat === 'hwp5') {
      const countGetter = method(sdk, 'paragraphCount'),
        textGetter = method(sdk, 'text');
      if (!countGetter || !textGetter) throw new Error('ParagraphTextUnavailable');
      const count = countGetter(section);
      if (!uint(count)) throw new Error('InvalidParagraphInventory');
      if (paragraph >= count) throw new RangeError('ParagraphNotFound');
      nativeText = checkText(textGetter(section, paragraph));
    } else {
      displayText = paragraphSnapshot(sdk, section, paragraph);
      const textGetter = method(sdk, 'anchorText');
      if (!textGetter) throw new Error('ParagraphTextUnavailable');
      nativeText = checkText(textGetter(section, paragraph));
    }
    const escape = createDisplayEscaper({ format, view: 'content' });
    const lines: string[] = [];
    let size = 0;
    const line = (value: string) => {
      size += encoder.encode(value).byteLength + 1;
      if (size > MAX_OUTPUT_BYTES) throw new RangeError('ParagraphDetailLimitExceeded');
      lines.push(value);
    };
    line(`문단: s${section}:p${paragraph}`);
    line(`nativeTextUnits: ${nativeText.length}`);
    line(
      displayText === null
        ? 'displayText: 미관측 (단일 문단 표시 getter 없음)'
        : `displayText: ${escape(displayText)}`,
    );
    line('expectedText (JSON ASCII):');
    if (format === 'markdown') line('```json');
    line(asciiJson(nativeText));
    if (format === 'markdown') line('```');
    const shape = shapeId(sdk, section, paragraph);
    const ranges = characterRanges(sdk, section, paragraph, nativeText.length);
    line(`paragraphShapeId: ${shape === null ? '미관측' : shape}`);
    line(`characterRanges: ${ranges === null ? '미관측' : JSON.stringify(ranges)}`);
    output = {
      schemaVersion: 1,
      format: actualFormat,
      sourceSha256,
      target: { section, paragraph },
      text: lines.join('\n') + '\n',
    };
  } catch (error) {
    failed = true;
    failure = error;
  }
  try {
    if (typeof close === 'function') await close.call(document);
  } catch (error) {
    if (failed)
      throw new AggregateError([failure, error], 'DocumentParagraphInspectionAndCloseFailed', {
        cause: failure,
      });
    throw new Error('DocumentParagraphInspectionCloseFailed', { cause: error });
  }
  if (failed) throw failure;
  return output!;
}
