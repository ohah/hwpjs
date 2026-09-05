/** Decode the numeric ABI into the legacy FileIndex/FullPaths representation. */
export function decodeEntry(wasm, memory, index) {
  const field = (key) =>
    memory.copy(wasm.cfb_field_ptr(index, key), wasm.cfb_field_len(index, key));
  const number = (key) => Number(wasm.cfb_value(index, key));
  const decoder = new TextDecoder();
  const e = {
    name: decoder.decode(field(0)),
    type: number(0),
    color: number(1),
    L: number(2) | 0,
    R: number(3) | 0,
    C: number(4) | 0,
    clsid: Array.from(field(3), (b) => b.toString(16).padStart(2, "0")).join(
      "",
    ),
    state: number(5) | 0,
    start: number(8) | 0,
    size: number(9),
  };
  // Match legacy FILETIME -> JS Date conversion, including floating-point rounding.
  for (const [key, name] of [
    [6, "ct"],
    [7, "mt"],
  ]) {
    const ticks = wasm.cfb_value(index, key);
    if (ticks)
      e[name] = new Date(
        ((Number(ticks >> 32n) / 1e7) * 2 ** 32 +
          Number(ticks & 0xffffffffn) / 1e7 -
          11644473600) *
          1000,
      );
  }
  if (e.type !== 5) e.storage = e.size >= 4096 ? "fat" : "minifat";
  if (e.type === 2) e.content = field(2);
  return { entry: e, path: decoder.decode(field(1)) };
}
