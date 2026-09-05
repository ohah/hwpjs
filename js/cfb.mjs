import { createMemory } from "./wasm-memory.mjs";
import { decodeEntry } from "./cfb-entry.mjs";
import { createFinder } from "./cfb-find.mjs";
import { validateAbi } from "./abi.mjs";
import { inputBytes, decodeInput } from "./input.mjs";

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
    const rawRequested = Boolean(options.raw);
    const bytes = inputBytes(data);
    loaded = undefined;
    memory.withBytes(bytes, (ptr, size) => {
      if (!wasm.cfb_open(ptr, size)) throw memory.error();
    });
    const result = { FileIndex: [], FullPaths: [] };
    for (let i = 0; i < wasm.cfb_count(); i++) {
      const decoded = decodeEntry(wasm, memory, i);
      result.FileIndex.push(decoded.entry);
      result.FullPaths.push(decoded.path);
    }
    if (rawRequested) {
      const raw = (id) =>
        memory.copy(wasm.cfb_raw_ptr(id), wasm.cfb_raw_len(id));
      result.raw = {
        header: raw(-1),
        sectors: Array.from({ length: wasm.cfb_sector_count() }, (_, i) =>
          raw(i),
        ),
      };
    }
    loaded = result;
    return result;
  }
  function read(data, options = {}) {
    const type = options.type ?? "base64";
    if (type === "file")
      throw new Error("Use cfb-node.mjs for filesystem input");
    return parse(decodeInput(data, type), options);
  }
  return {
    parse,
    read,
    find(container, path) {
      return find(container, path, container === loaded);
    },
    close() {
      wasm.cfb_close();
      loaded = undefined;
    },
  };
}
