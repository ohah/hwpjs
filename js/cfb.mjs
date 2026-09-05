import { createMemory } from "./wasm-memory.mjs";
import { decodeEntry } from "./cfb-entry.mjs";
import { findEntry } from "./cfb-find.mjs";

/** Browser/Node CFB memory API. Returned arrays own their data. */
export async function createCfbReader(source) {
  const module =
    source instanceof WebAssembly.Module
      ? source
      : await WebAssembly.compile(source);
  const { exports: wasm } = await WebAssembly.instantiate(module, {});
  const memory = createMemory(wasm);
  let loaded;
  function parse(data, options = {}) {
    const bytes =
      data instanceof Uint8Array
        ? data
        : data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : Uint8Array.from(data);
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
    if (options.raw) {
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
    if (type === "base64")
      data = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    else if (type === "binary")
      data = Uint8Array.from(data, (c) => c.charCodeAt(0) & 255);
    return parse(data, options);
  }
  return {
    parse,
    read,
    find(container, path) {
      if (container !== loaded) return findEntry(container, path);
      const index = memory.withBytes(
        new TextEncoder().encode(path),
        (ptr, size) => wasm.cfb_find(ptr, size),
      );
      if (index === -2) throw memory.error();
      return index < 0 ? null : container.FileIndex[index];
    },
    close() {
      wasm.cfb_close();
      loaded = undefined;
    },
  };
}
