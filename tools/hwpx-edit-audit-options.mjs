// Shared CLI boundary for plain and specialized HWPX edit audits.
export function parseEditAuditOptions(
  args,
  {
    allowHistory = false,
    requireWasm = false,
    allowParagraphRange = false,
    allowProgress = false,
  } = {},
) {
  const options = {};
  for (const argument of args) {
    if (allowProgress && argument.startsWith("--progress-every=")) {
      if (options.progressEvery !== undefined) throw new Error("DuplicateAuditArgument");
      const raw = argument.slice("--progress-every=".length);
      if (!/^[1-9][0-9]*$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > 1000000)
        throw new Error("InvalidAuditProgressInterval");
      options.progressEvery = Number(raw);
      continue;
    }
    if (allowParagraphRange && argument.startsWith("--paragraphs=")) {
      if (options.paragraphRange !== undefined) throw new Error("DuplicateAuditArgument");
      const range = /^--paragraphs=([1-9][0-9]*):([1-9][0-9]*)$/.exec(argument);
      if (!range) throw new Error("InvalidAuditParagraphRange");
      const start = Number(range[1]),
        end = Number(range[2]);
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start >= end ||
        end > 0x100000000
      )
        throw new Error("InvalidAuditParagraphRange");
      options.paragraphRange = { start, end };
      continue;
    }
    if (argument === "--history" && allowHistory) {
      if (options.history !== undefined) throw new Error("DuplicateAuditArgument");
      options.history = true;
      continue;
    }
    const match = /^--(wasm|fixture)=(.+)$/.exec(argument);
    if (!match) throw new Error(`Unknown argument: ${argument}`);
    if (options[match[1]] !== undefined) throw new Error("DuplicateAuditArgument");
    options[match[1]] = match[2];
  }
  if (requireWasm && options.wasm === undefined) throw new Error("MissingAuditWasm");
  if (options.paragraphRange && (options.fixture === undefined || options.wasm === undefined))
    throw new Error("AuditParagraphRangeRequiresFixtureAndWasm");
  return options;
}
