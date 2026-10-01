import { createMemory } from "./wasm-memory.mjs";
import { validateAbi } from "./abi.mjs";
import { inputBytes } from "./input.mjs";

/** Experimental plain-paragraph editing; paragraph numbers are document-wide, 1-based. */
export async function createHwpxEditor(source) {
  const module = source instanceof WebAssembly.Module ? source : await WebAssembly.compile(source);
  const { exports: wasm } = await WebAssembly.instantiate(module, {});
  validateAbi(wasm);
  for (const suffix of ["open", "close", "section_count", "can_edit", "splice", "save", "output_ptr", "output_len", "output_free"])
    if (typeof wasm[`hwpx_edit_${suffix}`] !== "function") throw new Error("HwpxEditAbiUnavailable");
  const memory = createMemory(wasm);
  let closed = false;
  function ready() { if (closed) throw new Error("EditorClosed"); }
  function uint(value) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError("InvalidInteger");
    return value;
  }
  return {
    canEdit(section, paragraph) {
      ready(); uint(section); uint(paragraph);
      const result = wasm.hwpx_edit_can_edit(section, paragraph);
      if (result > 1) throw memory.error();
      return result === 1;
    },
    open(data) {
      ready();
      const bytes = inputBytes(data);
      if (bytes.length > 64 * 1024 * 1024) throw new RangeError("LimitExceeded");
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_open(ptr, size)) throw memory.error();
      });
      return { sectionCount: wasm.hwpx_edit_section_count() };
    },
    splice(section, paragraph, start, deleted, text) {
      ready();
      [section, paragraph, start, deleted].forEach(uint);
      if (typeof text !== "string") throw new TypeError("InvalidText");
      if (!text.isWellFormed()) throw new TypeError("InvalidText");
      const bytes = new TextEncoder().encode(text);
      if (bytes.length > 4 * 1024 * 1024) throw new RangeError("LimitExceeded");
      memory.withBytes(bytes, (ptr, size) => {
        if (!wasm.hwpx_edit_splice(section, paragraph, start, deleted, ptr, size)) throw memory.error();
      });
    },
    save() {
      ready();
      try {
        if (!wasm.hwpx_edit_save()) throw memory.error();
        return memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len());
      } finally { wasm.hwpx_edit_output_free(); }
    },
    close() { if (!closed) wasm.hwpx_edit_close(); closed = true; },
  };
}
