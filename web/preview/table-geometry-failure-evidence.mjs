// Forward only source diagnostics for the exact table owner; never infer flags.
export function tableGeometryFailureEvidence(table, diagnostics = []) {
  if (!table || !Array.isArray(diagnostics)) return {};
  const matches = diagnostics.filter(
    (row) => row?.section === table.section && row?.tableNode === table.tableNode,
  );
  if (matches.length !== 1) return {};
  const row = matches[0],
    evidence = {};
  if (typeof row.error === "string") evidence.sourceError = row.error.slice(0, 256);
  for (const key of ["rawTableFlags", "unknownTableFlags"])
    if (Number.isInteger(row[key]) && row[key] >= 0 && row[key] <= 0xffffffff)
      evidence[key] = row[key];
  return evidence;
}
