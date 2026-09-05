import { FIELD, VALUE } from "./abi-schema.mjs";
import { attachCursor } from "./blob-cursor.mjs";

/** Decode the numeric ABI into the legacy FileIndex/FullPaths representation. */
export function decodeEntry(wasm, memory, index, output) {
  const field = (key) =>
    memory.copy(wasm.cfb_field_ptr(index, key), wasm.cfb_field_len(index, key));
  const unsigned = (key) => BigInt.asUintN(64, wasm.cfb_value(index, key));
  const number = (key) => Number(unsigned(key));
  // Names are UTF-8 fields, not standalone text files; U+FEFF is part of the name.
  const decoder = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true });
  const e = {
    name: decoder.decode(field(FIELD.name)),
    type: number(VALUE.kind),
    color: number(VALUE.color),
    L: number(VALUE.left) | 0,
    R: number(VALUE.right) | 0,
    C: number(VALUE.child) | 0,
    clsid: Array.from(field(FIELD.clsid), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join(""),
    state: number(VALUE.state) | 0,
    start: number(VALUE.start) | 0,
    size: number(VALUE.size),
  };
  // Match legacy FILETIME -> JS Date conversion, including floating-point rounding.
  for (const [key, name] of [
    [VALUE.created, "ct"],
    [VALUE.modified, "mt"],
  ]) {
    const ticks = unsigned(key);
    if (ticks)
      e[name] = new Date(
        ((Number(ticks >> 32n) / 1e7) * 2 ** 32 +
          Number(ticks & 0xffffffffn) / 1e7 -
          11644473600) *
          1000,
      );
  }
  if (e.type !== 5) e.storage = number(VALUE.uses_fat) ? "fat" : "minifat";
  if (number(VALUE.has_content))
    e.content = attachCursor(output.content(field(FIELD.content)));
  return { entry: e, path: decoder.decode(field(FIELD.path)) };
}
