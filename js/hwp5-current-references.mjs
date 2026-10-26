const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const utf16 = new TextDecoder("utf-16le", { fatal: true, ignoreBOM: true });
const encoder = new TextEncoder();
const fields = ["epoch", "kind", "section", "id", "row", "column"];
let scopeSequence = 0n;
const invalid = () => {
  throw new Error("InvalidHwp5CurrentReference");
};
const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const decimal = (value) =>
  typeof value === "string" &&
  /^(0|[1-9][0-9]{0,19})$/.test(value) &&
  BigInt(value) <= 0xffffffffffffffffn;

function validate(reference) {
  if (!reference || typeof reference !== "object" || Array.isArray(reference)) invalid();
  if (
    Object.keys(reference).length !== fields.length ||
    fields.some((key) => !Object.hasOwn(reference, key))
  )
    invalid();
  const { epoch, kind, section, id, row, column } = reference;
  if (
    !decimal(epoch) ||
    epoch === "0" ||
    !decimal(id) ||
    !uint(section) ||
    !uint(row) ||
    !uint(column)
  )
    invalid();
  if (!["original", "generated", "cell"].includes(kind)) invalid();
  if (kind !== "cell" && (row !== 0 || column !== 0 || BigInt(id) > 0xffffffffn)) invalid();
  if (kind !== "original" && id === "0") invalid();
  return reference;
}

export function decodeHwp5CurrentReferences(bytes) {
  const value = JSON.parse(utf8.decode(bytes));
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join() !== "first,references,total,version"
  )
    invalid();
  if (
    value.version !== 1 ||
    !uint(value.total) ||
    !uint(value.first) ||
    value.first > value.total ||
    !Array.isArray(value.references) ||
    value.references.length > 1024 ||
    value.first + value.references.length > value.total
  )
    invalid();
  for (const reference of value.references) validate(reference);
  if (value.references.some((reference) => reference.epoch !== value.references[0].epoch))
    invalid();
  return value;
}

export function createHwp5CurrentReferenceApi({
  wasm,
  memory,
  check,
  output,
  success,
  u32,
  referenceScope,
}) {
  const scope =
    referenceScope === undefined ? String(++scopeSequence) : `${referenceScope}:${++scopeSequence}`;
  const available = () =>
    [
      "hwp5_edit_current_references",
      "hwp5_edit_copy_current_text",
      "hwp5_edit_splice_current",
    ].every((name) => typeof wasm[name] === "function");
  const ready = () => {
    check();
    if (!available()) throw new Error("Hwp5CurrentReferenceAbiUnavailable");
  };
  const encode = (reference) => {
    if (
      !reference ||
      reference.scope !== scope ||
      Object.keys(reference).length !== fields.length + 1
    )
      throw new Error("InvalidCurrentReferenceScope");
    const wire = Object.fromEntries(fields.map((key) => [key, reference[key]]));
    validate(wire);
    return encoder.encode(JSON.stringify(wire));
  };
  const copyCurrentText = (reference) => {
    ready();
    return memory.withBytes(
      encode(reference),
      (ptr, size) => output(() => wasm.hwp5_edit_copy_current_text(ptr, size)).bytes,
    );
  };
  const windowQuery = (name, section, options = {}) => {
    ready();
    if (typeof wasm[name] !== "function")
      throw new Error("Hwp5CurrentSourceReferenceAbiUnavailable");
    if (!options || typeof options !== "object" || Array.isArray(options))
      throw new TypeError("InvalidCurrentWindow");
    const { first = 0, count = 256 } = options;
    const args = [u32(section, "section"), u32(first, "first"), u32(count, "count")];
    if (count > 1024) throw new RangeError("LimitExceeded");
    const window = decodeHwp5CurrentReferences(output(() => wasm[name](...args)).bytes);
    if (
      window.first !== args[1] ||
      window.references.length !== Math.min(args[2], window.total - args[1]) ||
      window.references.some((ref) => ref.section !== args[0])
    )
      invalid();
    return {
      ...window,
      references: window.references.map((reference) => Object.freeze({ ...reference, scope })),
    };
  };
  return {
    supportsCurrentReferences() {
      check();
      return available();
    },
    supportsCurrentSourceReferences() {
      check();
      return available() && typeof wasm.hwp5_edit_current_source_references === "function";
    },
    currentSourceReferences(section, options) {
      const window = windowQuery("hwp5_edit_current_source_references", section, options);
      if (window.references.some((ref) => ref.kind === "cell")) invalid();
      return window;
    },
    currentReferences(section, options = {}) {
      return windowQuery("hwp5_edit_current_references", section, options);
    },
    copyCurrentText,
    currentText(reference) {
      return utf16.decode(copyCurrentText(reference));
    },
    spliceCurrent(options) {
      ready();
      if (!options || typeof options !== "object" || Array.isArray(options))
        throw new TypeError("InvalidCurrentEdit");
      const { reference, startUnit, endUnit, text } = options;
      const range = [u32(startUnit, "startUnit"), u32(endUnit, "endUnit")];
      if (startUnit > endUnit) throw new RangeError("InvalidTextPosition");
      if (typeof text !== "string") throw new TypeError("Text must be a string");
      if (!text.isWellFormed()) throw new Error("InvalidUnicodeEncoding");
      if (text.length > 4 * 1024 * 1024) throw new RangeError("LimitExceeded");
      const bytes = encoder.encode(text);
      if (bytes.length > 4 * 1024 * 1024) throw new RangeError("LimitExceeded");
      memory.withBytes(encode(reference), (ptr, size) =>
        memory.withBytes(bytes, (textPtr, textSize) =>
          success(wasm.hwp5_edit_splice_current(ptr, size, ...range, textPtr, textSize)),
        ),
      );
    },
  };
}
