import { detectDocumentFormat } from '../../../js/document-format.mjs';
import {
  captureImageInsertionRequest,
  createImageInserter,
} from '../../../js/image-file-insertion.mjs';
import {
  copyPictureInput,
  PICTURE_REPLACEMENT_LIMITS as limits,
} from '../../../js/picture-replacement-input.mjs';
import type { DocumentFormat } from './types/native-document.ts';

export interface ImageInsertionRequest {
  format: DocumentFormat;
  section: number;
  paragraph: number;
  unit: number;
  expectedText: string;
  expectedSha256: string;
  imageBytes: Uint8Array;
  width: number;
  height: number;
}
export interface ImageInserter {
  insert(input: Uint8Array, request: ImageInsertionRequest): Uint8Array | Promise<Uint8Array>;
  close(): void | Promise<void>;
}
export interface ImageInsertionDependencies {
  createInserter?: (wasm: Uint8Array) => ImageInserter | Promise<ImageInserter>;
}
export interface ImageInsertionResult {
  format: DocumentFormat;
  sourceSha256: string;
  bytes: Uint8Array;
  imageSha256: string;
  layoutRequiresReflow: true;
  previewStale: true;
}
const inputKeys = [
  'bytes',
  'wasm',
  'expectedSha256',
  'target',
  'unit',
  'expectedText',
  'imageBytes',
  'width',
  'height',
];
function capture(input: unknown, keys: string[]): Record<string, unknown> {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Reflect.ownKeys(input).some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    throw new TypeError('InvalidImageInsertionInput');
  const fields: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value'))
      throw new TypeError('InvalidImageInsertionInput');
    fields[key] = descriptor.value;
  }
  return fields;
}
async function digest(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, '0')).join('');
}

// Native file preparation owns top-level body membership, full raw-text equality,
// format/security parsing and control boundaries. No editing Session is opened here.
export async function insertDocumentImage(
  input: unknown,
  dependencies: ImageInsertionDependencies = {},
): Promise<ImageInsertionResult> {
  const fields = capture(input, inputKeys);
  const target = capture(fields.target, ['section', 'paragraph']);
  const source = copyPictureInput(fields.bytes, limits.documentBytes, 'Document');
  const wasm = copyPictureInput(fields.wasm, limits.wasmBytes, 'Wasm');
  const format = detectDocumentFormat(source);
  const request = captureImageInsertionRequest({
    format,
    section: target.section,
    paragraph: target.paragraph,
    unit: fields.unit,
    expectedText: fields.expectedText,
    expectedSha256: fields.expectedSha256,
    imageBytes: fields.imageBytes,
    width: fields.width,
    height: fields.height,
  });
  const create = dependencies.createInserter ?? createImageInserter;
  // All caller-owned buffers, scalars and nested target fields are captured above.
  const [sourceSha256, imageSha256] = await Promise.all([
    digest(source),
    digest(request.imageBytes),
  ]);
  if (sourceSha256 !== request.expectedSha256) throw new Error('SourceSha256Mismatch');
  let inserter: ImageInserter | undefined;
  let result: ImageInsertionResult | undefined;
  let failure: unknown,
    failed = false;
  try {
    inserter = await create(Uint8Array.from(wasm));
    if (!inserter || typeof inserter.insert !== 'function' || typeof inserter.close !== 'function')
      throw new Error('InvalidImageInserter');
    const output = await inserter.insert(Uint8Array.from(source), request);
    const bytes = copyPictureInput(output, limits.outputBytes, 'Output');
    if (detectDocumentFormat(bytes) !== format) throw new Error('ImageInsertionFormatMismatch');
    result = {
      format,
      sourceSha256,
      bytes,
      imageSha256,
      layoutRequiresReflow: true,
      previewStale: true,
    };
  } catch (error) {
    failed = true;
    failure = error;
  }
  const errors: unknown[] = [];
  if (inserter && typeof inserter.close === 'function') {
    try {
      await inserter.close();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length)
    throw new AggregateError(failed ? [failure, ...errors] : errors, 'ImageInsertionCleanupFailed');
  if (failed) throw failure;
  if (!result) throw new Error('InvalidImageInsertionResult');
  return result;
}
