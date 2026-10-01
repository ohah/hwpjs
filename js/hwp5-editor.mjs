import { validateAbi } from "./abi.mjs";
import { createMemory } from "./wasm-memory.mjs";
import { inputBytes } from "./input.mjs";
import { EXPERIMENTAL_EDITOR_FUNCTIONS } from "./abi-schema.mjs";
import { createHistoryApi } from "./editor-history.mjs";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-16le", { fatal: true, ignoreBOM: true });
const u32 = (value, name) => { if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError(`Invalid ${name}`); return value; };

/** Experimental HWP5 editing only. No page layout or resource creation. */
export async function createExperimentalHwp5Editor(source, input) {
  const module = source instanceof WebAssembly.Module ? source : await WebAssembly.compile(source);
  const { exports: wasm } = await WebAssembly.instantiate(module, {});
  validateAbi(wasm);
  for (const name of EXPERIMENTAL_EDITOR_FUNCTIONS) if (typeof wasm[name] !== "function") throw new Error(`Missing experimental editor export: ${name}`);
  const memory = createMemory(wasm);
  let closed = false;
  const check = () => { if (closed) throw new Error("EditorClosed"); };
  const success = value => { if (!value) throw memory.error(); };
  const count = value => { if ((value >>> 0) === 0xffffffff) throw memory.error(); return value >>> 0; };
  const output = action => {
    try { success(action()); return { bytes: memory.copy(wasm.hwp5_edit_output_ptr(), wasm.hwp5_edit_output_len()), layoutRequiresReflow: Boolean(wasm.hwp5_edit_reflow()) }; }
    finally { wasm.hwp5_edit_output_free(); }
  };
  const bytes = inputBytes(input);
  if (bytes.length > 64 * 1024 * 1024) throw new RangeError("LimitExceeded");
  memory.withBytes(bytes, (ptr, size) => success(wasm.hwp5_edit_open(ptr, size)));
  const copyText = (section, paragraph) => { check(); return output(() => wasm.hwp5_edit_copy_text(u32(section, "section"), u32(paragraph, "paragraph"))).bytes; };
  return {
    ...createHistoryApi({ wasm, memory, check, uint: u32, prefix: "hwp5_edit", unavailable: "Hwp5HistoryAbiUnavailable" }),
    sectionCount() { check(); return count(wasm.hwp5_edit_section_count()); },
    paragraphCount(section) { check(); return count(wasm.hwp5_edit_paragraph_count(u32(section, "section"))); },
    characterShapeCount() { check(); return count(wasm.hwp5_edit_char_shape_count()); },
    copyText,
    text(section, paragraph) { check(); return decoder.decode(copyText(section, paragraph)); },
    splice({ section, paragraph, startUnit, endUnit, text, rangePolicy = "reject" }) {
      check();
      const values = [u32(section, "section"), u32(paragraph, "paragraph"), u32(startUnit, "startUnit"), u32(endUnit, "endUnit")];
      if (typeof text !== "string") throw new TypeError("Text must be a string");
      if (!text.isWellFormed()) throw new Error("InvalidUnicodeEncoding");
      if (rangePolicy !== "reject" && rangePolicy !== "half-open") throw new Error("InvalidRangePolicy");
      if (text.length > 4 * 1024 * 1024) throw new RangeError("LimitExceeded");
      const bytes = encoder.encode(text);
      if (bytes.length > 4 * 1024 * 1024) throw new RangeError("LimitExceeded");
      memory.withBytes(bytes, (ptr, size) => success(wasm.hwp5_edit_splice(...values, ptr, size, rangePolicy === "half-open" ? 1 : 0)));
    },
    setCharacterFormat({ section, paragraph, startUnit, endUnit, charShapeId }) {
      check(); success(wasm.hwp5_edit_format(u32(section, "section"), u32(paragraph, "paragraph"), u32(startUnit, "startUnit"), u32(endUnit, "endUnit"), u32(charShapeId, "charShapeId")));
    },
    save({ allowStaleLayout = false } = {}) {
      check(); if (typeof allowStaleLayout !== "boolean") throw new TypeError("allowStaleLayout must be boolean");
      return output(() => wasm.hwp5_edit_save(allowStaleLayout ? 1 : 0));
    },
    close() { if (!closed) wasm.hwp5_edit_close(); closed = true; },
  };
}
