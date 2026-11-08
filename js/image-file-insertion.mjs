import { ABI_VERSION } from './abi-schema.mjs';
import { createMemory } from './wasm-memory.mjs';
import {
  copyPictureInput,
  PICTURE_REPLACEMENT_LIMITS as limits,
} from './picture-replacement-input.mjs';

export const IMAGE_INSERTION_REQUEST_BYTES = 4 * 1024 * 1024;
const headerBytes = 64;
const encoder = new TextEncoder();
const uint = (value) =>
  Number.isInteger(value) && !Object.is(value, -0) && value >= 0 && value <= 0xffffffff;
const keys = [
  'format',
  'section',
  'paragraph',
  'unit',
  'expectedText',
  'expectedSha256',
  'imageBytes',
  'width',
  'height',
];

// Shared by the service and bridge. Capture own data fields without invoking getters.
export function captureImageInsertionRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new TypeError('InvalidImageInsertionRequest');
  if (Reflect.ownKeys(input).some((key) => !keys.includes(key)))
    throw new TypeError('InvalidImageInsertionRequest');
  const fields = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value'))
      throw new TypeError('InvalidImageInsertionRequest');
    fields[key] = descriptor.value;
  }
  const { format, section, paragraph, unit, width, height, expectedText, expectedSha256 } = fields;
  if (
    !['hwp5', 'hwpx'].includes(format) ||
    !uint(section) ||
    !uint(paragraph) ||
    (format === 'hwpx' && paragraph === 0) ||
    !uint(unit)
  )
    throw new TypeError('InvalidImageInsertionTarget');
  // HWPUNIT = 1/7200 inch. Native rectangle coordinates must also fit signed i32.
  if (
    !uint(width) ||
    !uint(height) ||
    width < 1 ||
    height < 1 ||
    width > 0x7fffffff ||
    height > 0x7fffffff
  )
    throw new RangeError('InvalidImageInsertionSize');
  if (typeof expectedSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(expectedSha256))
    throw new TypeError('InvalidExpectedSha256');
  if (typeof expectedText !== 'string' || !expectedText.isWellFormed())
    throw new TypeError('InvalidImageInsertionText');
  if (expectedText.length > IMAGE_INSERTION_REQUEST_BYTES - headerBytes)
    throw new RangeError('ImageInsertionRequestByteLimitExceeded');
  const text = encoder.encode(expectedText);
  if (text.length > IMAGE_INSERTION_REQUEST_BYTES - headerBytes)
    throw new RangeError('ImageInsertionRequestByteLimitExceeded');
  if (
    unit > expectedText.length ||
    (unit > 0 &&
      unit < expectedText.length &&
      expectedText.charCodeAt(unit - 1) >= 0xd800 &&
      expectedText.charCodeAt(unit - 1) <= 0xdbff &&
      expectedText.charCodeAt(unit) >= 0xdc00 &&
      expectedText.charCodeAt(unit) <= 0xdfff)
  )
    throw new RangeError('InvalidImageInsertionPosition');
  const imageBytes = copyPictureInput(fields.imageBytes, limits.imageBytes, 'Image');
  return {
    format,
    section,
    paragraph,
    unit,
    width,
    height,
    expectedText,
    expectedSha256,
    imageBytes,
  };
}

function encodeRequest(request) {
  const text = encoder.encode(request.expectedText);
  const bytes = new Uint8Array(headerBytes + text.length);
  const view = new DataView(bytes.buffer);
  [
    1,
    request.section,
    request.paragraph,
    request.unit,
    request.width,
    request.height,
    text.length,
    0,
  ].forEach((value, index) => view.setUint32(index * 4, value, true));
  for (let index = 0; index < 32; index++)
    bytes[32 + index] = Number.parseInt(request.expectedSha256.slice(index * 2, index * 2 + 2), 16);
  bytes.set(text, headerBytes);
  return bytes;
}

// Optional additive ABI6 surface. This file transform never opens a live editor.
export async function createImageInserter(source, { instantiate = WebAssembly.instantiate } = {}) {
  const binary =
    source instanceof WebAssembly.Module
      ? source
      : copyPictureInput(source, limits.wasmBytes, 'Wasm');
  const module = binary instanceof WebAssembly.Module ? binary : await WebAssembly.compile(binary);
  const { exports: wasm } = await instantiate(module, {});
  for (const name of [
    'hwpjs_abi_version',
    'cfb_alloc',
    'cfb_free',
    'cfb_error_ptr',
    'cfb_error_len',
    'image_file_insert',
    'image_file_insert_ptr',
    'image_file_insert_len',
    'image_file_insert_free',
  ])
    if (typeof wasm?.[name] !== 'function') throw new Error('ImageInsertionAbiUnavailable');
  if (wasm.hwpjs_abi_version() !== ABI_VERSION) throw new Error('ImageInsertionAbiVersionMismatch');
  if (!(wasm.memory instanceof WebAssembly.Memory)) throw new Error('MissingImageInsertionMemory');
  let closed = false;
  let busy = false;
  return {
    insert(input, request) {
      if (closed) throw new Error('ImageInserterClosed');
      if (busy) throw new Error('ImageInserterBusy');
      const captured = captureImageInsertionRequest(request);
      const document = copyPictureInput(input, limits.documentBytes, 'Document');
      const wire = encodeRequest(captured);
      const cleanupErrors = [];
      // Reuse allocation/copy logic while preserving errors from every input free.
      const memory = createMemory({
        ...wasm,
        cfb_free(ptr, length) {
          try {
            wasm.cfb_free(ptr, length);
          } catch (error) {
            cleanupErrors.push(error);
          }
        },
      });
      let result,
        failure,
        failed = false;
      busy = true;
      try {
        try {
          result = memory.withBytes(document, (ptr, size) =>
            memory.withBytes(wire, (requestPtr, requestSize) =>
              memory.withBytes(captured.imageBytes, (imagePtr, imageSize) => {
                if (
                  wasm.image_file_insert(
                    captured.format === 'hwp5' ? 1 : 2,
                    ptr,
                    size,
                    requestPtr,
                    requestSize,
                    imagePtr,
                    imageSize,
                  ) !== 1
                )
                  throw memory.error();
                const outputPtr = wasm.image_file_insert_ptr();
                const length = wasm.image_file_insert_len();
                if (
                  !uint(outputPtr) ||
                  outputPtr === 0 ||
                  !uint(length) ||
                  length === 0 ||
                  length > limits.outputBytes ||
                  outputPtr > wasm.memory.buffer.byteLength - length
                )
                  throw new RangeError('InvalidImageInsertionOutput');
                return memory.copy(outputPtr, length);
              }),
            ),
          );
        } catch (error) {
          failed = true;
          failure = error;
        }
        try {
          wasm.image_file_insert_free();
        } catch (error) {
          cleanupErrors.push(error);
        }
        if (cleanupErrors.length)
          throw new AggregateError(
            failed ? [failure, ...cleanupErrors] : cleanupErrors,
            'ImageInsertionAndCleanupFailed',
          );
        if (failed) throw failure;
        return result;
      } finally {
        busy = false;
      }
    },
    close() {
      if (busy) throw new Error('ImageInserterBusy');
      if (!closed) {
        closed = true;
        wasm.image_file_insert_free();
      }
    },
  };
}
