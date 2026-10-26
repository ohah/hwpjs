export function validateHwp5PageControlSources(rows) {
  const fail = () => {
    throw new Error("InvalidHwp5PageControlSources");
  };
  const uint = (value, max = 0xffffffff) => Number.isInteger(value) && value >= 0 && value <= max;
  if (!Array.isArray(rows)) fail();
  const ids = new Set(),
    positions = new Set();
  for (const row of rows) {
    if (
      !row ||
      !["position", "hide", "restart", "parity"].includes(row.kind) ||
      ![
        "control_node",
        "paragraph",
        "source_unit",
        "current_unit",
        "attributes",
        "extra_bytes",
      ].every((key) => uint(row[key])) ||
      row.source_unit > 0xfffffff7 ||
      row.current_unit > 0xfffffff7 ||
      typeof row.extra_nonzero !== "boolean" ||
      (row.extra_bytes === 0 && row.extra_nonzero) ||
      ids.has(row.control_node)
    )
      fail();
    for (const field of ["number", "symbol", "prefix", "suffix", "dash"]) {
      const present =
        row.kind === "position" ? field !== "number" : row.kind === "restart" && field === "number";
      if (present ? !uint(row[field], 65535) : row[field] !== null) fail();
    }
    const position = `${row.paragraph}:${row.current_unit}`;
    if (positions.has(position)) fail();
    ids.add(row.control_node);
    positions.add(position);
  }
  return rows;
}
export function decodeHwp5PageControlSources(bytes) {
  return validateHwp5PageControlSources(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
  );
}
