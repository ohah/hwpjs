import { createMemory } from './wasm-memory.mjs';

/** A constructor gets a fresh instance; it cannot mutate a live editor session. */
export async function createNewDocumentBytes(source, format = 'hwpx') {
  if (!['hwp5', 'hwpx'].includes(format)) throw Error('InvalidDocumentFormat');
  const module = source instanceof WebAssembly.Module ? source : await WebAssembly.compile(source);
  const { exports: wasm } = await WebAssembly.instantiate(module, {});
  return copyNewDocumentOutput(wasm, format);
}

/** ABI boundary kept independently testable without a Native build. */
export function copyNewDocumentOutput(wasm, format = 'hwpx') {
  if (!['hwp5', 'hwpx'].includes(format)) throw Error('InvalidDocumentFormat');
  for (const name of [
    'new_document_create',
    'new_document_output_ptr',
    'new_document_output_len',
    'new_document_output_free',
    'cfb_error_ptr',
    'cfb_error_len',
  ]) {
    if (typeof wasm[name] !== 'function') throw Error('NewDocumentUnsupported');
  }
  if (!(wasm.memory instanceof WebAssembly.Memory)) throw Error('MissingNewDocumentMemory');
  const memory = createMemory(wasm);
  try {
    const status = wasm.new_document_create(format === 'hwp5' ? 1 : 2);
    if (status !== 1) throw memory.error();
    const ptr = wasm.new_document_output_ptr();
    const len = wasm.new_document_output_len();
    if (
      !Number.isSafeInteger(ptr) ||
      !Number.isSafeInteger(len) ||
      ptr < 0 ||
      len <= 0 ||
      ptr > wasm.memory.buffer.byteLength - len
    )
      throw Error('InvalidNewDocumentOutput');
    return memory.copy(ptr, len);
  } finally {
    wasm.new_document_output_free();
  }
}
