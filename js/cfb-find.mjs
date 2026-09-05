import { encodeSnapshot } from "./cfb-search-snapshot.mjs";

/** Both active and retained documents use src/cfb/find.zig, including its Unicode table. */
export function createFinder(wasm, memory) {
  const snapshots = new WeakMap();
  const encoder = new TextEncoder();
  return (container, path, active) => {
    if (typeof path !== "string")
      throw new TypeError("CFB search path must be a string");
    // The parser rejects invalid UTF-16 names. Do not alias invalid queries to U+FFFD.
    if (!path.isWellFormed()) return null;
    const index = memory.withBytes(encoder.encode(path), (query, length) => {
      if (active) return wasm.cfb_find(query, length);
      let snapshot = snapshots.get(container);
      if (!snapshot) {
        snapshot = encodeSnapshot(container);
        snapshots.set(container, snapshot);
      }
      return memory.withBytes(snapshot, (ptr, size) =>
        wasm.cfb_find_snapshot(ptr, size, query, length),
      );
    });
    if (index === -2) throw memory.error();
    return index < 0 ? null : container.FileIndex[index];
  };
}
