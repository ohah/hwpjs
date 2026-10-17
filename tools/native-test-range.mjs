const unsigned = value => /^(0|[1-9][0-9]*)$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= 0xffffffff;

export function nativeAuditOptions(args) {
  if (!args.length || !args[0].startsWith("--binary=") || !args[0].slice(9)) throw new Error("ExpectedNativeTestBinary");
  const values = {};
  for (const argument of args.slice(1)) {
    const match = /^--(batch-size|start-index|end-index|expected-sha256)=(.+)$/.exec(argument);
    if (!match || values[match[1]] !== undefined) throw new Error("InvalidNativeAuditArgument");
    values[match[1]] = match[2];
  }
  const size = values["batch-size"] ?? "100", start = values["start-index"] ?? "0", end = values["end-index"];
  if (!unsigned(size) || Number(size) < 1 || Number(size) > 1000) throw new Error("InvalidNativeBatchSize");
  if (!unsigned(start) || (end !== undefined && (!unsigned(end) || Number(end) <= Number(start)))) throw new Error("InvalidNativeTestRange");
  const expectedSha256 = values["expected-sha256"];
  if (expectedSha256 !== undefined && !/^[a-f0-9]{64}$/.test(expectedSha256)) throw new Error("InvalidNativeBinarySha256");
  return { binary: args[0].slice(9), size: Number(size), start: Number(start), end: end === undefined ? null : Number(end), expectedSha256 };
}

export function nativeTestRange(options, count) {
  if (!Number.isSafeInteger(options.start) || options.start < 0 || options.start > 0xffffffff || (options.end !== null && (!Number.isSafeInteger(options.end) || options.end <= options.start))) throw new Error("InvalidNativeTestRange");
  if (!Number.isSafeInteger(count) || count < 1 || count > 0xffffffff) throw new Error("InvalidNativeTestCount");
  const end = options.end ?? count;
  if (options.start >= count || end > count) throw new Error("NativeTestRangeOutsideInventory");
  return { start: options.start, end, fullInventoryCovered: options.start === 0 && end === count };
}
