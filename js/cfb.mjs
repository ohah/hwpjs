import { createMemory } from "./wasm-memory.mjs";
import { decodeEntry } from "./cfb-entry.mjs";
import { createFinder } from "./cfb-find.mjs";
import { validateAbi } from "./abi.mjs";
import { inputBytes, decodeInput } from "./input.mjs";
import { outputBytes } from "./output-bytes.mjs";
import { encodeDocument, decodeDocument } from "./cfb-document.mjs";
export { removeNode } from "./cfb-document.mjs";

/** Browser/Node CFB memory API. Returned arrays own their data. */
export async function createCfbReader(source) {
  const module =
    source instanceof WebAssembly.Module
      ? source
      : await WebAssembly.compile(source);
  const { exports: wasm } = await WebAssembly.instantiate(module, {});
  validateAbi(wasm);
  const memory = createMemory(wasm);
  const find = createFinder(wasm, memory);
  let loaded;
  function parse(data, options = {}) {
    const rawRequested = Boolean(options?.raw);
    const output = outputBytes(data);
    const bytes = inputBytes(data);
    const open = options?.strict ? wasm.cfb_open_strict : wasm.cfb_open;
    let beganOpen = false;
    try {
      memory.withBytes(bytes, (ptr, size) => {
        // Before this boundary, preparation/allocation failures preserve both states.
        beganOpen = true;
        loaded = undefined;
        if (!open(ptr, size)) throw memory.error();
      });
      const result = { FileIndex: [], FullPaths: [] };
      for (let i = 0; i < wasm.cfb_count(); i++) {
        const decoded = decodeEntry(wasm, memory, i, output);
        result.FileIndex.push(decoded.entry);
        result.FullPaths.push(decoded.path);
      }
      if (rawRequested) {
        const raw = (id) =>
          output.raw(memory.copy(wasm.cfb_raw_ptr(id), wasm.cfb_raw_len(id)));
        result.raw = {
          header: raw(-1),
          sectors: Array.from({ length: wasm.cfb_sector_count() }, (_, i) =>
            raw(i),
          ),
        };
      }
      loaded = result;
      return result;
    } catch (error) {
      // Open or JS result conversion failed: never leave a native-only document.
      if (beganOpen) {
        wasm.cfb_close();
        loaded = undefined;
      }
      throw error;
    }
  }
  function read(data, options = {}) {
    const type = options?.type || "base64";
    if (type === "file")
      throw new Error("Use cfb-node.mjs for filesystem input");
    return parse(decodeInput(data, type), options);
  }
  return {
    write(document) {
      return memory.withBytes(encodeDocument(document), (ptr, size) => {
        try {
          if (!wasm.cfb_write(ptr, size)) throw memory.error();
          return memory.copy(wasm.cfb_output_ptr(), wasm.cfb_output_len());
        } finally {
          wasm.cfb_output_free();
        }
      });
    },
    document() {
      try {
        if (!wasm.cfb_document()) throw memory.error();
        return decodeDocument(
          memory.copy(wasm.cfb_output_ptr(), wasm.cfb_output_len()),
        );
      } finally {
        wasm.cfb_output_free();
      }
    },
    findExact(path) {
      if (typeof path !== "string" || !path.isWellFormed())
        throw new TypeError("InvalidName");
      return memory.withBytes(new TextEncoder().encode(path), (ptr, size) => {
        const index = wasm.cfb_find_exact(ptr, size);
        if (index === -2) throw memory.error();
        return index < 0 ? null : loaded.FileIndex[index];
      });
    },
    parse,
    read,
    find(container, path) {
      return find(container, path, container === loaded);
    },
    close() {
      wasm.cfb_output_free();
      wasm.cfb_close();
      loaded = undefined;
    },
  };
}
