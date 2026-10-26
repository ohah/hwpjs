import { createMemory } from './wasm-memory.mjs';
import { validateAbi } from './abi.mjs';
import { inputBytes } from './input.mjs';
import { decodeHwp5Text } from './hwp5-text-wire.mjs';
import { sectionInventory, availableSectionExports } from './hwp5-section-inventory.mjs';

/** Read-only HWP5 paragraph-token preview; not a complete document model. */
export async function createHwp5Reader(source) {
  const module = source instanceof WebAssembly.Module ? source : await WebAssembly.compile(source);
  const { exports: wasm } = await WebAssembly.instantiate(module, {});
  validateAbi(wasm);
  const memory = createMemory(wasm);
  let closed = false;
  const readText = (data, availableOnly = false) => {
    if (closed) throw new Error('ReaderClosed');
    if (availableOnly && !availableSectionExports.every((name) => typeof wasm[name] === 'function'))
      throw new Error('AvailableSectionsPreviewUnavailable');
    const bytes = inputBytes(data);
    if (bytes.length > 64 * 1024 * 1024) throw new RangeError('LimitExceeded');
    return memory.withBytes(bytes, (ptr, size) => {
      try {
        const read = availableOnly ? wasm.hwp5_text_read_available : wasm.hwp5_text_read;
        if (!read(ptr, size)) throw memory.error();
        const result = decodeHwp5Text(memory.copy(wasm.hwp5_text_ptr(), wasm.hwp5_text_len()));
        if (
          typeof wasm.hwp5_text_distribution === 'function' &&
          wasm.hwp5_text_distribution() === 1
        ) {
          result.readOnly = true;
          result.primarySource = 'distribution_viewtext';
        }
        if (availableOnly) {
          const declared = wasm.hwp5_text_declared_sections(),
            available = result.sections.length;
          result.readOnly = true;
          result.primarySource =
            result.primarySource === 'distribution_viewtext'
              ? 'available_viewtext'
              : 'available_bodytext';
          result.sectionInventory = sectionInventory(declared, available);
        }
        return result;
      } finally {
        wasm.hwp5_text_free();
      }
    });
  };
  return {
    readText(data) {
      return readText(data);
    },
    readAvailableText(data) {
      return readText(data, true);
    },
    close() {
      if (!closed) wasm.hwp5_text_free();
      closed = true;
    },
  };
}
