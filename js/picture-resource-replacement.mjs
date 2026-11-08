import { ABI_VERSION } from './abi-schema.mjs';
import { createMemory } from './wasm-memory.mjs';
import {
  copyPictureInput,
  PICTURE_REPLACEMENT_LIMITS as limits,
} from './picture-replacement-input.mjs';

const uint = (value) =>
  Number.isInteger(value) && !Object.is(value, -0) && value >= 0 && value <= 0xffffffff;

// A fresh instance owns this file transform; live editor sessions and undo are untouched.
export async function createPictureReplacer(
  source,
  { instantiate = WebAssembly.instantiate } = {},
) {
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
    'picture_file_replace',
    'picture_file_replace_ptr',
    'picture_file_replace_len',
    'picture_file_replace_free',
  ]) {
    if (typeof wasm?.[name] !== 'function') throw new Error('PictureReplacementAbiUnavailable');
  }
  if (wasm.hwpjs_abi_version() !== ABI_VERSION)
    throw new Error('PictureReplacementAbiVersionMismatch');
  if (!(wasm.memory instanceof WebAssembly.Memory))
    throw new Error('MissingPictureReplacementMemory');
  const memory = createMemory(wasm);
  let closed = false;
  return {
    replace(input, request) {
      if (closed) throw new Error('PictureReplacerClosed');
      if (
        !request ||
        typeof request !== 'object' ||
        Array.isArray(request) ||
        Reflect.ownKeys(request).some(
          (key) => !['format', 'section', 'pictureNode', 'bytes'].includes(key),
        )
      )
        throw new TypeError('InvalidPictureReplacementTarget');
      const fields = Object.create(null);
      for (const name of ['format', 'section', 'pictureNode', 'bytes']) {
        const descriptor = Object.getOwnPropertyDescriptor(request, name);
        if (!descriptor || !Object.hasOwn(descriptor, 'value'))
          throw new TypeError('InvalidPictureReplacementTarget');
        fields[name] = descriptor.value;
      }
      const { format, section, pictureNode, bytes } = fields;
      if (!['hwp5', 'hwpx'].includes(format) || !uint(section) || !uint(pictureNode))
        throw new TypeError('InvalidPictureReplacementTarget');
      const document = copyPictureInput(input, limits.documentBytes, 'Document');
      const image = copyPictureInput(bytes, limits.imageBytes, 'Image');
      let result,
        failure,
        failed = false;
      try {
        result = memory.withBytes(document, (ptr, size) =>
          memory.withBytes(image, (imagePtr, imageSize) => {
            if (
              wasm.picture_file_replace(
                format === 'hwp5' ? 1 : 2,
                ptr,
                size,
                section,
                pictureNode,
                imagePtr,
                imageSize,
              ) !== 1
            )
              throw memory.error();
            const outputPtr = wasm.picture_file_replace_ptr(),
              length = wasm.picture_file_replace_len();
            if (
              !uint(outputPtr) ||
              outputPtr === 0 ||
              !uint(length) ||
              length === 0 ||
              length > limits.outputBytes ||
              outputPtr > wasm.memory.buffer.byteLength - length
            )
              throw new RangeError('InvalidPictureReplacementOutput');
            return memory.copy(outputPtr, length);
          }),
        );
      } catch (error) {
        failed = true;
        failure = error;
      }
      try {
        wasm.picture_file_replace_free();
      } catch (error) {
        if (failed)
          throw new AggregateError([failure, error], 'PictureReplacementAndCleanupFailed');
        throw error;
      }
      if (failed) throw failure;
      return result;
    },
    close() {
      if (!closed) {
        closed = true;
        wasm.picture_file_replace_free();
      }
    },
  };
}
