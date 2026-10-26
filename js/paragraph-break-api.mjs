// Optional flow-break command. Never fall back to an ordinary paragraph split.
export function createParagraphBreakApi({
  wasm,
  memory,
  check,
  uint,
  prefix,
  endAsCount,
  unavailable,
}) {
  const name = `${prefix}_split_with_break`;
  return {
    supportsParagraphBreaks() {
      check();
      return typeof wasm[name] === "function";
    },
    splitParagraphWithBreak({ section, paragraph, atUnit, endUnit = atUnit, kind }) {
      check();
      const values = [section, paragraph, atUnit, endUnit];
      for (const [index, label] of ["section", "paragraph", "atUnit", "endUnit"].entries())
        uint(values[index], label);
      if (endUnit < atUnit) throw new RangeError("InvalidTextPosition");
      if (kind !== "page" && kind !== "column") throw new Error("InvalidParagraphBreakKind");
      if (typeof wasm[name] !== "function") throw new Error(unavailable);
      if (
        wasm[name](
          section,
          paragraph,
          atUnit,
          endAsCount ? endUnit - atUnit : endUnit,
          kind === "page" ? 1 : 2,
        ) !== 1
      )
        throw memory.error();
    },
  };
}
