// Shared CLI boundary for plain and specialized HWPX edit audits.
export function parseEditAuditOptions(args, { allowHistory = false, requireWasm = false } = {}) {
  const options = {};
  for (const argument of args) {
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
  return options;
}
