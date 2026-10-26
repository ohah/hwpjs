function samePair(expected, current) {
  return (
    expected &&
    typeof expected === "object" &&
    !Array.isArray(expected) &&
    ["chart_path", "ole_path", "wrapper_node", "section_ordinal", "declared_external"].every(
      (key) => expected[key] === current[key],
    ) &&
    Array.isArray(expected.section_sha256) &&
    expected.section_sha256.length === current.section_sha256.length &&
    Array.from(expected.section_sha256).every((byte, i) => byte === current.section_sha256[i])
  );
}
// Compare the current native lease before making one atomic native call.
export function applyChartPointBatchCommand(editor, message) {
  const limits = editor.chartPointBatchLimits();
  if (
    !Number.isInteger(message.expectedRevision) ||
    message.expectedRevision < 0 ||
    message.expectedRevision >= 0xffffffff ||
    !Array.isArray(message.changes) ||
    message.changes.length > limits.maxEdits
  )
    throw new Error("InvalidChartBatchCommand");
  if (message.expectedRevision !== editor.historyRevision()) throw new Error("StaleChartBatch");
  const current = editor.chartPoints(message.section, message.wrapper);
  if (!samePair(message.expectedPair, current.pair)) throw new Error("StaleChartBatch");
  const edits = [];
  for (const change of message.changes) {
    if (
      !change ||
      !Number.isInteger(change.point) ||
      change.point < 0 ||
      typeof change.before !== "string" ||
      typeof change.value !== "string"
    )
      throw new Error("InvalidChartBatchCommand");
    if (current.values.points[change.point]?.value !== change.before)
      throw new Error("StaleChartBatch");
    edits.push({ point: change.point, value: change.value });
  }
  editor.setChartPoints(message.section, message.wrapper, edits);
}
