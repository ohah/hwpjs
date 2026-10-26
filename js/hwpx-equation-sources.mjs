// Source identity/structural availability only, never editable string state.
export function decodeEquationSources(bytes) {
  const fail = () => {
    throw new Error("InvalidHwpxEquationSources");
  };
  let rows;
  try {
    rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return fail();
  }
  return validateEquationSources(rows);
}

export function validateEquationSources(rows) {
  const fail = () => {
    throw new Error("InvalidHwpxEquationSources");
  };
  if (!Array.isArray(rows) || rows.length > 100000) return fail();
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  const seen = new Set();
  const issues = new Set([
    null,
    "inactive",
    "inline_text_descendant",
    "unsupported_encoding",
    "missing_script",
    "multiple_scripts",
    "nested_script",
  ]);
  let previous = -1;
  for (const row of rows) {
    if (
      !row ||
      !uint(row.node) ||
      row.node <= previous ||
      typeof row.active !== "boolean" ||
      !uint(row.script_count) ||
      !issues.has(row.issue)
    )
      return fail();
    if (
      row.script_count === 0
        ? row.script_node !== null
        : !uint(row.script_node) || row.script_node <= row.node
    )
      return fail();
    if (row.issue === null && (!row.active || row.script_count !== 1)) return fail();
    if (!row.active && !["inactive", "inline_text_descendant"].includes(row.issue)) return fail();
    if (
      (row.issue === "inactive" && row.active) ||
      (row.issue === "missing_script" && row.script_count !== 0) ||
      (row.issue === "multiple_scripts" && row.script_count < 2) ||
      (row.issue === "nested_script" && row.script_count !== 1)
    )
      return fail();
    for (const node of [row.node, row.script_node])
      if (node !== null) {
        if (seen.has(node)) return fail();
        seen.add(node);
      }
    previous = row.node;
  }
  return rows;
}
