import { detectDocumentFormat } from '../../../js/document-format.mjs';
import type { DocumentFormat } from './types/native.ts';
import type { ObservationSdk } from './types/document-view.ts';
import { copyDocumentBytes } from './bytes.ts';
import { HTML_EXPORT_LIMITS } from './limits.ts';

export interface ReadOnlyDocument {
  readonly format: DocumentFormat;
  readonly sourceSha256: string;
  readonly sectionCount: number;
  readonly sdk: ObservationSdk;
  close(): void | Promise<void>;
}
interface ReadHandle {
  sdk: ObservationSdk;
  sectionCount: number;
  close(): void | Promise<void>;
}
export interface ReadDocumentDependencies {
  openHwp5?: (wasm: Uint8Array, bytes: Uint8Array) => Promise<ReadHandle>;
  openHwpx?: (wasm: Uint8Array, bytes: Uint8Array) => Promise<ReadHandle>;
}
const errorMessage = (error: unknown): string => {
  if (error === null || typeof error !== 'object') return '';
  const descriptor = Object.getOwnPropertyDescriptor(error, 'message');
  return typeof descriptor?.value === 'string' ? descriptor.value : '';
};
async function openHwp5(wasm: Uint8Array, bytes: Uint8Array): Promise<ReadHandle> {
  const { createExperimentalHwp5Editor } = await import('../../../js/hwp5-editor.mjs');
  const sdk = await createExperimentalHwp5Editor(wasm, bytes);
  try {
    return { sdk, sectionCount: sdk.sectionCount(), close: () => sdk.close() };
  } catch (error) {
    sdk.close();
    throw error;
  }
}
async function openHwpx(wasm: Uint8Array, bytes: Uint8Array): Promise<ReadHandle> {
  const { createHwpxEditor } = await import('../../../js/hwpx-editor.mjs');
  const sdk = await createHwpxEditor(wasm);
  try {
    return { sdk, sectionCount: sdk.open(bytes).sectionCount, close: () => sdk.close() };
  } catch (error) {
    sdk.close();
    throw error;
  }
}
/** 읽기 전용 관측 수명이다. 편집 옵션을 꾸미거나 저장·이력 함수를 노출하지 않는다. */
export async function openReadOnlyDocument(
  input: { bytes: Uint8Array; wasm: Uint8Array; sourceSha256: string },
  dependencies: ReadDocumentDependencies = {},
): Promise<ReadOnlyDocument> {
  const values: Record<string, unknown> = Object.create(null);
  if (!input || typeof input !== 'object') throw new TypeError('InvalidReadOnlyInput');
  for (const key of ['bytes', 'wasm', 'sourceSha256']) {
    const property = Object.getOwnPropertyDescriptor(input, key);
    if (!property || !Object.hasOwn(property, 'value')) throw new TypeError('InvalidReadOnlyInput');
    values[key] = property.value;
  }
  const sourceSha256 = values.sourceSha256;
  if (typeof sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sourceSha256))
    throw new TypeError('InvalidSourceSha256');
  const bytes = copyDocumentBytes(values.bytes, HTML_EXPORT_LIMITS.documentBytes, 'Document');
  const wasm = copyDocumentBytes(values.wasm, HTML_EXPORT_LIMITS.wasmBytes, 'Wasm');
  const format = detectDocumentFormat(bytes);
  let handle: ReadHandle;
  try {
    handle = await (
      format === 'hwp5' ? (dependencies.openHwp5 ?? openHwp5) : (dependencies.openHwpx ?? openHwpx)
    )(wasm, bytes);
  } catch (error) {
    if (format === 'hwp5' && errorMessage(error) === 'UnsupportedDistribution')
      throw new Error('UnsupportedDistributionDocument', { cause: error });
    throw error;
  }
  try {
    if (
      !Number.isSafeInteger(handle.sectionCount) ||
      handle.sectionCount < 1 ||
      handle.sectionCount > 4096 ||
      !handle.sdk ||
      typeof handle.sdk !== 'object' ||
      typeof handle.close !== 'function'
    )
      throw new Error('InvalidReadOnlyDocument');
  } catch (error) {
    try {
      await handle.close();
    } catch (closeError) {
      throw new AggregateError([error, closeError], 'ReadOnlyAdmissionAndCloseFailed');
    }
    throw error;
  }
  let closed = false;
  return Object.freeze({
    format,
    sourceSha256,
    sectionCount: handle.sectionCount,
    sdk: handle.sdk,
    close: () => {
      if (!closed) {
        closed = true;
        return handle.close();
      }
    },
  });
}
